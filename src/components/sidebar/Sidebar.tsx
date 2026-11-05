import { useTranslation } from 'react-i18next'
import { motion } from 'motion/react'
import { LayoutGrid, FileText, Mic, History, Sparkles, BookA, LayoutTemplate, Settings, PanelLeftClose, PanelLeftOpen, AudioLines, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useDictation, useUi, type Page } from '@/stores'
import { Tooltip } from '@/components/ui/overlays'
import { IconTile, Kbd, type TileColor } from '@/components/ui/misc'
import { cn } from '@/lib/utils'
import { DictationButton } from '@/components/voice/DictationButton'
import { usePalette } from '@/components/common/CommandPalette'
import { UpdateCard } from '@/components/common/UpdateCard'

const ITEMS: { page: Page; icon: LucideIcon; key: string; color: TileColor }[] = [
  { page: 'dashboard', icon: LayoutGrid, key: 'nav.dashboard', color: 'blue' },
  { page: 'documents', icon: FileText, key: 'nav.documents', color: 'orange' },
  { page: 'voice', icon: Mic, key: 'nav.voiceTyping', color: 'red' },
  { page: 'history', icon: History, key: 'nav.history', color: 'indigo' },
  { page: 'assistant', icon: Sparkles, key: 'nav.assistant', color: 'purple' },
  { page: 'dictionary', icon: BookA, key: 'nav.dictionary', color: 'green' },
  { page: 'templates', icon: LayoutTemplate, key: 'nav.templates', color: 'teal' }
]

export function Sidebar() {
  const { t } = useTranslation()
  const { route, navigate, sidebarCollapsed: collapsed, toggleSidebar } = useUi()
  const openPalette = usePalette((s) => s.setOpen)
  const phase = useDictation((s) => s.state?.phase ?? 'idle')
  const isMac = navigator.userAgent.includes('Mac')

  const active = (p: Page) => route.page === p || (p === 'documents' && route.page === 'editor')

  const item = (p: Page, Icon: LucideIcon, label: string, color: TileColor) => {
    const on = active(p)
    const btn = (
      <button
        key={p}
        onClick={() => navigate(p)}
        aria-current={on ? 'page' : undefined}
        className={cn('no-drag group relative flex h-[36px] w-full items-center gap-2.5 rounded-[10px] px-2 text-[14px] transition-colors', on ? 'text-accent-fg' : 'text-fg hover:bg-fill', collapsed && 'justify-center px-0')}
      >
        {on && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-[10px] bg-accent" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
        <IconTile icon={Icon} color={color} size="sm" className={cn('relative', on && 'shadow-[0_0_0_1.5px_rgba(255,255,255,0.35)]')} />
        {!collapsed && <span className={cn('relative truncate', on && 'font-semibold')}>{label}</span>}
      </button>
    )
    return collapsed ? (
      <Tooltip key={p} content={label} side="right">
        {btn}
      </Tooltip>
    ) : (
      btn
    )
  }

  return (
    <motion.aside
      data-sidebar
      animate={{ width: collapsed ? 68 : 240 }}
      transition={{ type: 'spring', stiffness: 420, damping: 40 }}
      className="drag-region relative flex h-full shrink-0 flex-col bg-[var(--sidebar)] shadow-[inset_-0.5px_0_0_var(--border-strong)] backdrop-blur-2xl"
    >
      <div className={cn('flex items-center gap-2.5 px-4 pb-3', isMac ? 'pt-[52px]' : 'pt-5', collapsed && 'justify-center px-0')}>
        <div className="relative grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] bg-gradient-to-br from-[#0a84ff] via-[#5e5ce6] to-[#bf5af2] text-white shadow-[0_2px_8px_-2px_rgba(94,92,230,0.6)]">
          <AudioLines size={17} strokeWidth={2.4} />
          {phase === 'recording' && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-danger ring-2 ring-[var(--bg)]" style={{ animation: 'vf-pulse 1.4s infinite' }} />}
        </div>
        {!collapsed && <div className="truncate font-display text-[17px] font-bold tracking-[-0.02em] text-fg">{t('app.name')}</div>}
      </div>

      {!collapsed && (
        <div className="px-3 pb-2">
          <button onClick={() => openPalette(true)} className="no-drag flex h-[34px] w-full items-center gap-2 rounded-[10px] bg-fill px-2.5 text-[13.5px] text-muted transition hover:bg-fill-strong">
            <Search size={15} />
            <span className="flex-1 text-left">{t('palette.search')}</span>
            <Kbd>{isMac ? '⌘K' : 'Ctrl K'}</Kbd>
          </button>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-[3px] overflow-y-auto px-3 pt-1">{ITEMS.map((i) => item(i.page, i.icon, t(i.key), i.color))}</nav>

      <div className="flex flex-col gap-1.5 px-3 pb-3 pt-2">
        <UpdateCard collapsed={collapsed} />
        <DictationButton compact={collapsed} />
        {item('settings', Settings, t('nav.settings'), 'gray')}
        <button
          onClick={toggleSidebar}
          className={cn('no-drag flex h-8 items-center gap-2.5 rounded-[10px] px-2 text-[13px] text-muted hover:bg-fill hover:text-fg', collapsed && 'justify-center px-0')}
          aria-label={collapsed ? t('nav.expand') : t('nav.collapse')}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          {!collapsed && <span>{t('nav.collapse')}</span>}
        </button>
      </div>
    </motion.aside>
  )
}
