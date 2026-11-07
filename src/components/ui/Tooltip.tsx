import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { cn } from '@/lib/cn'

type Side = 'right' | 'top' | 'bottom' | 'left'

const pos: Record<Side, string> = {
  right: 'left-full top-1/2 ml-3 -translate-y-1/2',
  left: 'right-full top-1/2 mr-3 -translate-y-1/2',
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
}
const from: Record<Side, { x?: number; y?: number }> = {
  right: { x: -6 },
  left: { x: 6 },
  top: { y: 4 },
  bottom: { y: -4 },
}

export function Tooltip({ content, side = 'top', children, className }: { content: React.ReactNode; side?: Side; children: React.ReactNode; className?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <span
      className={cn('relative inline-flex', className)}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      <AnimatePresence>
        {open && (
          <motion.span
            role="tooltip"
            initial={{ opacity: 0, scale: 0.92, filter: 'blur(4px)', ...from[side] }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', x: 0, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, filter: 'blur(2px)', ...from[side] }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-white/10 bg-void-700/95 px-2.5 py-1.5 text-xs font-medium text-slate-100 shadow-xl shadow-black/40',
              pos[side],
            )}
          >
            {content}
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}
