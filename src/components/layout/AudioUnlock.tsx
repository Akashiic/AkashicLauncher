import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Volume2 } from 'lucide-react'
import { audio } from '@/audio/AudioManager'

/** Navegadores bloqueiam áudio até um gesto do usuário. Mostra um aviso discreto até lá. */
export function AudioUnlock() {
  const [locked, setLocked] = useState(!audio.unlocked)
  useEffect(() => {
    const id = window.setTimeout(() => setLocked(!audio.unlocked), 600)
    const unsub = audio.subscribe(() => setLocked(!audio.unlocked))
    return () => {
      window.clearTimeout(id)
      unsub()
    }
  }, [])
  return (
    <AnimatePresence>
      {locked && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10, filter: 'blur(4px)' }} transition={{ delay: 1 }} className="pointer-events-none fixed right-4 top-11 z-[65]">
          <div className="panel-raised flex items-center gap-2 rounded-full px-4 py-2 text-xs text-muted shadow-popover">
            <Volume2 size={14} className="animate-pulse text-accent-strong" /> Clique em qualquer lugar para ativar o som
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
