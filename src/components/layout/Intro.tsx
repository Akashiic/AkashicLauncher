import { useEffect, useState } from 'react'
import { animate, motion, useMotionTemplate, useMotionValue } from 'framer-motion'
import { useFx } from '@/store/fx'
import { useSettings } from '@/store/settings'
import { audio } from '@/audio/AudioManager'
import { Logo } from '@/components/ui/Logo'
import { EASE } from '@/lib/cn'

/** Posição aproximada do portal na janela: a escuridão se abre a partir dele. */
const PORTAL_AT = '68% 36%'

/**
 * Abertura (~2,7s): o logo surge, o nome se revela e a cena acende a partir do
 * portal. Clique ou tecla pula. Sem abertura no Modo Economia / reduzir movimento.
 */
export function Intro() {
  const setIntroDone = useFx((s) => s.setIntroDone)
  const firePulse = useFx((s) => s.firePulse)
  const eco = useSettings((s) => s.settings.ecoMode)
  const [stage, setStage] = useState<'logo' | 'reveal' | 'done'>('logo')
  const hole = useMotionValue(0)
  const mask = useMotionTemplate`radial-gradient(circle at ${PORTAL_AT}, transparent ${hole}%, black calc(${hole}% + 14%))`

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (eco || reduced) {
      setStage('done')
      setIntroDone(true)
      return
    }
    let finished = false
    const reveal = () => {
      setStage('reveal')
      firePulse()
      audio.play('whoosh')
      animate(hole, 160, { duration: 1.1, ease: [0.7, 0, 0.2, 1] })
    }
    const finish = () => {
      if (finished) return
      finished = true
      setStage('done')
      setIntroDone(true)
    }
    audio.play('chime')
    const t1 = window.setTimeout(reveal, 1650)
    const t2 = window.setTimeout(finish, 2750)
    const skip = () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      firePulse()
      finish()
    }
    window.addEventListener('pointerdown', skip, { once: true })
    window.addEventListener('keydown', skip, { once: true })
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
      window.removeEventListener('pointerdown', skip)
      window.removeEventListener('keydown', skip)
    }
    // executa uma vez por abertura do app
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (stage === 'done') return null

  return (
    <motion.div className="absolute inset-0 z-[80] bg-bg" style={stage === 'reveal' ? { maskImage: mask, WebkitMaskImage: mask } : undefined} aria-hidden>
      <motion.div
        className="absolute inset-0 flex flex-col items-center justify-center gap-5"
        animate={stage === 'reveal' ? { opacity: 0, scale: 1.08, filter: 'blur(10px)' } : { opacity: 1, scale: 1, filter: 'blur(0px)' }}
        transition={{ duration: 0.6, ease: EASE }}
      >
        <motion.div initial={{ opacity: 0, scale: 0.82, y: 10, filter: 'blur(16px)' }} animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }} transition={{ duration: 1.1, ease: EASE }}>
          <Logo variant="full" size={340} pulse />
        </motion.div>
        <motion.span
          className="h-px bg-accent-strong shadow-glow-strong"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 260, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.8, ease: EASE }}
        />
        <motion.span className="label !text-accent-text" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 1.1, duration: 0.6, ease: EASE }}>
          Entre no Proibido.
        </motion.span>
      </motion.div>
    </motion.div>
  )
}
