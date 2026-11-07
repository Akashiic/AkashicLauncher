import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Minus, Square, X, Copy, Volume2, VolumeX, Music2, Settings2, Check, Loader2 } from 'lucide-react'
import { bridge } from '@/lib/bridge'
import { audio } from '@/audio/AudioManager'
import { useSettings } from '@/store/settings'
import { useUi } from '@/store/ui'
import { Slider } from '@/components/ui/Slider'
import { Tooltip } from '@/components/ui/Tooltip'
import { cn } from '@/lib/cn'

function WinButton({ onClick, label, children, danger }: { onClick: () => void; label: string; children: React.ReactNode; danger?: boolean }) {
  return (
    <button
      aria-label={label}
      title={label}
      onMouseEnter={() => audio.play('hover')}
      onClick={() => {
        audio.play('click')
        onClick()
      }}
      className={cn(
        'no-drag grid h-full w-12 place-items-center text-muted transition-colors duration-200',
        danger ? 'hover:bg-danger/90 hover:text-fg' : 'hover:bg-overlay/[0.07] hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function SaveIndicator() {
  const state = useSettings((s) => s.saveState)
  return (
    <AnimatePresence>
      {state !== 'idle' && (
        <motion.div
          initial={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
          className={cn('flex items-center gap-1.5 text-xs', state === 'error' ? 'text-fg' : 'text-muted')}
        >
          {state === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-success" />}
          {state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Configurações salvas' : 'Erro ao salvar'}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function VolumeQuick() {
  const [open, setOpen] = useState(false)
  const a = useSettings((s) => s.settings.audio)
  const setAudio = useSettings((s) => s.setAudio)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  const allMuted = a.master.muted || a.master.volume === 0
  return (
    <div ref={ref} className="no-drag relative flex items-center">
      <Tooltip content="Música (BGM)" side="bottom">
        <button
          aria-label="Alternar música"
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play(a.bgm.muted ? 'toggleOn' : 'toggleOff')
            setAudio('bgm', { muted: !a.bgm.muted })
          }}
          className={cn('grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-overlay/[0.07]', a.bgm.muted ? 'text-muted' : 'text-fg')}
        >
          <Music2 size={15} className={cn(a.bgm.muted && 'opacity-50')} />
        </button>
      </Tooltip>
      <Tooltip content="Volume geral" side="bottom">
        <button
          aria-label="Volume geral"
          onMouseEnter={() => audio.play('hover')}
          onClick={() => {
            audio.play('click')
            setOpen((v) => !v)
          }}
          className={cn('grid h-8 w-8 place-items-center rounded-lg transition-colors hover:bg-overlay/[0.07]', allMuted ? 'text-muted' : 'text-fg')}
        >
          {allMuted ? <VolumeX size={16} /> : <Volume2 size={16} />}
        </button>
      </Tooltip>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, y: -6, scale: 0.97, filter: 'blur(4px)' }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="panel-raised absolute right-0 top-10 z-50 w-64 rounded-2xl p-4 shadow-popover"
          >
            <div className="mb-3 flex items-center justify-between">
              <span className="label">Volume geral</span>
              <span className="font-mono text-xs text-muted">{Math.round(a.master.volume * 100)}%</span>
            </div>
            <Slider label="Volume geral" min={0} max={100} value={Math.round(a.master.volume * 100)} onChange={(v) => setAudio('master', { volume: v / 100, muted: false })} />
            <button
              onClick={() => {
                audio.play('click')
                setAudio('master', { muted: !a.master.muted })
              }}
              className="mt-3 w-full rounded-lg border border-line bg-overlay/[0.04] py-1.5 text-xs font-medium text-muted transition-colors hover:bg-overlay/[0.08]"
            >
              {a.master.muted ? 'Ativar som' : 'Silenciar tudo'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function TitleBar() {
  const [max, setMax] = useState(false)
  const openSettings = useUi((s) => s.openSettings)
  useEffect(() => bridge.window.onMaximized(setMax), [])

  return (
    <header className="drag relative z-40 flex h-10 shrink-0 items-center justify-between border-b border-accent/40 bg-brand pl-4">
      <div className="flex items-center gap-3">
        <span className="font-display text-[19px] text-fg">
          Forbidden Series
        </span>
        <SaveIndicator />
      </div>
      <div className="flex h-full items-center">
        <div className="mr-2 flex items-center gap-1">
          <VolumeQuick />
          <Tooltip content="Configurações" side="bottom">
            <button
              aria-label="Configurações"
              onMouseEnter={() => audio.play('hover')}
              onClick={() => {
                audio.play('open')
                openSettings()
              }}
              className="no-drag grid h-8 w-8 place-items-center rounded-lg text-muted transition-colors hover:bg-overlay/[0.07] hover:text-fg"
            >
              <Settings2 size={16} />
            </button>
          </Tooltip>
        </div>
        <WinButton label="Minimizar" onClick={bridge.window.minimize}>
          <Minus size={15} />
        </WinButton>
        <WinButton label={max ? 'Restaurar' : 'Maximizar'} onClick={bridge.window.toggleMaximize}>
          {max ? <Copy size={12} className="-scale-x-100" /> : <Square size={12} />}
        </WinButton>
        <WinButton label="Fechar" onClick={bridge.window.close} danger>
          <X size={16} />
        </WinButton>
      </div>
    </header>
  )
}
