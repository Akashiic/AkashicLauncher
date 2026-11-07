import { AnimatePresence, motion } from 'framer-motion'
import { PlayButton } from './PlayButton'
import { ProfileSelect } from './ProfileSelect'
import { ServerStatus } from './ServerStatus'
import { useLaunch } from '@/store/launch'
import { EASE } from '@/lib/cn'

const fmtTime = (s: number) => (s < 60 ? `${Math.ceil(s)}s` : `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`)

/** Progresso enxuto: etapa, porcentagem, barra e tempo restante. */
function ProgressPanel() {
  const { phase, progress, speed, eta } = useLaunch()
  const title = phase === 'verifying' ? 'Verificando arquivos' : phase === 'downloading' ? 'Baixando atualização' : 'Iniciando o jogo'

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-2 flex items-baseline justify-between gap-4">
        <span className="text-sm font-semibold text-fg">{title}</span>
        <span className="font-display text-[28px] tabular-nums text-accent-strong">{Math.round(progress * 100)}%</span>
      </div>
      <div className="progress-track relative h-2 overflow-hidden rounded-full">
        <motion.div
          className="progress-fill shimmer shimmer-fast absolute inset-y-0 left-0 rounded-full"
          animate={{ width: `${progress * 100}%` }}
          transition={{ type: 'spring', stiffness: 90, damping: 20 }}
        />
      </div>
      <div className="mt-1.5 h-4 text-xs text-subtle">
        {phase !== 'launching' && (
          <>
            {speed.toFixed(1)} MB/s · restam {fmtTime(eta)}
          </>
        )}
      </div>
    </div>
  )
}

export function ActionBar() {
  const phase = useLaunch((s) => s.phase)
  const idle = phase === 'ready' || phase === 'running' || phase === 'stopping'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.8, ease: EASE }}
      className="flex items-center gap-8"
    >
      <AnimatePresence mode="wait" initial={false}>
        {idle ? (
          <motion.div
            key="info"
            initial={{ opacity: 0, filter: 'blur(6px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(6px)' }}
            transition={{ duration: 0.35, ease: EASE }}
            className="flex flex-1 items-center gap-6"
          >
            <ProfileSelect />
            <ServerStatus />
          </motion.div>
        ) : (
          <motion.div
            key="progress"
            initial={{ opacity: 0, filter: 'blur(6px)' }}
            animate={{ opacity: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, filter: 'blur(6px)' }}
            transition={{ duration: 0.35, ease: EASE }}
            className="flex min-w-0 flex-1"
          >
            <ProgressPanel />
          </motion.div>
        )}
      </AnimatePresence>
      <PlayButton />
    </motion.div>
  )
}
