import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/cn'
import { useGlow } from '@/hooks/useGlow'

export function GlowCard({ className, children, glow, onMouseMove, style, ...rest }: HTMLMotionProps<'div'> & { glow?: string }) {
  const onMove = useGlow()
  return (
    <motion.div
      onMouseMove={(e) => {
        onMove(e)
        onMouseMove?.(e)
      }}
      style={{ ...(glow ? ({ '--glow': glow } as React.CSSProperties) : {}), ...style }}
      className={cn('glass glow-border rounded-2xl', className)}
      {...rest}
    >
      {children}
    </motion.div>
  )
}
