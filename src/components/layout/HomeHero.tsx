import { motion } from 'framer-motion'
import { useFx } from '@/store/fx'
import { useLaunch } from '@/store/launch'
import { EASE } from '@/lib/cn'
import { Versioned } from '@/components/ui/Version'
import { useModpackState } from '@/store/modpack'

const PARTS = [
  { text: 'Entre no ', cls: 'text-fg' },
  { text: 'Proibido.', cls: 'text-accent-strong' },
]

/** Slogan sobre a cena; revela letra por letra quando a abertura termina e recua durante o mergulho. */
export function HomeHero() {
  const introDone = useFx((s) => s.introDone)
  const launching = useLaunch((s) => s.phase === 'launching')
  const mp = useModpackState()
  const tag = mp.installed ? `TEOF-${mp.installed}` : mp.latest?.tag
  let i = 0

  return (
    <motion.div
      initial={{ opacity: 1 }}
      animate={{ opacity: launching ? 0.15 : 1, filter: launching ? 'blur(4px)' : 'blur(0px)' }}
      exit={{ opacity: 0, y: 10, filter: 'blur(8px)', transition: { duration: 0.22 } }}
      transition={{ duration: 0.8, ease: EASE }}
      className="pointer-events-none absolute bottom-8 left-9 flex flex-col gap-2"
    >
      <motion.span
        className="label !text-accent-text"
        initial={{ opacity: 0, x: -10 }}
        animate={introDone ? { opacity: 1, x: 0 } : {}}
        transition={{ delay: 0.35, duration: 0.7, ease: EASE }}
      >
        <Versioned text={tag ? `${tag} · Minecraft 1.7.10` : 'Modpack · Minecraft 1.7.10'} />
      </motion.span>
      <h1 className="font-display text-[76px] leading-[0.9] text-fg" aria-label="Entre no Proibido.">
        {PARTS.map((part) => (
          <span key={part.text} className={part.cls}>
            {[...part.text].map((ch) => {
              const delay = 0.05 + i++ * 0.035
              return (
                <span key={`${part.text}-${delay}`} className="inline-block overflow-hidden align-bottom" aria-hidden>
                  <motion.span
                    className="inline-block"
                    initial={{ y: '105%' }}
                    animate={introDone ? { y: '0%' } : {}}
                    transition={{ delay, duration: 0.7, ease: EASE }}
                  >
                    {ch === ' ' ? ' ' : ch}
                  </motion.span>
                </span>
              )
            })}
          </span>
        ))}
      </h1>
    </motion.div>
  )
}
