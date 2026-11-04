import { z } from 'zod'
import { handle, zId } from './guard'
import { sectionSchemas, type SettingsSection } from '../../shared/settings'
import type { AppContext } from '../main/app-context'

const sectionNames = Object.keys(sectionSchemas) as [SettingsSection, ...SettingsSection[]]

export function registerSettingsIpc(ctx: AppContext) {
  handle('settings:get', z.tuple([]), () => ctx.settings.get())
  handle('settings:update', z.tuple([z.enum(sectionNames), z.record(z.string(), z.unknown())]), async (_e, section, patch) => {
    // SettingsService validates the merged section with its zod schema.
    const r = await ctx.settings.update(section, patch as never)
    // A model's first GPU run compiles CUDA kernels once: do it when the model is chosen, not mid-dictation.
    if (section === 'recognition' && 'whisperModel' in patch && ctx.localSpeech.gpuBinary()) {
      void ctx.speechProvider().then((p) => p.prewarm?.()).catch(() => undefined)
    }
    return r
  })

  handle('providers:list', z.tuple([]), () => ctx.providers.list())
  handle(
    'providers:upsert',
    z.tuple([
      z.object({
        id: zId.optional(),
        name: z.string().min(1).max(120),
        kind: z.enum(['openai-compatible', 'anthropic']),
        preset: z.string().max(64),
        baseUrl: z.string().min(1).max(2048),
        chatModel: z.string().max(256).nullable(),
        transcriptionModel: z.string().max(256).nullable(),
        supportsTranscription: z.boolean(),
        supportsChat: z.boolean(),
        apiKey: z.string().max(4096).optional()
      })
    ]),
    (_e, p) => ctx.providers.upsert(p)
  )
  handle('providers:remove', z.tuple([zId]), async (_e, id) => {
    await ctx.providers.remove(id)
    const s = ctx.settings.get()
    // Don't leave settings pointing at a deleted provider.
    if (s.recognition.speechProviderId === id) await ctx.settings.update('recognition', { speechProviderId: 'whisper-cpp' })
    const w: Partial<typeof s.writing> = {}
    if (s.writing.correctionProviderId === id) w.correctionProviderId = null
    if (s.writing.assistantProviderId === id) w.assistantProviderId = null
    if (Object.keys(w).length) await ctx.settings.update('writing', w)
  })
  handle('providers:test', z.tuple([zId]), (_e, id) => ctx.providers.test(id))

  handle('dictionary:list', z.tuple([]), () => ctx.dictionary.list())
  handle(
    'dictionary:upsert',
    z.tuple([
      z.object({
        id: zId.optional(),
        original: z.string().max(300),
        preferred: z.string().min(1).max(300),
        language: z.string().max(8).nullable(),
        alias: z.string().max(1000).nullable(),
        category: z.string().max(64)
      })
    ]),
    (_e, e) => ctx.dictionary.upsert(e)
  )
  handle('dictionary:remove', z.tuple([zId]), (_e, id) => ctx.dictionary.remove(id))
}
