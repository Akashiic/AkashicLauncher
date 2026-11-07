import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Users, Wifi, Activity, Copy } from 'lucide-react'
import { useServer } from '@/store/server'
import { GlowCard } from '@/components/ui/GlowCard'
import { Tooltip } from '@/components/ui/Tooltip'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { cn } from '@/lib/cn'
import { TONE_VAR } from '@/theme'
import { Versioned } from '@/components/ui/Version'

const STATE = {
  online: { label: 'Online', dot: 'bg-success', text: 'text-success', glow: TONE_VAR.success },
  maintenance: { label: 'Manutenção', dot: 'bg-warning', text: 'text-warning', glow: TONE_VAR.warning },
  offline: { label: 'Offline', dot: 'bg-danger', text: 'text-danger-text', glow: TONE_VAR.danger },
} as const

function AnimatedNumber({ value, className }: { value: number | string; className?: string }) {
  return (
    <span className={cn('relative inline-flex overflow-hidden tabular-nums', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span key={value} initial={{ y: '-70%', opacity: 0, filter: 'blur(3px)' }} animate={{ y: 0, opacity: 1, filter: 'blur(0px)' }} exit={{ y: '70%', opacity: 0, filter: 'blur(3px)' }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}

export function ServerStatus() {
  const { state, players, maxPlayers, ping, tps, history, tick, cycleState } = useServer()
  useEffect(() => {
    const id = window.setInterval(tick, 2800)
    return () => window.clearInterval(id)
  }, [tick])

  const s = STATE[state]
  const max = Math.max(...history, 1)
  const pingColor = ping < 50 ? 'text-success' : ping < 100 ? 'text-warning' : 'text-danger-text'

  return (
    <GlowCard glow={s.glow} className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="label mb-2">Servidor</div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold text-fg">play.akashic.gg</span>
            <Tooltip content="Copiar IP">
              <button
                aria-label="Copiar IP"
                onMouseEnter={() => audio.play('hover')}
                onClick={() => {
                  audio.play('click')
                  navigator.clipboard?.writeText('play.akashic.gg').catch(() => {})
                  toast({ kind: 'info', title: 'IP copiado', body: 'play.akashic.gg' }, 2000)
                }}
                className="rounded-md p-1 text-subtle transition-colors hover:bg-overlay/[0.06] hover:text-fg"
              >
                <Copy size={13} />
              </button>
            </Tooltip>
          </div>
        </div>
        <Tooltip content="Clique para simular outro estado (mock)" side="left">
          <button
            onMouseEnter={() => audio.play('hover')}
            onClick={() => {
              audio.play('tab')
              cycleState()
            }}
            className={cn('flex items-center gap-2 rounded-full border border-line bg-bg/60 px-3 py-1 text-xs font-semibold', s.text)}
          >
            <span className="relative flex h-2 w-2">
              <span className={cn('absolute h-full w-full rounded-full pulse-ring', s.dot)} />
              <span className={cn('relative h-2 w-2 rounded-full', s.dot)} />
            </span>
            {s.label}
          </button>
        </Tooltip>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-line bg-bg/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <Users size={12} /> Jogadores
          </div>
          <div className="mt-1 font-display text-[32px] text-accent-strong">
            <AnimatedNumber value={players} />
            <span className="text-sm text-subtle">/{maxPlayers}</span>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-bg/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <Wifi size={12} /> Latência
          </div>
          <div className={cn('mt-1 font-display text-[32px]', state === 'online' ? pingColor : 'text-subtle')}>
            {state === 'online' ? <AnimatedNumber value={ping} /> : '—'}
            <span className="text-sm text-subtle">ms</span>
          </div>
        </div>
        <div className="rounded-xl border border-line bg-bg/60 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <Activity size={12} /> TPS
          </div>
          <div className="mt-1 font-display text-[32px] text-accent-strong">{state === 'online' ? <AnimatedNumber value={tps.toFixed(1)} /> : <span className="text-subtle">—</span>}</div>
        </div>
      </div>

      {/* mini gráfico de jogadores */}
      <div className="mt-4 flex h-10 items-end gap-[3px]">
        {history.map((v, i) => (
          <motion.div
            key={i}
            className={cn('flex-1 rounded-sm', state === 'online' ? 'bg-brand' : 'bg-track')}
            animate={{ height: `${state === 'online' ? Math.max(8, (v / max) * 100) : 8}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] text-subtle">
        <span>últimos 60s</span>
        <span>
          <Versioned text="Forge 1.7.10 · 186 mods" />
        </span>
      </div>
    </GlowCard>
  )
}
