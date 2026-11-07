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
  /** Token de cor do preenchimento/brilho, ex.: 'var(--success)'. Padrão: barra do tema (vinho + ponta vermelha). */
  tone?: string
  marks?: number[]
  formatMark?: (v: number) => string
  zones?: { from: number; to: number; className: string }[]
  disabled?: boolean
}

/** Slider customizado: input range nativo invisível por cima (teclado/acessibilidade) + visual próprio. */
export function Slider({ value, min, max, step = 1, onChange, label, tone, marks, formatMark, zones, disabled }: SliderProps) {
  const last = useRef(value)
  const pct = ((value - min) / (max - min)) * 100
  const at = (v: number) => ((v - min) / (max - min)) * 100

  return (
    <div className={cn('no-drag relative select-none', disabled && 'opacity-40')}>
      <div className="relative h-7">
        {/* trilho */}
        <div className="progress-track absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 overflow-hidden rounded-full">
          {zones?.map((z) => (
            <div key={z.from} className={cn('absolute inset-y-0 opacity-30', z.className)} style={{ left: `${at(z.from)}%`, width: `${at(z.to) - at(z.from)}%` }} />
          ))}
          <motion.div
            className={cn('absolute inset-y-0 left-0 rounded-full', !tone && 'progress-fill')}
            style={{ width: `${pct}%`, ...(tone ? { background: tone } : {}) }}
            transition={{ type: 'spring', stiffness: 500, damping: 40 }}
          />
        </div>
        {/* thumb */}
        <div
          className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-fg bg-bg shadow-glow"
          style={{ left: `${pct}%`, ...(tone ? { borderColor: tone } : {}) }}
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
            <span key={m} className={cn('absolute -translate-x-1/2 font-mono text-[11px] transition-colors', m <= value ? 'text-muted' : 'text-subtle')} style={{ left: `${at(m)}%` }}>
              {formatMark ? formatMark(m) : m}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
