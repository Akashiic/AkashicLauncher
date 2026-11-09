import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUpCircle, Loader2 } from 'lucide-react'
import { bridge, type LauncherUpdateInfo } from '@/lib/bridge'
import { useLaunch } from '@/store/launch'
import { audio } from '@/audio/AudioManager'
import { toast } from '@/store/toasts'
import { cn, EASE } from '@/lib/cn'

const CHECK_EVERY = 6 * 60 * 60 * 1000

/**
 * Aviso discreto na barra superior quando sai uma versão nova do launcher.
 * Nunca aparece com o jogo aberto; um clique baixa, instala e reinicia.
 */
export function LauncherUpdate() {
  const [info, setInfo] = useState<LauncherUpdateInfo | null>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const phase = useLaunch((s) => s.phase)
  const busy = phase !== 'ready'

  useEffect(() => {
    const up = bridge.updater
    if (!up) return
    let alive = true
    const check = () =>
      void up
        .check()
        .then((i) => alive && setInfo(i))
        .catch(() => {})
    const first = window.setTimeout(check, 4000) // depois da abertura, sem competir com ela
    const id = window.setInterval(check, CHECK_EVERY)
    const off = up.onProgress(({ downloaded, total }) => setProgress(total ? downloaded / total : null))
    return () => {
      alive = false
      window.clearTimeout(first)
      window.clearInterval(id)
      off()
    }
  }, [])

  const install = () => {
    if (!bridge.updater || progress !== null) return
    audio.play('click')
    setProgress(0)
    const up = bridge.updater
    up.install().catch((e) => {
      setProgress(null)
      audio.play('error')
      toast({ kind: 'error', title: 'Atualização do launcher', body: String(e) })
      // prepara de novo para o jogador poder tentar outra vez
      void up.check().then(setInfo).catch(() => setInfo(null))
    })
  }

  const show = !!info && !busy
  const downloading = progress !== null
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.35, ease: EASE }}
          onMouseEnter={() => audio.play('hover')}
          onClick={install}
          disabled={downloading}
          title={info.notes ?? undefined}
          className={cn(
            'no-drag relative mr-2 flex h-7 items-center gap-1.5 overflow-hidden rounded-full border border-accent/50 bg-brand/40 px-3 text-xs font-semibold text-fg transition-colors',
            !downloading && 'hover:border-accent hover:bg-brand/70',
          )}
        >
          {downloading && <span className="absolute inset-y-0 left-0 bg-accent/30 transition-[width] duration-200" style={{ width: `${Math.round((progress ?? 0) * 100)}%` }} />}
          <span className="relative flex items-center gap-1.5">
            {downloading ? <Loader2 size={13} className="animate-spin" /> : <ArrowUpCircle size={13} className="text-accent-text" />}
            {downloading ? `Atualizando o launcher… ${Math.round((progress ?? 0) * 100)}%` : `Launcher ${info.version} disponível · atualizar`}
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  )
}
