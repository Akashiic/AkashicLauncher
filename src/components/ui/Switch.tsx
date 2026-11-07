import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { audio } from '@/audio/AudioManager'

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onMouseEnter={() => audio.play('hover')}
      onClick={() => {
        audio.play(checked ? 'toggleOff' : 'toggleOn')
        onChange(!checked)
      }}
      className={cn(
        'no-drag relative h-6 w-11 shrink-0 rounded-full border transition-colors duration-300 ease-out-expo disabled:opacity-40',
        checked ? 'border-accent bg-brand shadow-glow' : 'border-line bg-track',
      )}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 700, damping: 34 }}
        className={cn('absolute top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full', checked ? 'right-[3px] bg-fg' : 'left-[3px] bg-subtle')}
      />
    </button>
  )
}
