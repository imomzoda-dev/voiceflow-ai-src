import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { Switch as RSwitch, Slider as RSlider, Select as RSelect } from 'radix-ui'
import { motion } from 'motion/react'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

/** iOS filled text field. */
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'h-9 w-full rounded-[10px] bg-fill px-3 text-[13.5px] text-fg outline-none transition placeholder:text-subtle focus:bg-surface focus:shadow-[0_0_0_3.5px_var(--ring)] disabled:opacity-50',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full resize-none rounded-[12px] bg-fill px-3.5 py-2.5 text-[13.5px] leading-relaxed text-fg outline-none transition placeholder:text-subtle focus:bg-surface focus:shadow-[0_0_0_3.5px_var(--ring)]',
      className
    )}
    {...props}
  />
))
Textarea.displayName = 'Textarea'

/** UISwitch: green track, white knob with soft shadow. */
export function Switch({ checked, onCheckedChange, disabled, id, label }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; id?: string; label?: string }) {
  return (
    <RSwitch.Root
      id={id}
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onCheckedChange={onCheckedChange}
      className="relative h-[26px] w-[44px] shrink-0 cursor-pointer rounded-full bg-fill-strong transition-colors duration-200 data-[state=checked]:bg-success disabled:cursor-not-allowed disabled:opacity-45"
    >
      <RSwitch.Thumb className="block h-[22px] w-[22px] translate-x-[2px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_1px_1px_rgba(0,0,0,0.16),0_3px_1px_rgba(0,0,0,0.1)] transition-transform duration-200 ease-[cubic-bezier(0.3,1.4,0.5,1)] data-[state=checked]:translate-x-[20px]" />
    </RSwitch.Root>
  )
}

export function Slider({ value, min, max, step, onChange, label }: { value: number; min: number; max: number; step: number; onChange: (v: number) => void; label?: string }) {
  return (
    <RSlider.Root className="relative flex h-7 w-full touch-none select-none items-center" value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} aria-label={label}>
      <RSlider.Track className="relative h-[4px] grow rounded-full bg-fill-strong">
        <RSlider.Range className="absolute h-full rounded-full bg-accent" />
      </RSlider.Track>
      <RSlider.Thumb className="block h-[26px] w-[26px] rounded-full bg-white shadow-[0_3px_8px_rgba(0,0,0,0.15),0_0.5px_4px_rgba(0,0,0,0.15)] outline-none focus-visible:shadow-[0_0_0_4px_var(--ring)]" />
    </RSlider.Root>
  )
}

export interface SelectOption {
  value: string
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}

/** iOS pop-up button: value + chevrons, opens a blurred menu. */
export function Select({
  value,
  onChange,
  options,
  placeholder,
  className,
  disabled,
  label,
  variant = 'filled'
}: {
  value: string | null | undefined
  onChange: (v: string) => void
  options: SelectOption[]
  placeholder?: string
  className?: string
  disabled?: boolean
  label?: string
  variant?: 'filled' | 'plain'
}) {
  return (
    <RSelect.Root value={value ?? undefined} onValueChange={onChange} disabled={disabled}>
      <RSelect.Trigger
        aria-label={label}
        className={cn(
          'inline-flex h-8 min-w-[120px] items-center justify-between gap-1.5 rounded-[9px] px-2.5 text-[13.5px] outline-none transition focus-visible:shadow-[0_0_0_3.5px_var(--ring)] disabled:opacity-45 data-[placeholder]:text-subtle',
          variant === 'filled' ? 'bg-fill text-fg hover:bg-fill-strong' : 'text-muted hover:bg-fill',
          className
        )}
      >
        <span className="truncate">
          <RSelect.Value placeholder={placeholder} />
        </span>
        <RSelect.Icon>
          <ChevronsUpDown size={13} className="text-subtle" />
        </RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content position="popper" sideOffset={5} className="material-thick z-50 max-h-[min(400px,var(--radix-select-content-available-height))] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[13px] p-1.5 shadow-float">
          <RSelect.Viewport>
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                disabled={o.disabled}
                className="relative flex cursor-default select-none flex-col rounded-[8px] py-[7px] pl-8 pr-3 text-[13.5px] text-fg outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent data-[highlighted]:text-accent-fg [&[data-highlighted]_.vf-hint]:text-white/80 [&[data-highlighted]_svg]:text-accent-fg"
              >
                <RSelect.ItemIndicator className="absolute left-2.5 top-[9px]">
                  <Check size={14} strokeWidth={2.6} className="text-accent" />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
                {o.hint ? <span className="vf-hint text-[11.5px] text-muted">{o.hint}</span> : null}
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  )
}

/** UISegmentedControl with a spring-animated sliding thumb. */
export function Segmented<T extends string>({ value, onChange, options, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode; icon?: ReactNode }[]; className?: string; size?: 'sm' | 'md' }) {
  const id = useId()
  return (
    <div role="radiogroup" className={cn('inline-flex rounded-[9px] bg-fill p-[2px]', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(o.value)}
            className={cn('relative inline-flex min-w-0 flex-auto items-center justify-center gap-1.5 rounded-[7px] px-3 font-medium transition-colors', size === 'sm' ? 'h-[26px] text-[12px]' : 'h-[30px] text-[13px]', active ? 'text-fg' : 'text-muted hover:text-fg')}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-[7px] bg-white shadow-[0_3px_8px_rgba(0,0,0,0.12),0_3px_1px_rgba(0,0,0,0.04)] dark:bg-[#636366]"
                transition={{ type: 'spring', stiffness: 520, damping: 38 }}
              />
            )}
            <span className="relative z-[1] inline-flex min-w-0 items-center gap-1.5 truncate whitespace-nowrap">
              {o.icon}
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/**
 * Settings row (UITableViewCell style). `inline` = label left, control right, min 46px tall.
 * `icon` renders an iOS Settings coloured tile.
 */
export function Field({ label, hint, children, className, inline = false, icon }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string; inline?: boolean; icon?: ReactNode }) {
  if (inline) {
    return (
      <div className={cn('flex min-h-[48px] items-center gap-3.5 py-2', className)}>
        {icon}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] text-fg">{label}</div>
          {hint ? <div className="mt-0.5 text-[12px] leading-snug text-muted">{hint}</div> : null}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    )
  }
  return (
    <label className={cn('block py-2', className)}>
      <div className="mb-1.5 px-1 text-[12.5px] font-medium text-muted">{label}</div>
      {children}
      {hint ? <div className="mt-1 px-1 text-[12px] leading-snug text-muted">{hint}</div> : null}
    </label>
  )
}
