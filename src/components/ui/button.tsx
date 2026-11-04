import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { Slot } from 'radix-ui'
import { cva, type VariantProps } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/** iOS button styles: filled, tinted, gray, plain, destructive. */
const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold tracking-[-0.01em] transition-[background,color,transform,opacity,filter] duration-150 select-none disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] active:opacity-80 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-fg hover:brightness-110',
        secondary: 'bg-fill text-fg hover:bg-fill-strong',
        ghost: 'text-accent hover:bg-accent-soft',
        plain: 'text-muted hover:bg-fill hover:text-fg',
        soft: 'bg-accent-soft text-accent hover:brightness-105',
        danger: 'bg-danger text-white hover:brightness-110',
        'danger-ghost': 'text-danger hover:bg-danger-soft',
        record: 'bg-danger text-white hover:brightness-110'
      },
      size: {
        sm: 'h-7 px-3 text-[12.5px]',
        md: 'h-8 px-3.5 text-[13px]',
        lg: 'h-10 px-5 text-[14.5px]',
        xl: 'h-12 px-6 text-[16px]',
        icon: 'h-8 w-8',
        'icon-sm': 'h-7 w-7'
      }
    },
    defaultVariants: { variant: 'secondary', size: 'md' }
  }
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  loading?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'button'
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
      {children}
    </Comp>
  )
})
Button.displayName = 'Button'
