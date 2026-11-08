import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { X } from 'lucide-react'
import { useUi } from '@/store/ui'
import { audio } from '@/audio/AudioManager'
import { EASE } from '@/lib/cn'

/** Painel de vidro que desliza da coluna sobre a cena (Notícias, Modpack, Configurações). */
export function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  const navigate = useUi((s) => s.navigate)
  const close = () => {
    audio.play('close')
    navigate('home')
  }

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) close()
    }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  })

  return (
    <motion.section
      aria-label={label}
      initial={{ opacity: 0, x: -28, filter: 'blur(10px)' }}
      animate={{ opacity: 1, x: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, x: -20, filter: 'blur(8px)', transition: { duration: 0.25 } }}
      transition={{ duration: 0.45, ease: EASE }}
      className="absolute inset-y-3 left-3 right-3 top-11 flex flex-col overflow-hidden rounded-3xl border border-line bg-surface/80 shadow-popover backdrop-blur-xl [html.eco_&]:bg-surface"
    >
      <button
        aria-label="Fechar painel"
        onMouseEnter={() => audio.play('hover')}
        onClick={close}
        className="absolute right-3 top-3 z-10 grid h-9 w-9 place-items-center rounded-lg text-muted transition-colors hover:bg-overlay/[0.08] hover:text-fg"
      >
        <X size={18} />
      </button>
      <div className="min-h-0 flex-1">{children}</div>
    </motion.section>
  )
}
