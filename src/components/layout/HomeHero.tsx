import { motion } from 'framer-motion'
import { EASE } from '@/lib/cn'
import { Versioned } from '@/components/ui/Version'

/** Slogan sobre a cena, no canto inferior esquerdo da área livre. */
export function HomeHero() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, filter: 'blur(10px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      exit={{ opacity: 0, y: 10, filter: 'blur(8px)', transition: { duration: 0.22 } }}
      transition={{ duration: 0.8, ease: EASE }}
      className="pointer-events-none absolute bottom-8 left-9 flex flex-col gap-2"
    >
      <span className="label !text-accent-text">
        <Versioned text="Modpack 1.7.10 · Temporada 3" />
      </span>
      <h1 className="font-display text-[76px] leading-[0.9] text-fg">
        Entre no <span className="text-accent-strong">Proibido.</span>
      </h1>
    </motion.div>
  )
}
