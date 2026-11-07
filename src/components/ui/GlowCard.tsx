import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useGlow } from '@/hooks/useGlow'

/** `glow` recebe uma referência de token, ex.: TONE_VAR.success ou tv('--accent'). */
export function GlowCard({ className, children, glow, onMouseMove, style, ...rest }: HTMLMotionProps<'div'> & { glow?: string }) {
  const onMove = useGlow()
  return (
    <motion.div
      onMouseMove={(e) => {
        onMove(e)
        onMouseMove?.(e)
      }}
      style={{ ...(glow ? ({ '--glow': glow } as React.CSSProperties) : {}), ...style }}
      className={cn('panel glow-border rounded-2xl', className)}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
