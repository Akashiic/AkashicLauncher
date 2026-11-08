import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Volume2, VolumeX, Settings2, Music2 } from 'lucide-react'
import { useSettings } from '@/store/settings'
import { useLaunch } from '@/store/launch'
import { useUi } from '@/store/ui'
import { audio } from '@/audio/AudioManager'
import { PlayerHead } from '@/components/ui/PlayerHead'
import { Slider } from '@/components/ui/Slider'
import { Switch } from '@/components/ui/Switch'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn, EASE } from '@/lib/cn'

function VolumePopover({ onClose }: { onClose: () => void }) {
  const a = useSettings((s) => s.settings.audio)
  const setAudio = useSettings((s) => s.setAudio)
  return (
    <motion.div
      initial={{ opacity: 0, y: 8, scale: 0.97, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: 6, filter: 'blur(4px)' }}
      transition={{ duration: 0.28, ease: EASE }}
      className="panel-raised absolute bottom-[calc(100%+10px)] left-0 right-0 z-50 rounded-2xl p-4"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="label">Volume geral</span>
        <span className="font-mono text-xs text-muted">{a.master.muted ? 'mudo' : `${Math.round(a.master.volume * 100)}%`}</span>
      </div>
      <Slider label="Volume geral" min={0} max={100} value={Math.round(a.master.volume * 100)} onChange={(v) => setAudio('master', { volume: v / 100, muted: false })} />
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        <span className="flex items-center gap-2 text-sm text-fg">
          <Music2 size={14} className="text-muted" /> Música
        </span>
        <Switch checked={!a.bgm.muted} label="Música" onChange={(on) => setAudio('bgm', { muted: !on })} />
      </div>
    </motion.div>
  )
}

/** Rodapé da coluna: jogador, volume e acesso às configurações. */
export function UserBar() {
  const nickname = useSettings((s) => s.settings.nickname)
  const muted = useSettings((s) => s.settings.audio.master.muted || s.settings.audio.master.volume === 0)
  const running = useLaunch((s) => s.phase === 'running')
  const { route, navigate } = useUi()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const iconBtn = 'grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-overlay/[0.07] hover:text-fg'

  return (
    <div ref={ref} className="relative mt-3 flex items-center gap-2.5 border-t border-line pt-3">
      <div className="relative shrink-0 rounded-md">
        <PlayerHead name={nickname} size={30} />
        <span className={cn('absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface', running ? 'bg-accent-strong' : 'bg-success')} />
      </div>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-semibold text-fg">{nickname}</span>
        <span className={cn('text-xs', running ? 'text-accent-text' : 'text-success')}>{running ? 'Jogando' : 'Online'}</span>
      </span>
      <Tooltip content="Volume" disabled={open}>
        <button
          aria-label="Volume"
          aria-expanded={open}
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play(open ? 'close' : 'click')
            setOpen((v) => !v)
          }}
          className={cn(iconBtn, open ? 'bg-overlay/[0.07] text-fg' : 'text-muted')}
        >
          {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </Tooltip>
      <Tooltip content="Configurações">
        <button
          aria-label="Configurações"
          aria-current={route === 'settings' ? 'page' : undefined}
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play(route === 'settings' ? 'close' : 'open')
            navigate(route === 'settings' ? 'home' : 'settings')
          }}
          className={cn(iconBtn, route === 'settings' ? 'bg-brand text-fg' : 'text-muted')}
        >
          <Settings2 size={16} />
        </button>
      </Tooltip>
      <AnimatePresence>{open && <VolumePopover onClose={() => setOpen(false)} />}</AnimatePresence>
    </div>
  )
}
