import type { ReactNode } from 'react'
import { Dialog as RDialog, DropdownMenu as RMenu, Tooltip as RTooltip, ContextMenu as RContext, Popover as RPopover } from 'radix-ui'
import { X, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ---------------------------------- Dialog ---------------------------------- */

/**
 * iOS presentation styles:
 *  - "alert" (no body): centred title/message, equal-width buttons — used for confirmations.
 *  - "sheet": centred bold title, close button, scrollable body, trailing actions.
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  title: ReactNode
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
  className?: string
}) {
  const alert = !children
  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="vf-overlay fixed inset-0 z-50 bg-black/25 dark:bg-black/50" />
        <RDialog.Content
          className={cn(
            'vf-sheet fixed left-1/2 top-1/2 z-50 flex max-h-[86vh] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden outline-none',
            alert ? 'material-thick w-[min(300px,90vw)] rounded-[16px] shadow-float' : 'w-[min(540px,94vw)] rounded-[22px] bg-elevated shadow-float',
            className
          )}
        >
          {alert ? (
            <>
              <div className="px-5 pb-4 pt-5 text-center">
                <RDialog.Title className="text-[15.5px] font-semibold leading-snug text-fg">{title}</RDialog.Title>
                <RDialog.Description className={cn('mt-1.5 text-[13px] leading-snug text-muted', !description && 'sr-only')}>{description ?? title}</RDialog.Description>
              </div>
              {footer ? <div className="vf-alert-actions hairline-t flex">{footer}</div> : null}
            </>
          ) : (
            <>
              <div className="relative flex h-[52px] shrink-0 items-center justify-center px-12">
                <RDialog.Title className="truncate text-[15.5px] font-semibold text-fg">{title}</RDialog.Title>
                <RDialog.Close className="absolute right-3.5 top-3.5 grid h-[26px] w-[26px] place-items-center rounded-full bg-fill text-muted transition hover:bg-fill-strong hover:text-fg" aria-label="Close">
                  <X size={14} strokeWidth={2.6} />
                </RDialog.Close>
              </div>
              {description ? <RDialog.Description className="-mt-2 px-6 pb-2 text-center text-[13px] text-muted">{description}</RDialog.Description> : <RDialog.Description className="sr-only">{title}</RDialog.Description>}
              <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-2">{children}</div>
              {footer ? <div className="flex justify-end gap-2 bg-surface-2/60 px-5 py-3.5 dark:bg-black/20">{footer}</div> : null}
            </>
          )}
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  )
}

/* ------------------------------- Dropdown menu ------------------------------- */

export const Menu = RMenu.Root
export const MenuTrigger = RMenu.Trigger

const menuPanel = 'material-thick z-50 min-w-[210px] rounded-[13px] p-1.5 shadow-float'

export function MenuContent({ children, align = 'end', className, returnFocus = true }: { children: ReactNode; align?: 'start' | 'end' | 'center'; className?: string; returnFocus?: boolean }) {
  return (
    <RMenu.Portal>
      <RMenu.Content align={align} sideOffset={6} onCloseAutoFocus={returnFocus ? undefined : (e) => e.preventDefault()} className={cn(menuPanel, 'vf-menu', className)}>
        {children}
      </RMenu.Content>
    </RMenu.Portal>
  )
}

const itemCls =
  'flex cursor-default select-none items-center gap-2.5 rounded-[8px] px-2.5 py-[7px] text-[13.5px] text-fg outline-none data-[disabled]:opacity-35 data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg [&_svg]:text-muted data-[highlighted]:[&_svg]:text-accent-fg'

export function MenuItem({ children, onSelect, danger, disabled, shortcut }: { children: ReactNode; onSelect?: () => void; danger?: boolean; disabled?: boolean; shortcut?: string }) {
  return (
    <RMenu.Item disabled={disabled} onSelect={onSelect} className={cn(itemCls, danger && 'text-danger [&_svg]:text-danger data-[highlighted]:bg-danger')}>
      {children}
      {shortcut ? <span className="ml-auto pl-5 text-[12px] opacity-50">{shortcut}</span> : null}
    </RMenu.Item>
  )
}

export function MenuSeparator() {
  return <RMenu.Separator className="mx-2.5 my-1 h-px bg-border-strong" />
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return <RMenu.Label className="px-2.5 pb-1 pt-1.5 text-[11.5px] font-semibold text-subtle">{children}</RMenu.Label>
}

export function SubMenu({ label, icon, children }: { label: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <RMenu.Sub>
      <RMenu.SubTrigger className={itemCls}>
        {icon}
        {label}
        <ChevronRight size={13} className="ml-auto" />
      </RMenu.SubTrigger>
      <RMenu.Portal>
        <RMenu.SubContent sideOffset={6} className={menuPanel}>
          {children}
        </RMenu.SubContent>
      </RMenu.Portal>
    </RMenu.Sub>
  )
}

/* -------------------------------- Context menu -------------------------------- */

export const ContextMenu = RContext.Root
export const ContextTrigger = RContext.Trigger

export function ContextContent({ children }: { children: ReactNode }) {
  return (
    <RContext.Portal>
      <RContext.Content className={cn(menuPanel, 'vf-menu')}>{children}</RContext.Content>
    </RContext.Portal>
  )
}

export function ContextItem({ children, onSelect, disabled, shortcut }: { children: ReactNode; onSelect?: () => void; disabled?: boolean; shortcut?: string }) {
  return (
    <RContext.Item disabled={disabled} onSelect={onSelect} className={itemCls}>
      {children}
      {shortcut ? <span className="ml-auto pl-5 text-[12px] opacity-50">{shortcut}</span> : null}
    </RContext.Item>
  )
}

export function ContextSeparator() {
  return <RContext.Separator className="mx-2.5 my-1 h-px bg-border-strong" />
}

export function ContextSub({ label, icon, children }: { label: ReactNode; icon?: ReactNode; children: ReactNode }) {
  return (
    <RContext.Sub>
      <RContext.SubTrigger className={itemCls}>
        {icon}
        {label}
        <ChevronRight size={13} className="ml-auto" />
      </RContext.SubTrigger>
      <RContext.Portal>
        <RContext.SubContent sideOffset={6} className={menuPanel}>
          {children}
        </RContext.SubContent>
      </RContext.Portal>
    </RContext.Sub>
  )
}

/* ---------------------------------- Tooltip ---------------------------------- */

export const TooltipProvider = RTooltip.Provider

export function Tooltip({ content, children, side = 'bottom' }: { content: ReactNode; children: ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  if (!content) return <>{children}</>
  return (
    <RTooltip.Root>
      <RTooltip.Trigger asChild>{children}</RTooltip.Trigger>
      <RTooltip.Portal>
        <RTooltip.Content side={side} sideOffset={7} className="z-[60] rounded-[8px] bg-[#1c1c1e]/92 px-2.5 py-1 text-[12px] font-medium text-white shadow-float backdrop-blur dark:bg-[#e5e5ea]/95 dark:text-black">
          {content}
        </RTooltip.Content>
      </RTooltip.Portal>
    </RTooltip.Root>
  )
}

/* ---------------------------------- Popover ---------------------------------- */

export function Popover({ trigger, children, align = 'start', open, onOpenChange }: { trigger: ReactNode; children: ReactNode; align?: 'start' | 'end' | 'center'; open?: boolean; onOpenChange?: (o: boolean) => void }) {
  return (
    <RPopover.Root open={open} onOpenChange={onOpenChange}>
      <RPopover.Trigger asChild>{trigger}</RPopover.Trigger>
      <RPopover.Portal>
        <RPopover.Content align={align} sideOffset={7} className="material-thick vf-menu z-50 rounded-[14px] p-3 shadow-float outline-none">
          {children}
        </RPopover.Content>
      </RPopover.Portal>
    </RPopover.Root>
  )
}
