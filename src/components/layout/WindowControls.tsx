import { AnimatePresence, motion } from 'framer-motion'
import { Minus, X, Check, Loader2 } from 'lucide-react'
import { bridge } from '@/lib/bridge'
import { audio } from '@/audio/AudioManager'
import { useSettings } from '@/store/settings'
import { cn } from '@/lib/cn'
import { LauncherUpdate } from './LauncherUpdate'

function SaveIndicator() {
  const state = useSettings((s) => s.saveState)
  return (
    <AnimatePresence>
      {state !== 'idle' && (
        <motion.span
          initial={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
          animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
          className={cn('mr-2 flex items-center gap-1.5 text-xs', state === 'error' ? 'text-danger-text' : 'text-muted')}
        >
          {state === 'saving' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} className="text-success" />}
          {state === 'saving' ? 'Salvando…' : state === 'saved' ? 'Salvo' : 'Erro ao salvar'}
        </motion.span>
      )}
    </AnimatePresence>
  )
}

/** Faixa superior arrastável da janela (frameless) com minimizar/fechar. Janela de tamanho fixo. */
export function WindowControls() {
  const btn = 'no-drag grid h-9 w-11 place-items-center text-muted transition-colors duration-200'
  return (
    <div className="drag absolute inset-x-0 top-0 z-40 flex h-9 items-center justify-end">
      <LauncherUpdate />
      <SaveIndicator />
      <button
        aria-label="Minimizar"
        onMouseEnter={() => audio.play('hover')}
        onClick={() => {
          audio.play('click')
          bridge.window.minimize()
        }}
        className={cn(btn, 'hover:bg-overlay/[0.08] hover:text-fg')}
      >
        <Minus size={15} />
      </button>
      <button
        aria-label="Fechar"
        onMouseEnter={() => audio.play('hover')}
        onClick={() => {
          audio.play('click')
          bridge.window.close()
        }}
        className={cn(btn, 'hover:bg-danger hover:text-fg')}
      >
        <X size={16} />
      </button>
    </div>
  )
}
