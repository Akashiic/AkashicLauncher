import { forwardRef } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn, SPRING } from '@/lib/cn'
import { audio, type SfxName } from '@/audio/AudioManager'
import { useGlow } from '@/hooks/useGlow'

type Variant = 'primary' | 'panel' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

export interface ButtonProps extends Omit<HTMLMotionProps<'button'>, 'children'> {
  variant?: Variant
  size?: Size
  icon?: React.ReactNode
  sound?: SfxName | null
  children?: React.ReactNode
}

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-fg border-2 border-accent hover:bg-brand-hover hover:shadow-glow',
  panel: 'panel glow-border text-fg hover:border-line-strong hover:bg-overlay/[0.04]',
  ghost: 'text-muted hover:text-fg hover:bg-overlay/[0.06] border border-transparent',
  danger: 'bg-danger/15 text-danger-text border border-danger/40 hover:bg-danger/25',
}
const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-xs gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-xl',
  lg: 'h-12 px-6 text-sm gap-2.5 rounded-xl',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'panel', size = 'md', icon, sound = 'click', className, children, onMouseEnter, onPointerDown, onMouseMove, disabled, ...rest },
  ref,
) {
  const glow = useGlow<HTMLButtonElement>()
  return (
    <motion.button
      ref={ref}
      whileHover={disabled ? undefined : { y: -1 }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
      transition={SPRING}
      disabled={disabled}
      onMouseEnter={(e) => {
        if (!disabled) audio.play('hover')
        onMouseEnter?.(e)
      }}
      onPointerDown={(e) => {
        if (!disabled && sound) audio.play(sound)
        onPointerDown?.(e)
      }}
      onMouseMove={(e) => {
        glow(e)
        onMouseMove?.(e)
      }}
      className={cn(
        'no-drag relative inline-flex select-none items-center justify-center font-semibold uppercase tracking-label transition-[color,background-color,border-color,box-shadow] duration-300 ease-out-expo disabled:cursor-not-allowed disabled:opacity-40',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {icon && <span className="relative z-[3] -ml-0.5 flex shrink-0">{icon}</span>}
      {children !== undefined && <span className="relative z-[3] truncate">{children}</span>}
    </motion.button>
  )
})

export function IconButton({ label, className, ...p }: ButtonProps & { label: string }) {
  return <Button aria-label={label} title={label} variant="ghost" size="sm" className={cn('!px-0 w-8', className)} {...p} />
}
