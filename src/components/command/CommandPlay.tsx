import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Play, Loader2, Wrench } from 'lucide-react'
import { useLaunch } from '@/store/launch'
import { useServer } from '@/store/server'
import { useSettings } from '@/store/settings'
import { audio } from '@/audio/AudioManager'
import { useGlow } from '@/hooks/useGlow'
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

/** JOGAR da coluna de comando: estados, progresso dentro do botão e linha de contexto abaixo. */
export function CommandPlay() {
  const { phase, progress, speed, eta, filesDone, filesTotal, currentFile, play, stop, cancel, sessionStart } = useLaunch()
  const server = useServer((s) => s.state)
  const memory = useSettings((s) => s.settings.memoryGb)
  const glow = useGlow<HTMLButtonElement>()
  const elapsed = useElapsed(sessionStart, phase === 'running')
  const blocked = phase === 'ready' && server !== 'online'
  const busy = phase === 'verifying' || phase === 'downloading' || phase === 'launching'
  const pct = Math.round(progress * 100)

  const view = (() => {
    if (blocked)
      return { key: 'blocked', label: server === 'maintenance' ? 'MANUTENÇÃO' : 'OFFLINE', right: null, icon: <Wrench size={18} />, line: 'Servidor indisponível · tente em instantes' }
    switch (phase) {
      case 'ready':
        return { key: 'ready', label: 'JOGAR', right: null, icon: <Play size={20} fill="currentColor" />, line: `Tudo pronto · ${memory} GB de RAM` }
      case 'verifying':
        return { key: 'verifying', label: 'VERIFICANDO', right: `${pct}%`, icon: null, line: `${filesDone}/${filesTotal} arquivos · clique para cancelar` }
      case 'downloading':
        return { key: 'downloading', label: 'ATUALIZANDO', right: `${pct}%`, icon: null, line: `${speed.toFixed(1)} MB/s · restam ${fmtTime(eta)} · clique para cancelar` }
      case 'launching':
        return { key: 'launching', label: 'INICIANDO', right: `${pct}%`, icon: null, line: currentFile || 'Carregando mods…' }
      case 'running':
        return { key: 'running', label: 'EM EXECUÇÃO', right: null, icon: <span className="h-2.5 w-2.5 rounded-full bg-success shadow-glow" />, line: `Sessão ${elapsed} · clique para fechar o jogo` }
      case 'stopping':
        return { key: 'stopping', label: 'FECHANDO', right: null, icon: <Loader2 size={18} className="animate-spin" />, line: 'Encerrando o jogo…' }
    }
  })()

  const onClick = () => {
    if (blocked) return audio.play('error')
    if (phase === 'ready') play()
    else if (phase === 'verifying' || phase === 'downloading') cancel()
    else if (phase === 'running') {
      audio.play('click')
      stop()
    }
  }

  return (
    <div className="flex flex-col">
      <motion.button
        onClick={onClick}
        onMouseMove={glow}
        onMouseEnter={() => audio.play('hover')}
        whileHover={{ scale: busy || phase === 'stopping' ? 1 : 1.015 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 420, damping: 24 }}
        aria-live="polite"
        aria-disabled={blocked || undefined}
        style={{ '--glow': phase === 'running' ? 'var(--success)' : 'var(--accent-strong)' } as React.CSSProperties}
        className={cn(
          'glow-border relative flex h-16 w-full items-center overflow-hidden rounded-xl border-2 px-4 text-fg transition-[background-color,box-shadow] duration-300',
          blocked && 'cursor-not-allowed border-accent bg-brand opacity-40',
          !blocked && phase === 'ready' && 'shimmer border-accent bg-brand shadow-glow hover:bg-brand-hover hover:shadow-glow-strong',
          busy && 'border-accent bg-brand',
          (phase === 'running' || phase === 'stopping') && 'border-success bg-surface-2 hover:bg-surface',
        )}
      >
        {/* progresso dentro do botão: preenchimento vinho com ponta vermelha */}
        <AnimatePresence>
          {busy && (
            <motion.span
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: `${Math.max(2, progress * 100)}%` }}
              exit={{ opacity: 0 }}
              transition={{ width: { type: 'spring', stiffness: 110, damping: 22 }, opacity: { duration: 0.3 } }}
              className="progress-stripes absolute inset-y-0 left-0 border-r-[3px] border-accent-strong bg-brand-hover"
            />
          )}
        </AnimatePresence>
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={view.key}
            initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -12, filter: 'blur(6px)' }}
            transition={{ duration: 0.3, ease: EASE }}
            className={cn('relative z-[3] flex w-full items-center gap-3', view.right ? 'justify-between' : 'justify-center')}
          >
            <span className="flex items-center gap-3">
              {view.icon}
              <span className={cn('font-display', view.key === 'ready' ? 'text-[42px] tracking-[3px]' : 'text-[30px]')}>{view.label}</span>
            </span>
            {view.right && <span className="font-display text-[30px] tabular-nums">{view.right}</span>}
          </motion.span>
        </AnimatePresence>
      </motion.button>
      <span className="mt-1.5 h-4 truncate text-center text-xs text-muted" title={view.line}>
        {view.line}
      </span>
    </div>
  )
}
