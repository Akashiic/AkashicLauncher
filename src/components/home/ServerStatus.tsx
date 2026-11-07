import { useEffect } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Users, Wifi, Activity, Copy } from 'lucide-react'
import { useServer } from '@/store/server'
import { GlowCard } from '@/components/ui/GlowCard'
import { Tooltip } from '@/components/ui/Tooltip'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { cn } from '@/lib/cn'

const STATE = {
  online: { label: 'Online', dot: 'bg-emerald-400', text: 'text-emerald-300', glow: '52 211 153' },
  maintenance: { label: 'Manutenção', dot: 'bg-amber-400', text: 'text-amber-300', glow: '251 191 36' },
  offline: { label: 'Offline', dot: 'bg-rose-400', text: 'text-rose-300', glow: '251 113 133' },
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
  const pingColor = ping < 50 ? 'text-emerald-300' : ping < 100 ? 'text-amber-300' : 'text-rose-300'

  return (
    <GlowCard glow={s.glow} className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="label mb-2">Servidor</div>
          <div className="flex items-center gap-2">
            <span className="font-display text-lg font-semibold text-white">play.akashic.gg</span>
            <Tooltip content="Copiar IP">
              <button
                aria-label="Copiar IP"
                onMouseEnter={() => audio.play('hover')}
                onClick={() => {
                  audio.play('click')
                  navigator.clipboard?.writeText('play.akashic.gg').catch(() => {})
                  toast({ kind: 'info', title: 'IP copiado', body: 'play.akashic.gg' }, 2000)
                }}
                className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
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
            className={cn('flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-semibold', s.text)}
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
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Users size={12} /> Jogadores
          </div>
          <div className="mt-1 font-display text-xl font-semibold text-white">
            <AnimatedNumber value={players} />
            <span className="text-sm text-slate-500">/{maxPlayers}</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Wifi size={12} /> Latência
          </div>
          <div className={cn('mt-1 font-display text-xl font-semibold', state === 'online' ? pingColor : 'text-slate-600')}>
            {state === 'online' ? <AnimatedNumber value={ping} /> : '—'}
            <span className="text-sm text-slate-500">ms</span>
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3">
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <Activity size={12} /> TPS
          </div>
          <div className="mt-1 font-display text-xl font-semibold text-white">{state === 'online' ? <AnimatedNumber value={tps.toFixed(1)} /> : <span className="text-slate-600">—</span>}</div>
        </div>
      </div>

      {/* mini gráfico de jogadores */}
      <div className="mt-4 flex h-10 items-end gap-[3px]">
        {history.map((v, i) => (
          <motion.div
            key={i}
            className={cn('flex-1 rounded-sm', state === 'online' ? 'bg-gradient-to-t from-aether-600/40 to-rune-400/70' : 'bg-white/10')}
            animate={{ height: `${state === 'online' ? Math.max(8, (v / max) * 100) : 8}%` }}
            transition={{ type: 'spring', stiffness: 200, damping: 24 }}
          />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-slate-500">
        <span>últimos 60s</span>
        <span>Forge 1.7.10 · 186 mods</span>
      </div>
    </GlowCard>
  )
}
