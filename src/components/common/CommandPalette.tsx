/**
 * Spotlight-style command palette (⌘K / Ctrl+K): search documents, jump to any page or settings
 * section, and run common actions — all from the keyboard.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { create } from 'zustand'
import { AnimatePresence, motion } from 'motion/react'
import { Dialog as RDialog } from 'radix-ui'
import { Search, FilePlus2, Mic, FileUp, Moon, Sun, Wand2, FileText, LayoutGrid, History, Sparkles, BookA, LayoutTemplate, Settings, CornerDownLeft, AudioWaveform, Plug, Keyboard, RefreshCw } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { DocumentSummary } from '@shared/types'
import { useSettings, useUi, toast, type Page, type Route } from '@/stores'
import { api, cn, errorMessage, relativeTime } from '@/lib/utils'
import { IconTile, type TileColor } from '@/components/ui/misc'
import { htmlToDoc } from '@/components/editor/extensions'

export const usePalette = create<{ open: boolean; setOpen: (o: boolean) => void }>((set) => ({ open: false, setOpen: (open) => set({ open }) }))

interface Cmd {
  id: string
  group: 'actions' | 'navigate' | 'documents'
  title: string
  subtitle?: string
  icon: LucideIcon
  color: TileColor
  keywords?: string
  run: () => void | Promise<void>
}

export function CommandPalette() {
  const { t, i18n } = useTranslation()
  const { open, setOpen } = usePalette()
  const navigate = useUi((s) => s.navigate)
  const settings = useSettings((s) => s.settings)
  const update = useSettings((s) => s.update)
  const [q, setQ] = useState('')
  const [docs, setDocs] = useState<DocumentSummary[]>([])
  const [index, setIndex] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQ('')
    setIndex(0)
  }, [open])

  useEffect(() => {
    if (!open) return
    const h = setTimeout(() => void api().documents.list({ search: q || undefined, scope: q ? 'all' : 'recent', limit: 6 }).then(setDocs), q ? 120 : 0)
    return () => clearTimeout(h)
  }, [q, open])

  const go = (r: Route | Page) => () => navigate(r)
  const dark = document.documentElement.classList.contains('dark')

  const commands = useMemo<Cmd[]>(() => {
    const list: Cmd[] = [
      {
        id: 'new-doc',
        group: 'actions',
        title: t('palette.newDocument'),
        icon: FilePlus2,
        color: 'orange',
        keywords: 'create document new',
        run: async () => {
          const d = await api().documents.create({ title: t('documents.untitled') })
          navigate({ page: 'editor', docId: d.id })
        }
      },
      { id: 'dictate', group: 'actions', title: t('palette.startDictation'), icon: Mic, color: 'red', keywords: 'record voice dictation', run: () => void api().dictation.start({ target: 'auto' }) },
      {
        id: 'import',
        group: 'actions',
        title: t('palette.importDocument'),
        icon: FileUp,
        color: 'blue',
        keywords: 'docx markdown open',
        run: async () => {
          const imp = await api().files.importDocument()
          if (!imp) return
          const d = await api().documents.create({ title: imp.title, content: htmlToDoc(imp.html) })
          navigate({ page: 'editor', docId: d.id })
        }
      },
      {
        id: 'theme',
        group: 'actions',
        title: dark ? t('palette.lightMode') : t('palette.darkMode'),
        icon: dark ? Sun : Moon,
        color: 'indigo',
        keywords: 'theme appearance dark light',
        run: () => void update('appearance', { theme: dark ? 'light' : 'dark' })
      },
      { id: 'updates', group: 'actions', title: t('update.paletteCheck'), icon: RefreshCw, color: 'green', keywords: 'update version release', run: () => void api().updates.check().then(() => navigate({ page: 'settings', section: 'about' })) },
      ...(['raw', 'correct', 'professional'] as const).map<Cmd>((m) => ({
        id: `mode-${m}`,
        group: 'actions',
        title: `${t('palette.switchMode')}: ${t(`modes.${m}`)}`,
        subtitle: settings?.writing.mode === m ? '✓' : t(`modes.${m}Hint`),
        icon: Wand2,
        color: 'purple',
        keywords: `mode ${m}`,
        run: () => void update('writing', { mode: m })
      })),
      { id: 'nav-dashboard', group: 'navigate', title: t('nav.dashboard'), icon: LayoutGrid, color: 'blue', run: go('dashboard') },
      { id: 'nav-documents', group: 'navigate', title: t('nav.documents'), icon: FileText, color: 'orange', run: go('documents') },
      { id: 'nav-voice', group: 'navigate', title: t('nav.voiceTyping'), icon: Mic, color: 'red', run: go('voice') },
      { id: 'nav-history', group: 'navigate', title: t('nav.history'), icon: History, color: 'indigo', run: go('history') },
      { id: 'nav-assistant', group: 'navigate', title: t('nav.assistant'), icon: Sparkles, color: 'purple', run: go('assistant') },
      { id: 'nav-dictionary', group: 'navigate', title: t('nav.dictionary'), icon: BookA, color: 'green', run: go('dictionary') },
      { id: 'nav-templates', group: 'navigate', title: t('nav.templates'), icon: LayoutTemplate, color: 'teal', run: go('templates') },
      { id: 'nav-settings', group: 'navigate', title: t('nav.settings'), icon: Settings, color: 'gray', run: go('settings') },
      { id: 'nav-voice-settings', group: 'navigate', title: `${t('nav.settings')} › ${t('settings.sections.voice')}`, icon: Keyboard, color: 'red', keywords: 'hotkey microphone', run: go({ page: 'settings', section: 'voice' }) },
      { id: 'nav-recognition', group: 'navigate', title: `${t('nav.settings')} › ${t('settings.sections.recognition')}`, icon: AudioWaveform, color: 'pink', keywords: 'whisper model language', run: go({ page: 'settings', section: 'recognition' }) },
      { id: 'nav-providers', group: 'navigate', title: `${t('nav.settings')} › ${t('settings.sections.providers')}`, icon: Plug, color: 'green', keywords: 'api key openai groq anthropic ollama', run: go({ page: 'settings', section: 'providers' }) }
    ]
    const docCmds = docs.map<Cmd>((d) => ({
      id: `doc-${d.id}`,
      group: 'documents',
      title: d.title,
      subtitle: d.excerpt || relativeTime(d.updatedAt, i18n.language),
      icon: FileText,
      color: 'orange',
      run: go({ page: 'editor', docId: d.id })
    }))
    const needle = q.trim().toLocaleLowerCase()
    const filtered = needle ? list.filter((c) => `${c.title} ${c.keywords ?? ''}`.toLocaleLowerCase().includes(needle)) : list.filter((c) => c.group === 'actions').slice(0, 4)
    return [...docCmds, ...filtered]
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, docs, t, dark, settings?.writing.mode])

  useEffect(() => setIndex(0), [q])
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const exec = async (c: Cmd | undefined) => {
    if (!c) return
    setOpen(false)
    try {
      await c.run()
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const groups: Cmd['group'][] = ['documents', 'actions', 'navigate']

  return (
    <RDialog.Root open={open} onOpenChange={setOpen}>
      <AnimatePresence>
        {open && (
          <RDialog.Portal forceMount>
            <RDialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[80] bg-black/20 dark:bg-black/45" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            </RDialog.Overlay>
            <RDialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: -8 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.97 }}
                transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                className="material-thick fixed left-1/2 top-[14vh] z-[81] w-[min(640px,92vw)] -translate-x-1/2 overflow-hidden rounded-[18px] shadow-float outline-none"
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') {
                    e.preventDefault()
                    setIndex((x) => Math.min(commands.length - 1, x + 1))
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault()
                    setIndex((x) => Math.max(0, x - 1))
                  } else if (e.key === 'Enter') {
                    e.preventDefault()
                    void exec(commands[index])
                  }
                }}
              >
                <RDialog.Title className="sr-only">{t('palette.search')}</RDialog.Title>
                <div className="flex h-[58px] items-center gap-3 px-5">
                  <Search size={21} className="shrink-0 text-muted" />
                  <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('palette.placeholder')} className="h-full flex-1 bg-transparent font-display text-[20px] tracking-[-0.01em] text-fg outline-none placeholder:text-subtle" />
                </div>
                <div ref={listRef} className="hairline-t max-h-[min(440px,60vh)] overflow-y-auto p-2">
                  {commands.length === 0 && <div className="px-4 py-8 text-center text-[13.5px] text-muted">{t('palette.noResults')}</div>}
                  {groups.map((g) => {
                    const items = commands.filter((c) => c.group === g)
                    if (!items.length) return null
                    return (
                      <div key={g} className="mb-1">
                        <div className="px-3 pb-1 pt-2 text-[11.5px] font-semibold text-subtle">{t(`palette.${g}`)}</div>
                        {items.map((c) => {
                          const idx = commands.indexOf(c)
                          const on = idx === index
                          return (
                            <button key={c.id} data-index={idx} onMouseMove={() => setIndex(idx)} onClick={() => void exec(c)} className={cn('flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left', on ? 'bg-accent text-accent-fg' : 'text-fg')}>
                              <IconTile icon={c.icon} color={c.color} size="md" />
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-[14px] font-medium">{c.title}</div>
                                {c.subtitle && <div className={cn('truncate text-[12px]', on ? 'text-white/75' : 'text-muted')}>{c.subtitle}</div>}
                              </div>
                              {on && <CornerDownLeft size={15} className="shrink-0 opacity-80" />}
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </motion.div>
            </RDialog.Content>
          </RDialog.Portal>
        )}
      </AnimatePresence>
    </RDialog.Root>
  )
}
