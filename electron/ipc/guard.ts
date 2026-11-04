/**
 * IPC hardening: every handler is registered through `handle()`, which
 *  1. verifies the sender frame belongs to one of our own windows/pages,
 *  2. validates the arguments with a zod tuple schema,
 *  3. converts thrown errors into a sanitised message (no stack traces to the UI).
 */
import { ipcMain, type IpcMainInvokeEvent, type WebFrameMain } from 'electron'
import { z } from 'zod'
import { createLogger } from '../main/logger'

const log = createLogger('ipc')

let trustedOrigins: string[] = []
let trustedFileRoot: string | null = null

export function configureTrust(opts: { devServerUrl?: string | null; rendererDir: string }) {
  trustedOrigins = []
  if (opts.devServerUrl) trustedOrigins.push(new URL(opts.devServerUrl).origin)
  trustedFileRoot = opts.rendererDir.replace(/\\/g, '/').toLowerCase()
}

export function isTrustedSender(frame: WebFrameMain | null | undefined): boolean {
  if (!frame) return false
  let url: URL
  try {
    url = new URL(frame.url)
  } catch {
    return false
  }
  if (url.protocol === 'file:') {
    if (!trustedFileRoot) return false
    const path = decodeURIComponent(url.pathname).replace(/^\/([a-zA-Z]:)/, '$1').toLowerCase()
    return path.startsWith(trustedFileRoot)
  }
  return trustedOrigins.includes(url.origin)
}

export class UserFacingError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message)
  }
}

/** Tuple of validated args with optionality removed (missing trailing args arrive as undefined). */
type Args<S extends z.ZodTuple> = z.infer<S> extends infer T extends unknown[] ? { [K in keyof T]-?: undefined extends T[K] ? T[K] | undefined : T[K] } : never
type Handler<A extends unknown[], R> = (event: IpcMainInvokeEvent, ...args: A) => Promise<R> | R

export function handle<S extends z.ZodTuple, R>(channel: string, schema: S, fn: Handler<Args<S>, R>) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!isTrustedSender(event.senderFrame)) {
      log.warn(`Rejected IPC from untrusted sender on ${channel}`, { url: event.senderFrame?.url })
      throw new Error('Untrusted sender')
    }
    const parsed = schema.safeParse(args)
    if (!parsed.success) {
      log.warn(`Invalid IPC payload on ${channel}`, { issues: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`) })
      throw new Error('Invalid request')
    }
    try {
      return await fn(event, ...(parsed.data as unknown as Args<S>))
    } catch (e) {
      if (e instanceof UserFacingError) throw new Error(e.message)
      log.error(`Handler ${channel} failed`, e)
      throw new Error('The operation failed. Details were written to the log file.')
    }
  })
}

export function onSend<S extends z.ZodTypeAny>(channel: string, schema: S, fn: (event: Electron.IpcMainEvent, payload: z.infer<S>) => void) {
  ipcMain.on(channel, (event, payload) => {
    if (!isTrustedSender(event.senderFrame)) return
    const parsed = schema.safeParse(payload)
    if (!parsed.success) return
    try {
      fn(event, parsed.data)
    } catch (e) {
      log.error(`Listener ${channel} failed`, e)
    }
  })
}

/* Common schemas */
export const zId = z.string().min(1).max(128)
export const zText = (max = 200_000) => z.string().max(max)
/** ProseMirror JSON: validated structurally (object with type) and bounded in size by the caller. */
export const zDocJson = z
  .looseObject({ type: z.string().max(64) })
  .refine((v) => JSON.stringify(v).length < 50_000_000, 'Document too large')
