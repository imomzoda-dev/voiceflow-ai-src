import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Sparkles, Wand2, PenLine, Briefcase, Minimize2, Maximize2, Languages, ListChecks, BookOpen, Copy, ArrowDownToLine, Settings2 } from 'lucide-react'
import type { AssistantAction, ProviderRecord } from '@shared/types'
import { api } from '@/lib/utils'
import { useDictation, useSettings, useUi, toast } from '@/stores'
import { PageHeader, Card, Badge, EmptyState } from '@/components/ui/misc'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/form'
import { DiffView } from '@/components/common/DiffView'

const ACTIONS: { id: AssistantAction; icon: typeof Sparkles }[] = [
  { id: 'fix', icon: Wand2 },
  { id: 'rewrite', icon: PenLine },
  { id: 'professional', icon: Briefcase },
  { id: 'shorten', icon: Minimize2 },
  { id: 'expand', icon: Maximize2 },
  { id: 'translate', icon: Languages },
  { id: 'summarize', icon: ListChecks },
  { id: 'explain', icon: BookOpen }
]

/** Standalone text workspace for AI actions — useful for text dictated into the box or pasted from elsewhere. */
export function AssistantPage() {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)!
  const navigate = useUi((s) => s.navigate)
  const last = useDictation((s) => s.last)
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [input, setInput] = useState('')
  const [lang, setLang] = useState('en')
  const [busy, setBusy] = useState<AssistantAction | null>(null)
  const [result, setResult] = useState<{ action: AssistantAction; text: string; provider?: string; input: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void api().providers.list().then(setProviders)
  }, [])

  const providerId = settings.writing.assistantProviderId ?? settings.writing.correctionProviderId
  const provider = providers.find((p) => p.id === providerId)

  const run = async (action: AssistantAction) => {
    if (!input.trim()) return
    setBusy(action)
    setError(null)
    const r = await api().ai.assistant({ action, text: input, targetLanguage: action === 'translate' ? lang : undefined })
    setBusy(null)
    if (r.ok) setResult({ action, text: r.text ?? '', provider: r.providerName, input })
    else setError(r.errorCode ? t(`errors.${r.errorCode}`) : (r.error ?? t('errors.unknown')))
  }

  const diffable = result && ['fix', 'rewrite', 'professional', 'shorten', 'expand'].includes(result.action)

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[980px] px-8 pb-12 pt-8">
        <PageHeader title={t('assistant.playgroundTitle')} subtitle={t('assistant.playgroundSubtitle')} />
        {!provider ? (
          <Card>
            <EmptyState
              icon={Sparkles}
              title={t('assistant.notConfigured')}
              action={
                <Button variant="primary" onClick={() => navigate({ page: 'settings', section: 'providers' })}>
                  <Settings2 size={14} /> {t('assistant.configure')}
                </Button>
              }
            />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Card>
              <Textarea rows={14} value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('assistant.playgroundPlaceholder')} />
              <div className="mt-3 flex flex-wrap gap-1.5">
                {ACTIONS.map((a) => (
                  <Button key={a.id} size="sm" loading={busy === a.id} disabled={!!busy || !input.trim()} onClick={() => void run(a.id)}>
                    {busy !== a.id && <a.icon size={13} className="text-accent" />}
                    {t(`assistant.actions.${a.id}`)}
                  </Button>
                ))}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[12px] text-muted">
                {t('assistant.targetLanguage')}
                <Select
                  value={lang}
                  onChange={setLang}
                  options={[
                    { value: 'en', label: 'English' },
                    { value: 'ru', label: 'Русский' },
                    { value: 'tg', label: 'Тоҷикӣ' },
                    { value: 'uz', label: 'Oʻzbekcha' },
                    { value: 'tr', label: 'Türkçe' },
                    { value: 'ar', label: 'العربية' }
                  ]}
                />
                {last?.final && (
                  <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setInput(last.final)}>
                    <ArrowDownToLine size={13} /> {t('voice.lastResult')}
                  </Button>
                )}
              </div>
              <p className="mt-3 text-[11.5px] text-subtle">{t('assistant.privacyNote', { provider: provider.name })}</p>
            </Card>
            <Card>
              {error ? (
                <div className="text-[13px] text-danger">{error}</div>
              ) : result ? (
                <>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-fg">{t(`assistant.actions.${result.action}`)}</span>
                    {result.provider && <Badge>{t('assistant.via', { provider: result.provider })}</Badge>}
                  </div>
                  {diffable ? <DiffView before={result.input} after={result.text} /> : <div className="selectable whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg">{result.text}</div>}
                  <div className="mt-4 flex gap-1.5">
                    <Button size="sm" onClick={() => void navigator.clipboard.writeText(result.text).then(() => toast.success(t('common.copied')))}>
                      <Copy size={13} /> {t('common.copy')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setInput(result.text)}>
                      {t('assistant.useResult')}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="grid h-full min-h-[200px] place-items-center text-[12.5px] text-subtle">{t('assistant.subtitle')}</div>
              )}
            </Card>
          </div>
        )}
      </div>
    </div>
  )
}
