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
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10, filter: 'blur(4px)' }} transition={{ delay: 1 }} className="pointer-events-none fixed bottom-28 left-1/2 z-[65] -translate-x-1/2">
          <div className="glass-strong flex items-center gap-2 rounded-full px-4 py-2 text-xs text-slate-300 shadow-xl">
            <Volume2 size={14} className="animate-pulse text-aether-300" /> Clique em qualquer lugar para ativar o som
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
