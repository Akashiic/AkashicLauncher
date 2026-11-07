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
  // JOGAR: fundo --brand, borda 2px --accent; hover --brand-hover + brilho; bloqueado = 40% de opacidade
  const palette =
    blocked ? 'bg-brand border-accent opacity-40 cursor-not-allowed'
    : phase === 'running' ? 'bg-surface-2 border-success hover:bg-surface'
    : busy ? 'bg-brand border-accent shadow-glow'
    : 'bg-brand border-accent hover:bg-brand-hover hover:shadow-glow-strong'

  return (
    <div className="relative">
      {/* halo pulsante quando pronto */}
      {phase === 'ready' && !blocked && (
        <motion.div
          className="pointer-events-none absolute -inset-1.5 rounded-2xl bg-accent/30 blur-lg"
          animate={{ opacity: [0.2, 0.6, 0.2] }}
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
        aria-disabled={blocked || undefined}
        style={{ '--glow': phase === 'running' ? 'var(--success)' : 'var(--accent-strong)' } as React.CSSProperties}
        className={cn(
          'glow-border relative flex h-16 w-[300px] items-center gap-4 overflow-hidden rounded-xl border-2 px-6 text-left text-fg transition-[background-color,box-shadow] duration-300',
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
              className="progress-stripes absolute inset-y-0 left-0 bg-brand-hover"
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
            <span className={cn('grid h-10 w-10 place-items-center rounded-lg', phase === 'running' ? 'bg-success/15 text-success' : 'bg-shade/30')}>{busy ? <motion.span animate={{ rotate: phase === 'launching' ? [0, -8, 8, 0] : 0 }} transition={{ repeat: Infinity, duration: 0.6 }}>{view.icon}</motion.span> : view.icon}</span>
            <span className="flex flex-col">
              <span className="font-display text-[30px]">{view.title}</span>
              <span className="mt-0.5 text-xs text-fg/80">{view.sub}</span>
            </span>
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  )
}
