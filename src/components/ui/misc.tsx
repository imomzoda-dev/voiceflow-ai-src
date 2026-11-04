import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Inset-grouped surface (UITableView .insetGrouped cell background). */
export function Card({ children, className, padded = true }: { children: ReactNode; className?: string; padded?: boolean }) {
  return <div className={cn('rounded-[16px] bg-surface shadow-soft', padded && 'p-4', className)}>{children}</div>
}

/** iOS Settings-style grouped section: optional header/footer, rows separated by inset hairlines. */
export function Group({ title, footer, children, className }: { title?: ReactNode; footer?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('mb-7', className)}>
      {title ? <h2 className="mb-1.5 px-4 text-[12.5px] font-normal uppercase tracking-[0.02em] text-muted">{title}</h2> : null}
      <div className="vf-group overflow-hidden rounded-[14px] bg-surface px-4 shadow-soft">{children}</div>
      {footer ? <p className="mt-1.5 px-4 text-[12px] leading-snug text-muted">{footer}</p> : null}
    </section>
  )
}

const TILE_COLORS = {
  blue: 'bg-[#007aff]',
  indigo: 'bg-[#5856d6]',
  purple: 'bg-[#af52de]',
  pink: 'bg-[#ff2d55]',
  red: 'bg-[#ff3b30]',
  orange: 'bg-[#ff9500]',
  yellow: 'bg-[#ffcc00]',
  green: 'bg-[#34c759]',
  teal: 'bg-[#30b0c7]',
  cyan: 'bg-[#32ade6]',
  gray: 'bg-[#8e8e93]',
  graphite: 'bg-[#48484a]'
} as const
export type TileColor = keyof typeof TILE_COLORS

/** iOS Settings icon: white glyph on a coloured squircle. */
export function IconTile({ icon: Icon, color, size = 'md', className }: { icon: LucideIcon; color: TileColor; size?: 'sm' | 'md' | 'lg' | 'xl'; className?: string }) {
  const dims = { sm: 'h-[22px] w-[22px] rounded-[6px]', md: 'h-[29px] w-[29px] rounded-[7.5px]', lg: 'h-10 w-10 rounded-[10px]', xl: 'h-14 w-14 rounded-[14px]' }[size]
  const glyph = { sm: 13, md: 17, lg: 21, xl: 28 }[size]
  return (
    <span className={cn('grid shrink-0 place-items-center text-white shadow-[inset_0_0_0_0.5px_rgba(0,0,0,0.06)]', dims, TILE_COLORS[color], className)}>
      <Icon size={glyph} strokeWidth={2.2} />
    </span>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'; className?: string }) {
  const tones = {
    neutral: 'bg-fill text-muted',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-success-soft text-success',
    warning: 'bg-warning-soft text-warning',
    danger: 'bg-danger-soft text-danger'
  }
  return <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none', tones[tone], className)}>{children}</span>
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-[21px] min-w-[21px] items-center justify-center rounded-[6px] bg-fill px-1.5 font-sans text-[11.5px] font-semibold text-fg shadow-[inset_0_-1px_0_var(--border-strong)]">{children}</kbd>
}

export function EmptyState({ icon: Icon, title, hint, action, className }: { icon: LucideIcon; title: ReactNode; hint?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}>
      <Icon size={46} strokeWidth={1.4} className="mb-4 text-subtle" />
      <div className="font-display text-[19px] font-semibold tracking-[-0.015em] text-fg">{title}</div>
      {hint ? <div className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-muted">{hint}</div> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </motion.div>
  )
}

/** UINavigationBar large title. */
export function PageHeader({ title, subtitle, actions, className }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-4 pb-6', className)}>
      <div className="min-w-0">
        <h1 className="font-display text-[32px] font-bold leading-[1.1] tracking-[-0.025em] text-fg">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-[14px] text-muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  )
}

export function Spinner({ className }: { className?: string }) {
  return <span className={cn('inline-block h-4 w-4 animate-spin rounded-full border-2 border-fill-strong border-t-accent', className)} />
}

export function Meter({ value, className }: { value: number; className?: string }) {
  const v = Math.max(0, Math.min(1, value))
  return (
    <div className={cn('h-[6px] w-full overflow-hidden rounded-full bg-fill-strong', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-75', v > 0.85 ? 'bg-warning' : 'bg-success')} style={{ width: `${Math.round(v * 100)}%` }} />
    </div>
  )
}

export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cn('mb-2.5 font-display text-[19px] font-bold tracking-[-0.015em] text-fg', className)}>{children}</h2>
}
