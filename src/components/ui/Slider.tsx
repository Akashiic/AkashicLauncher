import { useRef } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'
import { audio } from '@/audio/AudioManager'

interface SliderProps {
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  label: string
  color?: string // classe tailwind de gradiente para o preenchimento
  glow?: string // rgba para brilho
  marks?: number[]
  formatMark?: (v: number) => string
  zones?: { from: number; to: number; className: string }[]
  disabled?: boolean
}

/** Slider customizado: input range nativo invisível por cima (teclado/acessibilidade) + visual próprio. */
export function Slider({ value, min, max, step = 1, onChange, label, color = 'from-aether-500 to-rune-400', glow = 'rgba(124,92,255,.65)', marks, formatMark, zones, disabled }: SliderProps) {
  const last = useRef(value)
  const pct = ((value - min) / (max - min)) * 100
  const at = (v: number) => ((v - min) / (max - min)) * 100

  return (
    <div className={cn('no-drag relative select-none', disabled && 'opacity-40')}>
      <div className="relative h-7">
        {/* trilho */}
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full bg-white/[0.07]">
          {zones?.map((z) => (
            <div key={z.from} className={cn('absolute inset-y-0 opacity-25', z.className)} style={{ left: `${at(z.from)}%`, width: `${at(z.to) - at(z.from)}%` }} />
          ))}
          <motion.div
            className={cn('absolute inset-y-0 left-0 rounded-full bg-gradient-to-r shimmer', color)}
            style={{ width: `${pct}%`, boxShadow: `0 0 16px ${glow}` }}
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          />
        </div>
        {/* thumb */}
        <motion.div
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-void-900"
          style={{ left: `${pct}%`, boxShadow: `0 0 0 4px rgba(255,255,255,.06), 0 0 18px ${glow}` }}
        />
        <input
          type="range"
          aria-label={label}
          className="sr-range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onMouseEnter={() => audio.play('hover')}
          onChange={(e) => {
            const v = Number(e.target.value)
            if (v !== last.current) {
              audio.play('tick', { pitch: 0.75 + ((v - min) / (max - min)) * 0.7 })
              last.current = v
            }
            onChange(v)
          }}
        />
      </div>
      {marks && (
        <div className="relative mt-1 h-4">
          {marks.map((m) => (
            <span key={m} className={cn('absolute -translate-x-1/2 font-mono text-[10px] transition-colors', m <= value ? 'text-slate-300' : 'text-slate-600')} style={{ left: `${at(m)}%` }}>
              {formatMark ? formatMark(m) : m}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
