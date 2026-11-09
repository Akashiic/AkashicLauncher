import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion'
import { Play, Loader2, Lock } from 'lucide-react'
import { useLaunch } from '@/store/launch'
import { useServer } from '@/store/server'
import { useUi } from '@/store/ui'
import { useFx } from '@/store/fx'
import { audio } from '@/audio/AudioManager'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn, EASE } from '@/lib/cn'

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

const fmtTime = (s: number) => (s < 60 ? `${Math.ceil(s)}s` : `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`)

// brasas pixeladas (posições fixas, atrasos escalonados)
const EMBERS = Array.from({ length: 14 }, (_, i) => ({
  left: `${6 + ((i * 53) % 88)}%`,
  delay: `${((i * 0.41) % 1.7).toFixed(2)}s`,
  dx: `${((i * 37) % 34) - 17}px`,
  size: i % 3 === 0 ? 5 : 4,
}))

const SERVER = {
  online: { label: 'Online', dot: 'bg-success', text: 'text-success' },
  maintenance: { label: 'Manutenção', dot: 'bg-warning', text: 'text-warning' },
  offline: { label: 'Offline', dot: 'bg-danger', text: 'text-danger-text' },
} as const

/**
 * JOGAR: o coração do launcher. Energia girando na borda, lava viva por dentro,
 * brasas no hover e ligação direta com o portal da cena (acende, carrega e pulsa).
 */
export function CommandPlay() {
  const { phase, progress, speed, eta, filesDone, filesTotal, currentFile, play, stop, cancel, sessionStart } = useLaunch()
  const { state: server, players, maxPlayers, cycleState } = useServer()
  const route = useUi((s) => s.route)
  const { playHover, setPlayHover, firePulse } = useFx()
  const elapsed = useElapsed(sessionStart, phase === 'running')
  const [shock, setShock] = useState(0)
  // efeito magnético: o botão é levemente puxado em direção ao cursor
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 220, damping: 18 })
  const sy = useSpring(my, { stiffness: 220, damping: 18 })
  const magnet = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    mx.set(((e.clientX - r.left) / r.width - 0.5) * 12)
    my.set(((e.clientY - r.top) / r.height - 0.5) * 8)
  }
  const unmagnet = () => {
    mx.set(0)
    my.set(0)
  }

  const blocked = phase === 'ready' && server !== 'online'
  const ready = phase === 'ready' && !blocked
  const busy = phase === 'verifying' || phase === 'downloading' || phase === 'launching'
  const live = phase === 'running' || phase === 'stopping'
  const hot = (ready && playHover) || busy
  const pct = Math.round(progress * 100)
  const s = SERVER[server]

  const view = (() => {
    if (blocked) return { key: 'blocked', label: server === 'maintenance' ? 'MANUTENÇÃO' : 'OFFLINE', right: null, icon: <Lock size={18} /> }
    switch (phase) {
      case 'ready':
        return { key: 'ready', label: 'JOGAR', right: null, icon: <Play size={22} fill="currentColor" /> }
      case 'verifying':
        return { key: 'verifying', label: 'VERIFICANDO', right: `${pct}%`, icon: null }
      case 'downloading':
        return { key: 'downloading', label: 'ATUALIZANDO', right: `${pct}%`, icon: null }
      case 'launching':
        return { key: 'launching', label: 'ABRINDO O PORTAL', right: `${pct}%`, icon: null }
      case 'running':
        return { key: 'running', label: 'EM EXECUÇÃO', right: null, icon: <span className="h-2.5 w-2.5 rounded-full bg-success shadow-glow" /> }
      case 'stopping':
        return { key: 'stopping', label: 'FECHANDO', right: null, icon: <Loader2 size={18} className="animate-spin" /> }
    }
  })()

  const busyLine =
    phase === 'verifying' ? `${filesDone}/${filesTotal} arquivos verificados · clique para cancelar`
    : phase === 'downloading' ? `${speed.toFixed(1)} MB/s · restam ${fmtTime(eta)} · clique para cancelar`
    : phase === 'launching' ? currentFile || 'Carregando mods…'
    : phase === 'running' ? `Sessão ${elapsed} · clique para fechar o jogo`
    : phase === 'stopping' ? 'Encerrando o jogo…'
    : null

  const activate = () => {
    if (blocked) return audio.play('error')
    if (phase === 'ready') {
      setShock((n) => n + 1)
      firePulse()
      setPlayHover(false)
      play()
    } else if (phase === 'verifying' || phase === 'downloading') cancel()
    else if (phase === 'running') {
      audio.play('click')
      stop()
    }
  }

  // Enter joga a partir do Início (quando nada está focado)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || route !== 'home' || phase !== 'ready') return
      const el = document.activeElement
      if (el && el !== document.body) return
      if (document.querySelector('[role="dialog"]')) return
      e.preventDefault()
      activate()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="flex flex-col">
      <motion.div style={{ x: sx, y: sy }} onMouseMove={magnet} onMouseLeave={unmagnet} className={cn('relative rounded-xl', hot && 'play-hot')}>
        {/* brasas subindo (fora do botão para não serem cortadas) */}
        <div className="play-embers" aria-hidden>
          {EMBERS.map((e, i) => (
            <span key={i} className="play-ember" style={{ left: e.left, width: e.size, height: e.size, animationDelay: e.delay, '--dx': e.dx } as React.CSSProperties} />
          ))}
        </div>

        {/* onda de choque do clique */}
        <AnimatePresence>
          {shock > 0 && (
            <motion.span
              key={shock}
              aria-hidden
              initial={{ opacity: 0.9, scale: 1 }}
              animate={{ opacity: 0, scale: 1.45 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.8, ease: EASE }}
              className="pointer-events-none absolute inset-0 rounded-xl border-2 border-accent-strong shadow-glow-strong"
            />
          )}
        </AnimatePresence>

        <motion.button
          onClick={activate}
          onMouseEnter={() => {
            audio.play('hover')
            if (ready) setPlayHover(true)
          }}
          onMouseLeave={() => setPlayHover(false)}
          onFocus={() => ready && setPlayHover(true)}
          onBlur={() => setPlayHover(false)}
          whileHover={{ scale: ready ? 1.025 : 1 }}
          whileTap={{ scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 420, damping: 22 }}
          aria-live="polite"
          aria-disabled={blocked || undefined}
          className={cn(
            'relative flex h-[76px] w-full items-center overflow-hidden rounded-xl border-2 px-4 text-fg transition-[background-color,box-shadow,border-color] duration-300',
            blocked && 'cursor-not-allowed border-line-strong bg-surface-2 text-muted',
            ready && 'border-accent bg-brand shadow-glow hover:shadow-glow-strong',
            busy && 'border-accent bg-surface-2 shadow-glow',
            live && 'border-success bg-surface-2 hover:bg-surface',
          )}
        >
          {ready && <span className="play-lava" aria-hidden />}
          <span className="play-pixels" aria-hidden />

          {/* progresso: preenchimento vinho com ponta vermelha */}
          <AnimatePresence>
            {busy && (
              <motion.span
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: `${Math.max(2, progress * 100)}%` }}
                exit={{ opacity: 0 }}
                transition={{ width: { type: 'spring', stiffness: 110, damping: 22 }, opacity: { duration: 0.3 } }}
                className="progress-stripes absolute inset-y-0 left-0 border-r-[3px] border-accent-strong bg-brand shadow-glow-strong"
                aria-hidden
              />
            )}
          </AnimatePresence>

          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={view.key}
              initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -14, filter: 'blur(6px)' }}
              transition={{ duration: 0.3, ease: EASE }}
              className={cn('relative z-[3] flex w-full items-center gap-3', view.right ? 'justify-between' : 'justify-center')}
            >
              <span className="flex items-center gap-3">
                {view.icon && (
                  <motion.span animate={ready && playHover ? { x: [0, 3, 0] } : { x: 0 }} transition={{ duration: 0.9, repeat: ready && playHover ? Infinity : 0 }}>
                    {view.icon}
                  </motion.span>
                )}
                <span className={cn('font-display', view.key === 'ready' ? 'play-title text-[48px] tracking-[4px]' : view.key === 'launching' ? 'text-[26px]' : 'text-[30px]')}>{view.label}</span>
              </span>
              {view.right && <span className="play-title font-display text-[30px] tabular-nums">{view.right}</span>}
            </motion.span>
          </AnimatePresence>
        </motion.button>

        {/* energia girando pela borda */}
        {(ready || busy) && <span className={cn('energy-border', busy && 'energy-fast')} aria-hidden />}
      </motion.div>

      {/* linha de contexto: status do servidor quando parado, progresso/sessão quando ativo */}
      <div className="mt-2 flex h-5 items-center justify-center gap-2 text-xs text-muted">
        {busyLine ? (
          <span className="truncate" title={busyLine}>
            {busyLine}
          </span>
        ) : (
          <>
            <Tooltip content="Simular outro estado do servidor (mock)">
              <button
                aria-label={`Servidor ${s.label}`}
                onMouseEnter={() => audio.play('hover')}
                onClick={() => {
                  audio.play('tab')
                  cycleState()
                }}
                className="flex items-center gap-1.5 rounded-md px-1 transition-colors hover:bg-overlay/[0.06]"
              >
                <span className="relative flex h-2 w-2">
                  <span className={cn('pulse-ring absolute h-full w-full rounded-full', s.dot)} />
                  <span className={cn('relative h-2 w-2 rounded-full', s.dot)} />
                </span>
                <span className={cn('font-semibold', s.text)}>{s.label}</span>
              </button>
            </Tooltip>
            {server === 'online' ? (
              <>
                <span className="tabular-nums">· {players}/{maxPlayers} jogadores</span>
                <span className="text-subtle">·</span>
                <kbd className="rounded border border-line bg-overlay/[0.05] px-1.5 font-sans text-[11px] text-muted">Enter ↵</kbd>
              </>
            ) : (
              <span>· tente em instantes</span>
            )}
          </>
        )}
      </div>
    </div>
  )
}
