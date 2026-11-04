import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { FilePlus2, FileUp, FileText, Folder, FolderPlus, MoreHorizontal, Star, StarOff, Trash2, Copy, Pencil, RotateCcw, Clock, Search, ArrowUpDown, Inbox, FolderInput } from 'lucide-react'
import type { DocumentQuery, DocumentSummary, Folder as FolderT } from '@shared/types'
import { useUi, toast } from '@/stores'
import { api, cn, errorMessage, relativeTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Select } from '@/components/ui/form'
import { Dialog, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger, SubMenu } from '@/components/ui/overlays'
import { EmptyState, PageHeader } from '@/components/ui/misc'
import { htmlToDoc } from '@/components/editor/extensions'

type Scope = 'all' | 'favorites' | 'recent' | 'trash' | { folder: string }

export function DocumentsPage() {
  const { t, i18n } = useTranslation()
  const navigate = useUi((s) => s.navigate)
  const [scope, setScope] = useState<Scope>('all')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<NonNullable<DocumentQuery['sort']>>('updated')
  const [docs, setDocs] = useState<DocumentSummary[] | null>(null)
  const [folders, setFolders] = useState<FolderT[]>([])
  const [rename, setRename] = useState<{ kind: 'doc' | 'folder' | 'new-folder'; id?: string; value: string } | null>(null)
  const [confirm, setConfirm] = useState<{ title: string; run: () => Promise<void> } | null>(null)

  const query = useMemo<DocumentQuery>(() => {
    if (typeof scope === 'object') return { folderId: scope.folder, search, sort }
    return { scope, search, sort: scope === 'recent' ? 'opened' : sort }
  }, [scope, search, sort])

  const reload = useCallback(async () => {
    const [d, f] = await Promise.all([api().documents.list(query), api().folders.list()])
    setDocs(d)
    setFolders(f)
  }, [query])

  useEffect(() => {
    const h = setTimeout(() => void reload(), search ? 180 : 0)
    return () => clearTimeout(h)
  }, [reload, search])

  const run = (fn: () => Promise<unknown>, success?: string) => async () => {
    try {
      await fn()
      if (success) toast.success(success)
      await reload()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const create = async () => {
    const d = await api().documents.create({ title: t('documents.untitled'), folderId: typeof scope === 'object' ? scope.folder : null })
    navigate({ page: 'editor', docId: d.id })
  }

  const importDoc = async () => {
    try {
      const imp = await api().files.importDocument()
      if (!imp) return
      const content = htmlToDoc(imp.html)
      const d = await api().documents.create({ title: imp.title, content, folderId: typeof scope === 'object' ? scope.folder : null })
      toast.success(imp.warnings.length ? t('documents.importWarnings', { count: imp.warnings.length }) : t('documents.imported'))
      navigate({ page: 'editor', docId: d.id })
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const isTrash = scope === 'trash'
  const scopeBtn = (s: Scope, icon: React.ReactNode, label: string, count?: number) => {
    const active = JSON.stringify(s) === JSON.stringify(scope)
    return (
      <button
        onClick={() => setScope(s)}
        className={cn('flex h-[36px] w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left text-[14px] transition-colors', active ? 'bg-accent font-semibold text-accent-fg [&_svg]:text-accent-fg' : 'text-fg hover:bg-fill [&_svg]:text-accent')}
      >
        {icon}
        <span className="flex-1 truncate">{label}</span>
        {count !== undefined && <span className={cn('text-[12px]', active ? 'text-white/75' : 'text-subtle')}>{count}</span>}
      </button>
    )
  }

  return (
    <div className="flex h-full">
      <div className="w-[230px] shrink-0 px-3 pt-9 shadow-[inset_-0.5px_0_0_var(--border-strong)]">
        <div className="mb-3 px-2.5 font-display text-[22px] font-bold tracking-[-0.02em] text-fg">{t('documents.title')}</div>
        <div className="flex flex-col gap-0.5">
          {scopeBtn('all', <FileText size={15} />, t('documents.all'))}
          {scopeBtn('favorites', <Star size={15} />, t('documents.favorites'))}
          {scopeBtn('recent', <Clock size={15} />, t('documents.recent'))}
          {scopeBtn('trash', <Trash2 size={15} />, t('documents.trash'))}
        </div>
        <div className="mb-1 mt-6 flex items-center justify-between px-2.5">
          <span className="text-[13px] font-semibold text-muted">{t('documents.folders')}</span>
          <button className="grid h-6 w-6 place-items-center rounded-md text-muted hover:bg-surface-2 hover:text-fg" onClick={() => setRename({ kind: 'new-folder', value: '' })} aria-label={t('documents.newFolder')}>
            <FolderPlus size={14} />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {folders.map((f) => (
            <div key={f.id} className="group relative">
              {scopeBtn({ folder: f.id }, <Folder size={15} />, f.name, f.documentCount)}
              <Menu>
                <MenuTrigger asChild>
                  <button className="absolute right-1 top-1 hidden h-6 w-6 place-items-center rounded-md text-muted hover:bg-surface-3 group-hover:grid" aria-label="Folder actions">
                    <MoreHorizontal size={14} />
                  </button>
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => setRename({ kind: 'folder', id: f.id, value: f.name })}>
                    <Pencil size={14} /> {t('common.rename')}
                  </MenuItem>
                  <MenuItem
                    danger
                    onSelect={() =>
                      setConfirm({
                        title: t('documents.deleteFolderConfirm', { name: f.name }),
                        run: async () => {
                          await api().folders.remove(f.id)
                          if (typeof scope === 'object' && scope.folder === f.id) setScope('all')
                        }
                      })
                    }
                  >
                    <Trash2 size={14} /> {t('common.delete')}
                  </MenuItem>
                </MenuContent>
              </Menu>
            </div>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[980px] px-8 pb-12 pt-8">
          <PageHeader
            title={typeof scope === 'object' ? (folders.find((f) => f.id === scope.folder)?.name ?? t('documents.title')) : t(`documents.${scope === 'all' ? 'all' : scope}`)}
            actions={
              isTrash ? (
                docs && docs.length > 0 ? (
                  <Button variant="danger-ghost" onClick={() => setConfirm({ title: t('documents.emptyTrashConfirm', { count: docs.length }), run: async () => void (await api().documents.emptyTrash()) })}>
                    <Trash2 size={15} /> {t('documents.emptyTrashAction')}
                  </Button>
                ) : null
              ) : (
                <>
                  <Button onClick={importDoc}>
                    <FileUp size={15} /> {t('documents.import')}
                  </Button>
                  <Button variant="primary" onClick={create}>
                    <FilePlus2 size={15} /> {t('documents.new')}
                  </Button>
                </>
              )
            }
          />
          <div className="mb-4 flex items-center gap-2">
            <div className="relative flex-1">
              <Search size={14} className="pointer-events-none absolute left-2.5 top-2.5 text-subtle" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('common.search')} className="pl-8" />
            </div>
            {scope !== 'recent' && (
              <Select
                value={sort}
                onChange={(v) => setSort(v as typeof sort)}
                label={t('documents.sort')}
                options={[
                  { value: 'updated', label: t('documents.sortUpdated') },
                  { value: 'created', label: t('documents.sortCreated') },
                  { value: 'title', label: t('documents.sortTitle') },
                  { value: 'opened', label: t('documents.sortOpened') }
                ]}
              />
            )}
            <ArrowUpDown size={14} className="hidden" />
          </div>

          {docs === null ? null : docs.length === 0 ? (
            search ? (
              <EmptyState icon={Search} title={t('documents.emptySearch', { q: search })} />
            ) : isTrash ? (
              <EmptyState icon={Inbox} title={t('documents.emptyTrash')} />
            ) : (
              <EmptyState
                icon={FileText}
                title={t('documents.empty')}
                hint={t('documents.emptyHint')}
                action={
                  <div className="flex gap-2">
                    <Button onClick={() => navigate('templates')}>{t('nav.templates')}</Button>
                    <Button variant="primary" onClick={create}>
                      <FilePlus2 size={15} /> {t('documents.new')}
                    </Button>
                  </div>
                }
              />
            )
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {docs.map((d, i) => (
                <motion.div
                  key={d.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.2) }}
                  className="group relative flex h-[156px] cursor-default flex-col rounded-[18px] bg-surface p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-card"
                  onDoubleClick={() => !isTrash && navigate({ page: 'editor', docId: d.id })}
                >
                  <button className="absolute inset-0 rounded-[18px]" onClick={() => !isTrash && navigate({ page: 'editor', docId: d.id })} aria-label={d.title} disabled={isTrash} />
                  <div className="pointer-events-none flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-fg">{d.title}</div>
                      <div className="mt-0.5 text-[11.5px] text-subtle">
                        {t('documents.edited', { time: relativeTime(d.updatedAt, i18n.language) })} · {t('common.words', { count: d.wordCount })}
                      </div>
                    </div>
                    {d.isFavorite && <Star size={14} className="mt-0.5 shrink-0 fill-[#f5b301] text-[#f5b301]" />}
                  </div>
                  <p className="pointer-events-none mt-2.5 line-clamp-3 text-[12.5px] leading-relaxed text-muted">{d.excerpt}</p>
                  <div className="absolute right-2 top-2 opacity-0 transition group-hover:opacity-100 focus-within:opacity-100">
                    <Menu>
                      <MenuTrigger asChild>
                        <button className="grid h-7 w-7 place-items-center rounded-full bg-fill text-fg backdrop-blur hover:bg-fill-strong" aria-label="Document actions">
                          <MoreHorizontal size={15} />
                        </button>
                      </MenuTrigger>
                      <MenuContent>
                        {isTrash ? (
                          <>
                            <MenuItem onSelect={run(() => api().documents.restore(d.id), t('documents.restored'))}>
                              <RotateCcw size={14} /> {t('common.restore')}
                            </MenuItem>
                            <MenuItem danger onSelect={() => setConfirm({ title: t('common.confirmDelete', { name: d.title }), run: () => api().documents.deleteForever(d.id) })}>
                              <Trash2 size={14} /> {t('documents.deleteForever')}
                            </MenuItem>
                          </>
                        ) : (
                          <>
                            <MenuItem onSelect={() => navigate({ page: 'editor', docId: d.id })}>
                              <FileText size={14} /> {t('common.open')}
                            </MenuItem>
                            <MenuItem onSelect={() => setRename({ kind: 'doc', id: d.id, value: d.title })}>
                              <Pencil size={14} /> {t('common.rename')}
                            </MenuItem>
                            <MenuItem onSelect={run(() => api().documents.duplicate(d.id))}>
                              <Copy size={14} /> {t('common.duplicate')}
                            </MenuItem>
                            <MenuItem onSelect={run(() => api().documents.setFavorite(d.id, !d.isFavorite))}>
                              {d.isFavorite ? <StarOff size={14} /> : <Star size={14} />} {d.isFavorite ? t('documents.unfavorite') : t('documents.favorite')}
                            </MenuItem>
                            <SubMenu label={t('documents.moveTo')} icon={<FolderInput size={14} />}>
                              <MenuItem onSelect={run(() => api().documents.move(d.id, null))}>{t('documents.noFolder')}</MenuItem>
                              {folders.map((f) => (
                                <MenuItem key={f.id} onSelect={run(() => api().documents.move(d.id, f.id))}>
                                  <Folder size={14} /> {f.name}
                                </MenuItem>
                              ))}
                            </SubMenu>
                            <MenuSeparator />
                            <MenuItem
                              danger
                              onSelect={run(async () => {
                                await api().documents.trash(d.id)
                                toast.info(t('documents.trashed'), { label: t('common.undo'), run: () => void api().documents.restore(d.id).then(reload) })
                              })}
                            >
                              <Trash2 size={14} /> {t('documents.moveToTrash')}
                            </MenuItem>
                          </>
                        )}
                      </MenuContent>
                    </Menu>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Dialog
        open={!!rename}
        onOpenChange={(o) => !o && setRename(null)}
        title={rename?.kind === 'new-folder' ? t('documents.newFolder') : t('common.rename')}
        footer={
          <>
            <Button onClick={() => setRename(null)}>{t('common.cancel')}</Button>
            <Button
              variant="primary"
              onClick={run(async () => {
                if (!rename) return
                if (rename.kind === 'new-folder') await api().folders.create(rename.value)
                else if (rename.kind === 'folder') await api().folders.rename(rename.id!, rename.value)
                else await api().documents.update(rename.id!, { title: rename.value })
                setRename(null)
              })}
            >
              {t('common.save')}
            </Button>
          </>
        }
      >
        <Input
          autoFocus
          value={rename?.value ?? ''}
          placeholder={rename?.kind === 'doc' ? t('documents.untitled') : t('documents.folderName')}
          onChange={(e) => setRename((r) => (r ? { ...r, value: e.target.value } : r))}
          onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.closest('[role=dialog]')?.querySelector<HTMLButtonElement>('button.bg-accent')?.click())}
        />
      </Dialog>

      <Dialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.title ?? ''}
        description={t('common.cannotUndo')}
        footer={
          <>
            <Button onClick={() => setConfirm(null)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={run(async () => {
                await confirm?.run()
                setConfirm(null)
              })}
            >
              {t('common.delete')}
            </Button>
          </>
        }
      />
    </div>
  )
}
