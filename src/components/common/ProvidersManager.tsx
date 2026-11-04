import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, Plug, Pencil, Trash2, CheckCircle2, XCircle, CircleDashed, ExternalLink, KeyRound, Server } from 'lucide-react'
import type { ProviderInput, ProviderRecord } from '@shared/types'
import { PROVIDER_PRESETS, presetById } from '@shared/provider-presets'
import { api, errorMessage, relativeTime } from '@/lib/utils'
import { toast } from '@/stores'
import { Button } from '@/components/ui/button'
import { Field, Input, Select, Switch } from '@/components/ui/form'
import { Badge, EmptyState } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlays'

type Draft = ProviderInput & { hasKey?: boolean }

function draftFromPreset(id: string): Draft {
  const p = presetById(id)!
  return {
    name: p.name,
    kind: p.kind,
    preset: p.id,
    baseUrl: p.baseUrl,
    chatModel: p.suggestedChatModels[0] ?? null,
    transcriptionModel: p.suggestedTranscriptionModels[0] ?? null,
    supportsChat: p.supportsChat,
    supportsTranscription: p.supportsTranscription,
    apiKey: ''
  }
}

export function ProvidersManager({ onChange }: { onChange?: () => void }) {
  const { t, i18n } = useTranslation()
  const [list, setList] = useState<ProviderRecord[] | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [models, setModels] = useState<string[]>([])
  const [testing, setTesting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState<ProviderRecord | null>(null)
  const isMac = navigator.userAgent.includes('Mac')

  const load = () => void api().providers.list().then((l) => {
    setList(l)
    onChange?.()
  })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(load, [])

  const save = async (andTest = false) => {
    if (!draft) return
    setSaving(true)
    try {
      const { hasKey: _h, ...input } = draft
      // Empty key field on an existing provider means "keep current key".
      const payload: ProviderInput = { ...input, apiKey: draft.id && !draft.apiKey ? undefined : draft.apiKey }
      const rec = await api().providers.upsert(payload)
      setDraft(null)
      load()
      if (andTest) await test(rec.id)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const test = async (id: string) => {
    setTesting(id)
    const r = await api().providers.test(id)
    setTesting(null)
    if (r.ok) toast.success(r.message)
    else toast.error(r.message)
    if (r.models) setModels(r.models)
    load()
  }

  const loadModels = async () => {
    if (!draft) return
    if (!draft.id) return save(true)
    const r = await api().providers.test(draft.id)
    if (r.ok && r.models) setModels(r.models)
    else toast.error(r.message)
  }

  const preset = draft ? presetById(draft.preset) : undefined

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-[12.5px] leading-relaxed text-muted">{t('settings.providers.subtitle', { store: isMac ? 'macOS Keychain' : 'Windows DPAPI' })}</p>
        <Button
          variant="primary"
          onClick={() => {
            setModels([])
            setDraft(draftFromPreset('openai'))
          }}
        >
          <Plus size={14} /> {t('settings.providers.add')}
        </Button>
      </div>

      {list && list.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border-strong">
          <EmptyState icon={Plug} title={t('settings.providers.empty')} hint={t('settings.providers.emptyHint')} className="py-8" />
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {list?.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-[12px] border border-border bg-surface px-3.5 py-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] bg-surface-2 text-muted">{p.isLocal ? <Server size={16} /> : <Plug size={16} />}</div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium text-fg">
                  {p.name}
                  {p.isLocal && <Badge>{t('settings.providers.localBadge')}</Badge>}
                  {p.supportsTranscription && <Badge tone="accent">{t('settings.providers.roleSpeech')}</Badge>}
                  {p.supportsChat && <Badge tone="accent">{t('settings.providers.roleText')}</Badge>}
                  {!p.isLocal && !p.hasKey && (
                    <Badge tone="warning">
                      <KeyRound size={10} /> {t('settings.providers.apiKey')}
                    </Badge>
                  )}
                </div>
                <div className="mt-0.5 truncate text-[11.5px] text-muted">
                  {p.baseUrl}
                  {p.chatModel ? ` · ${p.chatModel}` : ''}
                  {p.transcriptionModel ? ` · ${p.transcriptionModel}` : ''}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5 text-[11.5px]">
                {p.lastTestOk === true ? (
                  <span className="flex items-center gap-1 text-success" title={p.lastTestMessage ?? ''}>
                    <CheckCircle2 size={13} /> {t('settings.providers.connected')}
                  </span>
                ) : p.lastTestOk === false ? (
                  <span className="flex items-center gap-1 text-danger" title={p.lastTestMessage ?? ''}>
                    <XCircle size={13} /> {t('settings.providers.failed')}
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-subtle">
                    <CircleDashed size={13} /> {t('settings.providers.untested')}
                  </span>
                )}
                {p.lastTestAt && <span className="text-subtle">· {relativeTime(p.lastTestAt, i18n.language)}</span>}
              </div>
              <Button size="sm" loading={testing === p.id} onClick={() => void test(p.id)}>
                {t('settings.providers.test')}
              </Button>
              <Button
                size="icon-sm"
                variant="ghost"
                onClick={() => {
                  setModels([])
                  setDraft({ id: p.id, name: p.name, kind: p.kind, preset: p.preset, baseUrl: p.baseUrl, chatModel: p.chatModel, transcriptionModel: p.transcriptionModel, supportsChat: p.supportsChat, supportsTranscription: p.supportsTranscription, apiKey: '', hasKey: p.hasKey })
                }}
                aria-label={t('common.edit')}
              >
                <Pencil size={13} />
              </Button>
              <Button size="icon-sm" variant="danger-ghost" onClick={() => setConfirm(p)} aria-label={t('common.delete')}>
                <Trash2 size={13} />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Dialog
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title={draft?.id ? t('settings.providers.edit') : t('settings.providers.add')}
        className="w-[min(580px,94vw)]"
        footer={
          <>
            <Button onClick={() => setDraft(null)}>{t('common.cancel')}</Button>
            <Button loading={saving} onClick={() => void save(true)}>
              {t('settings.providers.test')}
            </Button>
            <Button variant="primary" loading={saving} onClick={() => void save(false)}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {draft && (
          <div className="flex flex-col">
            {!draft.id && (
              <Field label={t('settings.providers.preset')}>
                <Select className="w-full" value={draft.preset} onChange={(v) => setDraft(draftFromPreset(v))} options={PROVIDER_PRESETS.map((p) => ({ value: p.id, label: p.name }))} />
              </Field>
            )}
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('settings.providers.name')}>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <Field label={t('settings.providers.endpoint')}>
                <Input value={draft.baseUrl} onChange={(e) => setDraft({ ...draft, baseUrl: e.target.value })} spellCheck={false} />
              </Field>
            </div>
            <Field
              label={t('settings.providers.apiKey')}
              hint={
                preset?.docsUrl ? (
                  <button type="button" className="inline-flex items-center gap-1 text-accent hover:underline" onClick={() => void api().system.openExternal(preset.docsUrl)}>
                    {t('settings.providers.getKey')} <ExternalLink size={11} />
                  </button>
                ) : undefined
              }
            >
              <Input
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={draft.apiKey ?? ''}
                placeholder={draft.hasKey ? t('settings.providers.apiKeySaved') : preset && !preset.needsKey ? t('settings.providers.apiKeyNone') : 'sk-…'}
                onChange={(e) => setDraft({ ...draft, apiKey: e.target.value })}
              />
            </Field>
            {draft.hasKey && (
              <button type="button" className="-mt-1 mb-1 self-start text-[11.5px] text-danger hover:underline" onClick={() => void api().providers.upsert({ ...draft, apiKey: '' }).then(() => setDraft({ ...draft, hasKey: false }))}>
                {t('settings.providers.removeKey')}
              </button>
            )}
            <div className="mt-1 grid grid-cols-2 gap-3">
              <div className="rounded-[10px] border border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px] font-medium text-fg">
                  {t('settings.providers.supportsChat')}
                  <Switch checked={draft.supportsChat} onCheckedChange={(v) => setDraft({ ...draft, supportsChat: v })} />
                </div>
                <Input list="vf-chat-models" disabled={!draft.supportsChat} value={draft.chatModel ?? ''} placeholder={t('settings.providers.chatModel')} onChange={(e) => setDraft({ ...draft, chatModel: e.target.value })} spellCheck={false} />
              </div>
              <div className="rounded-[10px] border border-border p-3">
                <div className="mb-2 flex items-center justify-between gap-2 text-[12.5px] font-medium text-fg">
                  {t('settings.providers.supportsTranscription')}
                  <Switch checked={draft.supportsTranscription} onCheckedChange={(v) => setDraft({ ...draft, supportsTranscription: v })} disabled={draft.kind === 'anthropic'} />
                </div>
                <Input list="vf-stt-models" disabled={!draft.supportsTranscription} value={draft.transcriptionModel ?? ''} placeholder={t('settings.providers.transcriptionModel')} onChange={(e) => setDraft({ ...draft, transcriptionModel: e.target.value })} spellCheck={false} />
              </div>
            </div>
            <datalist id="vf-chat-models">
              {[...new Set([...(preset?.suggestedChatModels ?? []), ...models])].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <datalist id="vf-stt-models">
              {[...new Set([...(preset?.suggestedTranscriptionModels ?? []), ...models.filter((m) => /whisper|transcri/i.test(m))])].map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[11.5px] text-subtle">{t('settings.providers.httpsOnly')}</span>
              {draft.id && (
                <Button size="sm" variant="ghost" onClick={() => void loadModels()}>
                  {t('settings.providers.loadModels')}
                </Button>
              )}
            </div>
          </div>
        )}
      </Dialog>

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={t('settings.providers.deleteConfirm', { name: confirm?.name ?? '' })}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (confirm) await api().providers.remove(confirm.id)
                setConfirm(null)
                load()
              }}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  )
}
