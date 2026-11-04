/**
 * AI Assistant side panel. Sends only the selected text (or current paragraph) plus a short
 * context window, and ALWAYS shows the suggestion for review before anything is applied.
 */
import { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AnimatePresence, motion } from 'motion/react'
import type { Editor } from '@tiptap/core'
import { Sparkles, Wand2, Languages, BookOpen, Minimize2, Maximize2, MessageSquareQuote, PenLine, ListChecks, Briefcase, X, Copy, RotateCcw, Check, Settings2 } from 'lucide-react'
import type { AssistantAction, AssistantRequest, ProviderRecord } from '@shared/types'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form'
import { Badge } from '@/components/ui/misc'
import { DiffView } from '@/components/common/DiffView'
import { api, cn } from '@/lib/utils'
import { useSettings, useUi, toast } from '@/stores'
import { currentParagraphRange, insertParagraphsAfter, replaceRangeWithText } from './editor-commands'

const ACTIONS: { id: AssistantAction; icon: typeof Sparkles }[] = [
  { id: 'fix', icon: Wand2 },
  { id: 'rewrite', icon: PenLine },
  { id: 'professional', icon: Briefcase },
  { id: 'shorten', icon: Minimize2 },
  { id: 'expand', icon: Maximize2 },
  { id: 'translate', icon: Languages },
  { id: 'tone', icon: MessageSquareQuote },
  { id: 'summarize', icon: ListChecks },
  { id: 'explain', icon: BookOpen },
  { id: 'continue', icon: Sparkles }
]

const INSERT_BELOW: AssistantAction[] = ['explain', 'summarize', 'continue']

export interface AiPanelHandle {
  run(action: AssistantAction, opts?: { targetLanguage?: string; range?: { from: number; to: number } }): void
}

interface Pending {
  action: AssistantAction
  range: { from: number; to: number }
  original: string
  result: string | null
  error: string | null
  errorCode?: string
  loading: boolean
  provider?: string
}

export const AiPanel = forwardRef<AiPanelHandle, { editor: Editor; docId: string; onClose: () => void }>(function AiPanel({ editor, docId, onClose }, ref) {
  const { t } = useTranslation()
  const settings = useSettings((s) => s.settings)!
  const navigate = useUi((s) => s.navigate)
  const [providers, setProviders] = useState<ProviderRecord[]>([])
  const [targetLanguage, setTargetLanguage] = useState('en')
  const [tone, setTone] = useState<NonNullable<AssistantRequest['tone']>>('formal')
  const [pending, setPending] = useState<Pending | null>(null)
  const [selection, setSelection] = useState('')

  useEffect(() => {
    void api().providers.list().then(setProviders)
  }, [])

  useEffect(() => {
    const update = () => {
      const { from, to, empty } = editor.state.selection
      setSelection(empty ? '' : editor.state.doc.textBetween(from, to, '\n\n'))
    }
    update()
    editor.on('selectionUpdate', update)
    return () => {
      editor.off('selectionUpdate', update)
    }
  }, [editor])

  const providerId = settings.writing.assistantProviderId ?? settings.writing.correctionProviderId
  const provider = providers.find((p) => p.id === providerId)

  const run = async (action: AssistantAction, opts: { targetLanguage?: string; range?: { from: number; to: number } } = {}) => {
    const sel = editor.state.selection
    const range = opts.range ?? (sel.empty ? currentParagraphRange(editor) : { from: sel.from, to: sel.to })
    const original = editor.state.doc.textBetween(range.from, range.to, '\n\n')
    if (!original.trim()) return
    const docSize = editor.state.doc.content.size
    const before = editor.state.doc.textBetween(Math.max(0, range.from - 1200), range.from, '\n\n')
    const after = editor.state.doc.textBetween(range.to, Math.min(docSize, range.to + 600), '\n\n')
    setPending({ action, range, original, result: null, error: null, loading: true })
    const res = await api().ai.assistant({
      action,
      text: original,
      context: `${before}\n[…]\n${after}`.trim().length > 6 ? `${before}\n[…]\n${after}` : undefined,
      targetLanguage: action === 'translate' ? (opts.targetLanguage ?? targetLanguage) : undefined,
      tone: action === 'tone' ? tone : undefined
    })
    setPending((p) => (p && p.original === original ? { ...p, loading: false, result: res.ok ? (res.text ?? '') : null, error: res.ok ? null : (res.error ?? t('errors.unknown')), errorCode: res.errorCode, provider: res.providerName } : p))
  }

  useImperativeHandle(ref, () => ({ run: (a, o) => void run(a, o) }))

  const accept = async () => {
    if (!pending?.result) return
    await api().documents.snapshot(docId, 'ai').catch(() => undefined)
    const stillThere = editor.state.doc.textBetween(pending.range.from, Math.min(pending.range.to, editor.state.doc.content.size), '\n\n') === pending.original
    if (INSERT_BELOW.includes(pending.action)) insertParagraphsAfter(editor, pending.range.to, pending.result)
    else if (stillThere) replaceRangeWithText(editor, pending.range, pending.result)
    else replaceRangeWithText(editor, { from: editor.state.selection.from, to: editor.state.selection.to }, pending.result)
    toast.success(t('assistant.applied'))
    setPending(null)
  }

  const showDiff = pending && pending.result && !INSERT_BELOW.includes(pending.action) && pending.action !== 'translate'

  return (
    <motion.aside
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: 340, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ type: 'spring', stiffness: 420, damping: 40 }}
      className="h-full shrink-0 overflow-hidden border-l border-border bg-surface"
    >
      <div className="flex h-full w-[340px] flex-col">
        <div className="flex h-[44px] items-center justify-between border-b border-border px-4">
          <div className="flex items-center gap-2 text-[13px] font-semibold text-fg">
            <Sparkles size={15} className="text-accent" />
            {t('assistant.title')}
          </div>
          <button className="grid h-7 w-7 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" onClick={onClose} aria-label={t('common.close')}>
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {!provider ? (
            <div className="rounded-[12px] border border-dashed border-border-strong p-4 text-center">
              <div className="text-[13px] text-muted">{t('assistant.notConfigured')}</div>
              <Button className="mt-3" variant="soft" size="sm" onClick={() => navigate({ page: 'settings', section: 'providers' })}>
                <Settings2 size={14} /> {t('assistant.configure')}
              </Button>
            </div>
          ) : (
            <>
              <div className="mb-3 rounded-[10px] bg-surface-2 px-3 py-2">
                <div className="text-[11px] font-medium uppercase tracking-wide text-subtle">{t('assistant.selection')}</div>
                <div className="mt-1 line-clamp-4 text-[12.5px] leading-relaxed text-fg">{selection || <span className="text-muted">{t('assistant.noSelection')}</span>}</div>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {ACTIONS.map((a) => (
                  <button
                    key={a.id}
                    disabled={pending?.loading}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => void run(a.id)}
                    className="flex h-9 items-center gap-2 rounded-[9px] border border-border px-2.5 text-left text-[12.5px] font-medium text-fg transition hover:border-accent/40 hover:bg-accent-soft disabled:opacity-50"
                  >
                    <a.icon size={14} className="shrink-0 text-accent" />
                    <span className="truncate">{t(`assistant.actions.${a.id}`)}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[11.5px] text-muted">
                  {t('assistant.targetLanguage')}
                  <Select
                    className="mt-1 w-full min-w-0"
                    value={targetLanguage}
                    onChange={setTargetLanguage}
                    options={[
                      { value: 'en', label: 'English' },
                      { value: 'ru', label: 'Русский' },
                      { value: 'tg', label: 'Тоҷикӣ' },
                      { value: 'uz', label: 'Oʻzbekcha' },
                      { value: 'tr', label: 'Türkçe' },
                      { value: 'ar', label: 'العربية' },
                      { value: 'fa', label: 'فارسی' },
                      { value: 'de', label: 'Deutsch' },
                      { value: 'fr', label: 'Français' }
                    ]}
                  />
                </label>
                <label className="text-[11.5px] text-muted">
                  {t('assistant.tone')}
                  <Select className="mt-1 w-full min-w-0" value={tone} onChange={(v) => setTone(v as typeof tone)} options={(['formal', 'friendly', 'neutral', 'persuasive', 'academic'] as const).map((x) => ({ value: x, label: t(`assistant.tones.${x}`) }))} />
                </label>
              </div>
              <p className="mt-3 text-[11.5px] leading-snug text-subtle">{t('assistant.privacyNote', { provider: provider.name })}</p>
            </>
          )}

          <AnimatePresence>
            {pending && (
              <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-4 rounded-[12px] border border-border bg-bg p-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-fg">{t(`assistant.actions.${pending.action}`)}</span>
                  {pending.provider && <Badge>{t('assistant.via', { provider: pending.provider })}</Badge>}
                </div>
                {pending.loading ? (
                  <div className="flex flex-col gap-2 py-2">
                    <div className="text-[12px] text-muted">{t('assistant.working')}</div>
                    <div className="vf-shimmer h-2 rounded-full" />
                    <div className="vf-shimmer h-2 w-3/4 rounded-full" />
                  </div>
                ) : pending.error ? (
                  <div className="text-[12.5px] text-danger">{pending.errorCode ? t(`errors.${pending.errorCode}`) : pending.error}</div>
                ) : showDiff ? (
                  <DiffView before={pending.original} after={pending.result!} className="max-h-[320px] overflow-y-auto" />
                ) : (
                  <div className="selectable max-h-[320px] overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{pending.result}</div>
                )}
                {!pending.loading && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {pending.result && (
                      <Button size="sm" variant="primary" onClick={() => void accept()}>
                        <Check size={13} /> {INSERT_BELOW.includes(pending.action) ? t('assistant.insertBelow') : t('assistant.replace')}
                      </Button>
                    )}
                    <Button size="sm" onClick={() => void run(pending.action, { range: pending.range })}>
                      <RotateCcw size={13} /> {t('common.retry')}
                    </Button>
                    {pending.result && (
                      <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard.writeText(pending.result!).then(() => toast.success(t('common.copied')))}>
                        <Copy size={13} />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className={cn('ml-auto')} onClick={() => setPending(null)}>
                      {t('common.reject')}
                    </Button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </motion.aside>
  )
})
