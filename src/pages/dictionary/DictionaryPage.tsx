import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BookA, Plus, Pencil, Trash2, Search, Info } from 'lucide-react'
import type { DictionaryEntry } from '@shared/types'
import { applyDictionary } from '@shared/dictionary'
import { LANGUAGES, languageLabel } from '@shared/languages'
import { api, errorMessage } from '@/lib/utils'
import { toast } from '@/stores'
import { Button } from '@/components/ui/button'
import { Field, Input, Select } from '@/components/ui/form'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui/misc'
import { Dialog } from '@/components/ui/overlays'
import { DiffView } from '@/components/common/DiffView'

const CATEGORIES = ['name', 'surname', 'company', 'project', 'term', 'technical', 'phrase'] as const
type Draft = Omit<DictionaryEntry, 'id'> & { id?: string }
const empty: Draft = { original: '', preferred: '', language: null, alias: null, category: 'term' }

export function DictionaryPage() {
  const { t } = useTranslation()
  const [entries, setEntries] = useState<DictionaryEntry[] | null>(null)
  const [edit, setEdit] = useState<Draft | null>(null)
  const [search, setSearch] = useState('')
  const [sample, setSample] = useState('')

  const load = () => void api().dictionary.list().then(setEntries)
  useEffect(load, [])

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase()
    return (entries ?? []).filter((e) => !q || [e.original, e.preferred, e.alias ?? ''].some((v) => v.toLocaleLowerCase().includes(q)))
  }, [entries, search])

  const preview = useMemo(() => (sample && entries ? applyDictionary(sample, entries, null).text : ''), [sample, entries])

  const save = async () => {
    if (!edit?.preferred.trim()) return
    try {
      await api().dictionary.upsert(edit)
      setEdit(null)
      toast.success(t('dictionary.saved'))
      load()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-[980px] px-8 pb-12 pt-8">
        <PageHeader
          title={t('dictionary.title')}
          subtitle={t('dictionary.subtitle')}
          actions={
            <Button variant="primary" onClick={() => setEdit({ ...empty })}>
              <Plus size={15} /> {t('dictionary.add')}
            </Button>
          }
        />
        <div className="mb-4 flex items-start gap-2.5 rounded-[12px] bg-accent-soft px-3.5 py-2.5 text-[12.5px] leading-relaxed text-fg">
          <Info size={15} className="mt-0.5 shrink-0 text-accent" />
          {t('dictionary.explain')}
        </div>

        {entries && entries.length === 0 ? (
          <Card>
            <EmptyState
              icon={BookA}
              title={t('dictionary.empty')}
              hint={t('dictionary.emptyHint')}
              action={
                <Button variant="primary" onClick={() => setEdit({ ...empty })}>
                  <Plus size={15} /> {t('dictionary.add')}
                </Button>
              }
            />
          </Card>
        ) : (
          <>
            <div className="relative mb-3">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-subtle" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="pl-8" />
            </div>
            <Card padded={false} className="overflow-hidden">
              <table className="w-full text-left text-[13px]">
                <thead className="bg-surface-2 text-[11.5px] uppercase tracking-wide text-subtle">
                  <tr>
                    <th className="px-4 py-2 font-semibold">{t('dictionary.preferred')}</th>
                    <th className="px-4 py-2 font-semibold">{t('dictionary.original')}</th>
                    <th className="px-4 py-2 font-semibold">{t('dictionary.language')}</th>
                    <th className="px-4 py-2 font-semibold">{t('dictionary.category')}</th>
                    <th className="w-[90px]" />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => (
                    <tr key={e.id} className="group border-t border-border">
                      <td className="selectable px-4 py-2.5 font-medium text-fg">{e.preferred}</td>
                      <td className="selectable px-4 py-2.5 text-muted">{[e.original, e.alias].filter(Boolean).join(', ') || '—'}</td>
                      <td className="px-4 py-2.5">{e.language ? <Badge tone="accent">{languageLabel(e.language)}</Badge> : <span className="text-subtle">{t('dictionary.anyLanguage')}</span>}</td>
                      <td className="px-4 py-2.5 text-muted">{t(`dictionary.categories.${e.category}`, { defaultValue: e.category })}</td>
                      <td className="px-2 text-right">
                        <div className="flex justify-end gap-0.5 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                          <Button size="icon-sm" variant="ghost" onClick={() => setEdit({ ...e })} aria-label={t('common.edit')}>
                            <Pencil size={13} />
                          </Button>
                          <Button
                            size="icon-sm"
                            variant="danger-ghost"
                            onClick={async () => {
                              await api().dictionary.remove(e.id)
                              load()
                            }}
                            aria-label={t('common.delete')}
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
            <Card className="mt-4">
              <div className="mb-2 text-[12.5px] font-medium text-fg">{t('dictionary.test')}</div>
              <Input value={sample} onChange={(e) => setSample(e.target.value)} placeholder={t('dictionary.testPlaceholder')} />
              {sample && <DiffView before={sample} after={preview} className="mt-3" />}
            </Card>
          </>
        )}
      </div>

      <Dialog
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        title={edit?.id ? t('common.edit') : t('dictionary.add')}
        footer={
          <>
            <Button onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
            <Button variant="primary" disabled={!edit?.preferred.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        {edit && (
          <div className="flex flex-col gap-1">
            <Field label={t('dictionary.preferred')}>
              <Input autoFocus value={edit.preferred} onChange={(e) => setEdit({ ...edit, preferred: e.target.value })} />
            </Field>
            <Field label={t('dictionary.original')}>
              <Input value={edit.original} onChange={(e) => setEdit({ ...edit, original: e.target.value })} />
            </Field>
            <Field label={t('dictionary.alias')} hint={t('dictionary.aliasHint')}>
              <Input value={edit.alias ?? ''} onChange={(e) => setEdit({ ...edit, alias: e.target.value })} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('dictionary.language')}>
                <Select className="w-full" value={edit.language ?? '__any'} onChange={(v) => setEdit({ ...edit, language: v === '__any' ? null : v })} options={[{ value: '__any', label: t('dictionary.anyLanguage') }, ...LANGUAGES.map((l) => ({ value: l.code, label: l.native }))]} />
              </Field>
              <Field label={t('dictionary.category')}>
                <Select className="w-full" value={edit.category} onChange={(v) => setEdit({ ...edit, category: v })} options={CATEGORIES.map((c) => ({ value: c, label: t(`dictionary.categories.${c}`) }))} />
              </Field>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  )
}
