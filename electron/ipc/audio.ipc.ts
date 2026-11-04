import { catalogModel } from '../services/speech/model-catalog'
import { dialog } from 'electron'
import { z } from 'zod'
import { handle, onSend, zId, zText, UserFacingError } from './guard'
import { SEND } from '../../shared/channels'
import { EVT } from '../../shared/channels'
import type { AppContext } from '../main/app-context'

const MAX_WAV_BYTES = 16000 * 2 * 60 * 16 // ~16 minutes of 16 kHz mono PCM16

export function registerAudioIpc(ctx: AppContext) {
  const target = z.object({ target: z.enum(['auto', 'editor', 'external', 'preview']).optional() }).optional()

  handle('dictation:start', z.tuple([target]), (_e, o) => ctx.dictation.start({ activation: 'manual', target: o?.target ?? 'auto' }))
  handle('dictation:stop', z.tuple([]), () => ctx.dictation.stop())
  handle('dictation:cancel', z.tuple([]), () => ctx.dictation.cancel())
  handle('dictation:toggle', z.tuple([target]), (_e, o) => ctx.dictation.toggle({ target: o?.target ?? 'auto' }))
  handle('dictation:state', z.tuple([]), () => ctx.dictation.getState())
  handle('dictation:pick', z.tuple([z.number().int().min(0).max(2)]), (_e, i) => ctx.dictation.choosePick(i))
  handle('dictation:pasteLast', z.tuple([]), () => ctx.dictation.pasteLast())
  handle('dictation:reprocess', z.tuple([zId, z.enum(['raw', 'correct', 'professional'])]), (_e, id, mode) => ctx.dictation.reprocess(id, mode))

  onSend(SEND.editorFocus, z.boolean(), (e, focused) => {
    if (e.sender === ctx.mainWindow?.webContents) ctx.editorFocused = focused
  })

  // Recorder (overlay window) → main
  handle('recorder:submit', z.tuple([z.string().max(64), z.instanceof(ArrayBuffer).or(z.instanceof(Uint8Array)), z.object({ durationMs: z.number().min(0), peak: z.number().min(0), rms: z.number().min(0), index: z.number().int().min(0).max(10_000), final: z.boolean() })]), async (e, sessionId, wav, meta) => {
    if (e.sender !== ctx.overlayWindow?.webContents) throw new UserFacingError('Only the recorder may submit audio')
    const buf = Buffer.from(wav instanceof ArrayBuffer ? new Uint8Array(wav) : wav)
    if (buf.length > MAX_WAV_BYTES) throw new UserFacingError('Recording is too long')
    if (buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new UserFacingError('Invalid audio')
    void ctx.dictation.receiveAudio(sessionId, buf, meta)
  })
  onSend(SEND.recorderError, z.object({ sessionId: z.string().max(64), code: z.enum(['mic-unavailable', 'mic-permission', 'no-audio']), message: zText(500) }), (e, p) => {
    if (e.sender === ctx.overlayWindow?.webContents) ctx.dictation.recorderError(p.sessionId, p.code, p.message)
  })
  onSend(SEND.recorderReady, z.string().max(64), (e, id) => {
    if (e.sender === ctx.overlayWindow?.webContents) ctx.dictation.recorderReady(id)
  })
  let lastLevel = 0
  onSend(SEND.recorderLevel, z.number().min(0).max(1), (e, level) => {
    if (e.sender !== ctx.overlayWindow?.webContents) return
    const now = Date.now()
    if (now - lastLevel < 45) return // ~22 fps to the main window is plenty
    lastLevel = now
    if (ctx.mainWindow && !ctx.mainWindow.isDestroyed() && ctx.mainWindow.isVisible()) ctx.mainWindow.webContents.send(EVT.dictationLevel, level)
  })
  onSend(SEND.recorderCancel, z.undefined().or(z.null()), (e) => {
    if (e.sender === ctx.overlayWindow?.webContents) ctx.dictation.cancel()
  })

  // Local models / whisper.cpp
  handle('models:catalog', z.tuple([]), () => ctx.localSpeech.catalog())
  handle('models:download', z.tuple([z.string().max(64)]), async (_e, id) => {
    const r = await ctx.localSpeech.download(id)
    // A language model is loaded right away, so the first dictation in that language is fast.
    const lang = catalogModel(id)?.language
    if (r.ok && lang) void ctx.speechProvider(lang).then((p) => p.prewarm?.()).catch(() => undefined)
    return r
  })
  handle('models:cancel', z.tuple([z.string().max(64)]), (_e, id) => ctx.localSpeech.cancel(id))
  handle('models:remove', z.tuple([z.string().max(64)]), (_e, id) => ctx.localSpeech.remove(id))
  handle('models:binaryStatus', z.tuple([]), () => ctx.localSpeech.binaryStatus())
  handle('models:installBinary', z.tuple([z.enum(['cpu', 'cuda']).optional()]), async (_e, v) => {
    const r = await ctx.localSpeech.installBinary(v ?? 'cpu')
    // Start the new engine now: the first GPU run compiles CUDA kernels once (several seconds),
    // which should happen here, not during the user's first dictation.
    if (r.ok) void ctx.speechProvider().then((p) => p.prewarm?.()).catch(() => undefined)
    return r
  })
  handle('models:engineInfo', z.tuple([]), () => ctx.engineInfo())
  handle('models:chooseBinary', z.tuple([]), async () => {
    const opts: Electron.OpenDialogOptions = {
      properties: ['openFile'],
      title: 'whisper-cli',
      filters: process.platform === 'win32' ? [{ name: 'whisper-cli', extensions: ['exe'] }] : []
    }
    const r = ctx.mainWindow ? await dialog.showOpenDialog(ctx.mainWindow, opts) : await dialog.showOpenDialog(opts)
    if (!r.canceled && r.filePaths[0]) await ctx.settings.update('recognition', { whisperBinaryPath: r.filePaths[0] })
    return ctx.localSpeech.binaryStatus()
  })
  handle('models:openFolder', z.tuple([]), async () => {
    const { shell } = await import('electron')
    await shell.openPath(ctx.paths.models)
  })

  // AI
  handle(
    'ai:assistant',
    z.tuple([
      z.object({
        action: z.enum(['fix', 'rewrite', 'translate', 'explain', 'shorten', 'expand', 'tone', 'continue', 'summarize', 'professional']),
        text: zText(100_000).min(1),
        context: zText(20_000).optional(),
        targetLanguage: z.string().max(8).optional(),
        tone: z.enum(['formal', 'friendly', 'neutral', 'persuasive', 'academic']).optional()
      })
    ]),
    async (_e, req) => {
      const { detectLanguages } = await import('../../shared/language-detect')
      return ctx.processor.assistant(req, detectLanguages(req.text).language)
    }
  )
  handle('ai:correct', z.tuple([zText(100_000), z.enum(['raw', 'correct', 'professional']), z.string().max(8).nullable()]), async (_e, text, mode, language) => {
    const out = await ctx.processor.process(text, mode, language, await ctx.dictionary.list())
    return out.status === 'failed' || out.status === 'not-configured' ? { ok: false, error: out.error, errorCode: out.errorCode } : { ok: true, text: out.final }
  })
}
