import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { History as HistoryIcon, Search, Trash2, Copy, Download, ClipboardPaste, ChevronDown, Wand2 } from 'lucide-react'
import type { DictationRecord, HistoryQuery, ProcessingMode } from '@shared/types'
import { LANGUAGES, languageLabel } from '@shared/languages'
import { api, cn, errorMessage, formatDateTime, formatDuration } from '@/lib/utils'
import { useDictation, toast } from '@/stores'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Badge, EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog, Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/overlays'
import { DiffView } from '@/components/common/DiffView'

const PAGE = 50

export function HistoryPage() {
  const { t, i18n } = useTranslation()
  const lastId = useDictation((s) => s.last?.id)
  const [q, setQ] = useState<HistoryQuery>({})
  const [search, setSearch] = useState('')
  const [items, setItems] = useState<DictationRecord[] | null>(null)
  const [total, setTotal] = useState(0)
  const [open, setOpen] = useState<string | null>(null)
  const [confirmClear, setConfirmClear] = useState(false)

  const load = useCallback(
    async (offset = 0) => {
      const r = await api().history.list({ ...q, search, limit: PAGE, offset })
      setTotal(r.total)
      setItems((prev) => (offset === 0 ? r.items : [...(prev ?? []), ...r.items]))
    },
    [q, search]
  )

  useEffect(() => {
    const h = setTimeout(() => void load(0), search ? 200 : 0)
    return () => clearTimeout(h)
  }, [load, search, lastId])

  const remove = async (id: string) => {
    await api().history.remove(id)
    setItems((l) => l?.filter((i) => i.id !== id) ?? null)
    setTotal((n) => n - 1)
    toast.success(t('history.deleted'))
  }

  const reprocess = async (id: string, mode: ProcessingMode) => {
    const r = await api().dictation.reprocess(id, mode)
    if (r.ok) {
      toast.success(t('voice.correctionStatus.applied'))
      void load(0)
    } else toast.error(r.error ?? t('errors.provider-error'))
  }

  const copy = (text: string) => void navigator.clipboard.writeText(text).then(() => toast.success(t('common.copied')))

  const exportAs = async (format: 'json' | 'csv' | 'txt') => {
    try {
      const r = await api().history.export(format)
      if (r.ok) toast.success(r.path ?? '')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[980px] px-8 pb-12 pt-8">
        <PageHeader
          title={t('history.title')}
          subtitle={t('history.subtitle')}
          actions={
            <>
              <Menu>
                <MenuTrigger asChild>
                  <Button>
                    <Download size={14} /> {t('common.export')} <ChevronDown size={13} />
                  </Button>
                </MenuTrigger>
                <MenuContent>
                  {(['csv', 'json', 'txt'] as const).map((f) => (
                    <MenuItem key={f} onSelect={() => void exportAs(f)}>
                      {t('history.exportAs', { format: f.toUpperCase() })}
                    </MenuItem>
                  ))}
                </MenuContent>
              </Menu>
              <Button variant="danger-ghost" disabled={!total} onClick={() => setConfirmClear(true)}>
                <Trash2 size={14} /> {t('history.clearAll')}
              </Button>
            </>
          }
        />
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[220px] flex-1">
            <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-subtle" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="pl-8" />
          </div>
          <Select
            value={q.language ?? '__all'}
            onChange={(v) => setQ((o) => ({ ...o, language: v === '__all' ? null : v }))}
            label={t('history.filterLanguage')}
            options={[{ value: '__all', label: t('history.allLanguages') }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.native }))]}
          />
          <Select
            value={q.status ?? '__all'}
            onChange={(v) => setQ((o) => ({ ...o, status: v === '__all' ? null : (v as DictationRecord['status']) }))}
            label={t('history.filterStatus')}
            options={[{ value: '__all', label: t('history.allStatuses') }, ...(['success', 'error', 'command'] as const).map((s) => ({ value: s, label: t(`history.statuses.${s}`) }))]}
          />
        </div>

        {items === null ? null : items.length === 0 ? (
          <EmptyState icon={HistoryIcon} title={t('history.empty')} hint={t('history.emptyHint')} />
        ) : (
          <>
            <div className="mb-2 text-[12px] text-subtle">{t('history.results', { count: total })}</div>
            <div className="flex flex-col gap-2">
              {items.map((r) => {
                const expanded = open === r.id
                const changed = r.correctedText && r.correctedText !== r.originalText
                return (
                  <div key={r.id} className="rounded-[12px] border border-border bg-surface shadow-soft">
                    <button className="flex w-full items-start gap-3 px-4 py-3 text-left" onClick={() => setOpen(expanded ? null : r.id)} aria-expanded={expanded}>
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
                          <span>{formatDateTime(r.startedAt, i18n.language)}</span>
                          <span>·</span>
                          <span>{formatDuration(r.durationMs)}</span>
                          {r.language && <Badge tone="accent">{languageLabel(r.language)}</Badge>}
                          <Badge tone={r.status === 'success' ? 'success' : r.status === 'error' ? 'danger' : 'neutral'}>{t(`history.statuses.${r.status}`)}</Badge>
                          <Badge>{t(`modes.${r.mode}`)}</Badge>
                        </div>
                        <div className={cn('selectable text-[13.5px] leading-relaxed text-fg', !expanded && 'line-clamp-2')}>{r.finalText || r.originalText || (r.error ? t(`errors.${r.error}`, { defaultValue: r.error }) : '—')}</div>
                      </div>
                      <ChevronDown size={15} className={cn('mt-1 shrink-0 text-subtle transition', expanded && 'rotate-180')} />
                    </button>
                    {expanded && (
                      <div className="border-t border-border px-4 py-3">
                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                          <div>
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{t('history.original')}</div>
                            <div className="selectable whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{r.originalText || '—'}</div>
                          </div>
                          <div>
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-subtle">{changed ? t('history.showDiff') : t('history.final')}</div>
                            {changed ? <DiffView before={r.originalText} after={r.finalText} /> : <div className="selectable whitespace-pre-wrap text-[13px] leading-relaxed text-fg">{r.finalText || '—'}</div>}
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-subtle">
                          <span>
                            {t('history.provider')}: {r.speechProvider}
                            {r.speechModel ? ` · ${r.speechModel}` : ''}
                          </span>
                          <span>·</span>
                          <span>
                            {t('history.target')}: {t(`history.targets.${r.target}`, { defaultValue: r.target })}
                          </span>
                          <div className="ml-auto flex gap-1">
                            <Button size="sm" variant="ghost" onClick={() => copy(r.finalText)}>
                              <Copy size={13} /> {t('common.copy')}
                            </Button>
                            {r.originalText && (
                              <Menu>
                                <MenuTrigger asChild>
                                  <Button size="sm" variant="ghost">
                                    <Wand2 size={13} /> {t('voice.reprocess')}
                                  </Button>
                                </MenuTrigger>
                                <MenuContent>
                                  {(['raw', 'correct', 'professional'] as const).map((m) => (
                                    <MenuItem key={m} onSelect={() => void reprocess(r.id, m)}>
                                      {t(`modes.${m}`)}
                                    </MenuItem>
                                  ))}
                                </MenuContent>
                              </Menu>
                            )}
                            <Button size="sm" variant="ghost" onClick={() => copy(r.originalText)}>
                              <ClipboardPaste size={13} /> {t('history.original')}
                            </Button>
                            <Button size="sm" variant="danger-ghost" onClick={() => void remove(r.id)}>
                              <Trash2 size={13} />
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            {items.length < total && (
              <div className="mt-4 flex justify-center">
                <Button onClick={() => void load(items.length)}>{t('common.next')}</Button>
              </div>
            )}
          </>
        )}
      </div>

      <Dialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title={t('history.clearConfirm', { count: total })}
        description={t('common.cannotUndo')}
        footer={
          <>
            <Button onClick={() => setConfirmClear(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={async () => {
                await api().history.clear()
                setConfirmClear(false)
                toast.success(t('history.cleared'))
                void load(0)
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
