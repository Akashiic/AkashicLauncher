import { AnimatePresence, motion } from 'framer-motion'
import { Play, Loader2, Square, ShieldCheck, Download, Rocket, Wrench } from 'lucide-react'
import { useLaunch } from '@/store/launch'
import { useServer } from '@/store/server'
import { audio } from '@/audio/AudioManager'
import { useGlow } from '@/hooks/useGlow'
import { cn, EASE } from '@/lib/cn'
import { useEffect, useState } from 'react'

function useElapsed(since: number, on: boolean) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!on) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [on])
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/** O coração do launcher: botão JOGAR com máquina de estados animada. */
export function PlayButton() {
  const { phase, progress, play, stop, cancel, sessionStart } = useLaunch()
  const server = useServer((s) => s.state)
  const glow = useGlow<HTMLButtonElement>()
  const elapsed = useElapsed(sessionStart, phase === 'running')
  const blocked = phase === 'ready' && server !== 'online'

  const view = (() => {
    if (blocked) return { key: 'blocked', icon: <Wrench size={22} />, title: server === 'maintenance' ? 'EM MANUTENÇÃO' : 'SERVIDOR OFFLINE', sub: 'Tente novamente em instantes' }
    switch (phase) {
      case 'ready':
        return { key: 'ready', icon: <Play size={24} fill="currentColor" />, title: 'JOGAR', sub: 'Pronto para jogar' }
      case 'verifying':
        return { key: 'verifying', icon: <ShieldCheck size={22} />, title: 'VERIFICANDO', sub: `${Math.round(progress * 100)}% · clique para cancelar` }
      case 'downloading':
        return { key: 'downloading', icon: <Download size={22} />, title: 'ATUALIZANDO', sub: `${Math.round(progress * 100)}% · clique para cancelar` }
      case 'launching':
        return { key: 'launching', icon: <Rocket size={22} />, title: 'INICIANDO', sub: 'Minecraft 1.7.10…' }
      case 'running':
        return { key: 'running', icon: <Square size={18} fill="currentColor" />, title: 'EM EXECUÇÃO', sub: `Sessão ${elapsed} · clique para fechar` }
      case 'stopping':
        return { key: 'stopping', icon: <Loader2 size={22} className="animate-spin" />, title: 'FECHANDO', sub: 'Encerrando processo…' }
    }
  })()

  const onClick = () => {
    if (blocked) {
      audio.play('error')
      return
    }
    if (phase === 'ready') play()
    else if (phase === 'verifying' || phase === 'downloading') cancel()
    else if (phase === 'running') {
      audio.play('click')
      stop()
    }
  }

  const busy = phase === 'verifying' || phase === 'downloading' || phase === 'launching'
  const palette =
    blocked ? 'from-slate-600 to-slate-700 shadow-none'
    : phase === 'running' ? 'from-emerald-500 to-teal-600 shadow-[0_10px_50px_-10px_rgba(16,185,129,.8)]'
    : busy ? 'from-aether-600 to-aether-500 shadow-[0_10px_50px_-12px_rgba(124,92,255,.9)]'
    : 'from-aether-400 via-aether-500 to-rune-500 shadow-[0_12px_60px_-10px_rgba(124,92,255,.95)]'

  return (
    <div className="relative">
      {/* halo pulsante quando pronto */}
      {phase === 'ready' && !blocked && (
        <motion.div
          className="pointer-events-none absolute -inset-2 rounded-[22px] bg-gradient-to-r from-aether-500/40 to-rune-400/40 blur-xl"
          animate={{ opacity: [0.35, 0.8, 0.35] }}
          transition={{ duration: 2.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}
      <motion.button
        onClick={onClick}
        onMouseMove={glow}
        onMouseEnter={() => audio.play('hover')}
        whileHover={{ scale: phase === 'launching' || phase === 'stopping' ? 1 : 1.025 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: 'spring', stiffness: 400, damping: 22 }}
        aria-live="polite"
        style={{ '--glow': '255 255 255' } as React.CSSProperties}
        className={cn(
          'glow-border relative flex h-16 w-[300px] items-center gap-4 overflow-hidden rounded-2xl border border-white/20 bg-gradient-to-br px-6 text-left text-white',
          (phase === 'ready' && !blocked) || busy ? 'shimmer' : '',
          busy && 'shimmer-fast',
          palette,
        )}
      >
        {/* preenchimento de progresso dentro do botão */}
        <AnimatePresence>
          {busy && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, width: `${Math.max(2, progress * 100)}%` }}
              exit={{ opacity: 0 }}
              transition={{ width: { type: 'spring', stiffness: 120, damping: 24 }, opacity: { duration: 0.3 } }}
              className="progress-stripes absolute inset-y-0 left-0 bg-white/15"
            />
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={view.key}
            initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
            transition={{ duration: 0.35, ease: EASE }}
            className="relative z-[3] flex items-center gap-4"
          >
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 backdrop-blur">{busy ? <motion.span animate={{ rotate: phase === 'launching' ? [0, -8, 8, 0] : 0 }} transition={{ repeat: Infinity, duration: 0.6 }}>{view.icon}</motion.span> : view.icon}</span>
            <span className="flex flex-col">
              <span className="font-display text-xl font-bold leading-none tracking-[0.12em]">{view.title}</span>
              <span className="mt-1 text-[11px] font-medium text-white/75">{view.sub}</span>
            </span>
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
