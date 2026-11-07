import { motion } from 'framer-motion'
import { useId } from 'react'
import { cn } from '@/lib/cn'
import { audio } from '@/audio/AudioManager'

export interface SegOption<T extends string> {
  value: T
  label: string
  icon?: React.ReactNode
  hint?: string
}

export function Segmented<T extends string>({ value, options, onChange, className, size = 'md' }: { value: T; options: SegOption<T>[]; onChange: (v: T) => void; className?: string; size?: 'sm' | 'md' }) {
  const id = useId()
  return (
    <div role="radiogroup" className={cn('no-drag inline-flex rounded-xl border border-line bg-bg p-1', className)}>
      {options.map((o) => {
        const active = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint}
            onMouseEnter={() => audio.play('hover')}
            onClick={() => {
              if (!active) audio.play('tab')
              onChange(o.value)
            }}
            className={cn(
              'relative flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-medium transition-colors duration-300',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-[13px]',
              active ? 'text-fg' : 'text-muted hover:text-fg',
            )}
          >
            {active && (
              <motion.span
                layoutId={`seg-${id}`}
                className="absolute inset-0 rounded-lg border border-accent bg-brand"
                transition={{ type: 'spring', stiffness: 500, damping: 38 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {o.icon}
              {o.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
