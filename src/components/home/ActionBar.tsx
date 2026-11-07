import { AnimatePresence, motion } from 'framer-motion'
import { MemoryStick, Terminal, FileCheck2 } from 'lucide-react'
import { PlayButton } from './PlayButton'
import { ProfileSelect } from './ProfileSelect'
import { useLaunch } from '@/store/launch'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { audio } from '@/audio/AudioManager'
import { Tooltip } from '@/components/ui/Tooltip'
import { EASE } from '@/lib/cn'

const fmtTime = (s: number) => (s < 60 ? `${Math.ceil(s)}s` : `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`)

function ProgressPanel() {
  const { phase, progress, speed, currentFile, filesDone, filesTotal, bytesDone, bytesTotal, eta } = useLaunch()
  const show = phase === 'verifying' || phase === 'downloading' || phase === 'launching'

  const title = phase === 'verifying' ? 'Verificando arquivos' : phase === 'downloading' ? 'Baixando atualização' : 'Iniciando Minecraft 1.7.10'
  const right =
    phase === 'verifying' ? `${filesDone}/${filesTotal} arquivos`
    : phase === 'downloading' ? `${bytesDone.toFixed(1)} / ${bytesTotal.toFixed(1)} MB`
    : 'Carregando mods (FML)'

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
          transition={{ duration: 0.45, ease: EASE }}
          className="min-w-0 flex-1"
        >
          <div className="mb-2 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">{title}</div>
              <div className="truncate font-mono text-[11px] text-slate-400">{currentFile || '…'}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-display text-2xl font-bold tabular-nums text-white">
                {Math.round(progress * 100)}
                <span className="text-sm text-slate-400">%</span>
              </div>
            </div>
          </div>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-white/[0.07]">
            <motion.div
              className="shimmer shimmer-fast absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-aether-500 via-aether-400 to-rune-400 shadow-[0_0_20px_rgba(124,92,255,.8)]"
              animate={{ width: `${progress * 100}%` }}
              transition={{ type: 'spring', stiffness: 90, damping: 20 }}
            />
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[11px] text-slate-400">
            <span>{right}</span>
            <span>
              {phase !== 'launching' && (
                <>
                  <span className="text-rune-300">{speed.toFixed(1)} MB/s</span> · restam {fmtTime(eta)}
                </>
              )}
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function ActionBar() {
  const phase = useLaunch((s) => s.phase)
  const verifyOnly = useLaunch((s) => s.verifyOnly)
  const memory = useSettings((s) => s.settings.memoryGb)
  const { openSettings, setLogsOpen } = useUi()
  const idle = phase === 'ready' || phase === 'running' || phase === 'stopping'

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.25, duration: 0.8, ease: EASE }}
      className="glass-strong relative flex items-center gap-5 rounded-3xl p-3 pl-5 shadow-2xl shadow-black/40"
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {idle ? (
          <motion.div key="info" layout initial={{ opacity: 0, filter: 'blur(6px)' }} animate={{ opacity: 1, filter: 'blur(0px)' }} exit={{ opacity: 0, filter: 'blur(6px)' }} transition={{ duration: 0.4, ease: EASE }} className="flex flex-1 items-center gap-3">
            <ProfileSelect />
            <div className="ml-1 flex items-center gap-1.5">
              <Tooltip content="Memória alocada · ajustar">
                <button
                  onMouseEnter={() => audio.play('hover')}
                  onClick={() => {
                    audio.play('open')
                    openSettings('performance')
                  }}
                  className="flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  <MemoryStick size={15} className="text-aether-300" /> {memory} GB
                </button>
              </Tooltip>
              <Tooltip content="Verificar integridade dos arquivos">
                <button
                  disabled={phase !== 'ready'}
                  aria-label="Verificar integridade"
                  onMouseEnter={() => audio.play('hover')}
                  onClick={verifyOnly}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white disabled:opacity-40"
                >
                  <FileCheck2 size={16} />
                </button>
              </Tooltip>
              <Tooltip content="Logs em tempo real">
                <button
                  aria-label="Abrir logs"
                  onMouseEnter={() => audio.play('hover')}
                  onClick={() => {
                    audio.play('open')
                    setLogsOpen(true)
                  }}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-white/10 bg-white/[0.03] text-slate-300 transition-colors hover:bg-white/[0.07] hover:text-white"
                >
                  <Terminal size={16} />
                </button>
              </Tooltip>
            </div>
          </motion.div>
        ) : (
          <motion.div key="progress" layout className="flex min-w-0 flex-1">
            <ProgressPanel />
          </motion.div>
        )}
      </AnimatePresence>
      <PlayButton />
    </motion.div>
  )
}
