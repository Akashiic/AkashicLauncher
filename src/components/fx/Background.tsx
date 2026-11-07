import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { ParticleCanvas } from './ParticleCanvas'
import { useSettings } from '@/store/settings'
import { useLaunch } from '@/store/launch'

/** Fundo --bg-base com vinheta vinho, brasas e parallax leve. Sem imagens pesadas. */
export function Background() {
  const eco = useSettings((s) => s.settings.ecoMode)
  const phase = useLaunch((s) => s.phase)
  const mouse = useRef({ x: 0, y: 0 })
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 40, damping: 20 })
  const sy = useSpring(my, { stiffness: 40, damping: 20 })
  const l1x = useTransform(sx, (v) => v * -12)
  const l1y = useTransform(sy, (v) => v * -8)
  const l2x = useTransform(sx, (v) => v * -26)
  const l2y = useTransform(sy, (v) => v * -14)

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const x = (e.clientX / window.innerWidth) * 2 - 1
      const y = (e.clientY / window.innerHeight) * 2 - 1
      mouse.current = { x, y }
      if (!eco) {
        mx.set(x)
        my.set(y)
      }
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [eco, mx, my])

  const active = phase !== 'ready'

  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-bg">
      {/* vinheta vinho no canto superior esquerdo */}
      <motion.div style={{ x: l1x, y: l1y, background: 'radial-gradient(ellipse 70% 65% at 0% 0%, var(--vignette), transparent 70%)' }} className="absolute -inset-10" />
      {/* brilho que acende quando o jogo está iniciando */}
      <motion.div
        animate={{ opacity: active ? 0.55 : 0 }}
        transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}
        className="absolute inset-0"
        style={{ background: 'radial-gradient(ellipse 60% 45% at 85% 100%, var(--vignette), transparent 70%)' }}
      />

      {/* silhueta de terreno em blocos (vetor leve, tons do tema) */}
      <motion.svg style={{ x: l2x, y: l2y }} className="absolute -bottom-8 -left-12 h-[34%] w-[calc(100%+6rem)] opacity-80" viewBox="0 0 1600 300" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="terrain" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" style={{ stopColor: 'var(--surface)' }} />
            <stop offset="1" style={{ stopColor: 'var(--bg-base)' }} />
          </linearGradient>
        </defs>
        <path fill="url(#terrain)" d="M0 200h120v-50h100v30h80v-60h120v40h60v-30h100v50h80v-80h120v60h100v-40h80v50h120v-30h80v60h100v-40h80v30h80v130H0z" />
      </motion.svg>

      {!eco && <ParticleCanvas mouse={mouse} />}

      {/* escurecimento das bordas */}
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 45%, var(--vignette-edge) 100%)' }} />
    </div>
  )
}
