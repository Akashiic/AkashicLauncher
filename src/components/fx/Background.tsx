import { useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion'
import { ParticleCanvas } from './ParticleCanvas'
import { useSettings } from '@/store/settings'
import { useLaunch } from '@/store/launch'

/** Fundo dinâmico em camadas com parallax suave pelo mouse. */
export function Background() {
  const eco = useSettings((s) => s.settings.ecoMode)
  const phase = useLaunch((s) => s.phase)
  const mouse = useRef({ x: 0, y: 0 })
  const mx = useMotionValue(0)
  const my = useMotionValue(0)
  const sx = useSpring(mx, { stiffness: 40, damping: 20 })
  const sy = useSpring(my, { stiffness: 40, damping: 20 })

  const l1x = useTransform(sx, (v) => v * -10)
  const l1y = useTransform(sy, (v) => v * -8)
  const l2x = useTransform(sx, (v) => v * -24)
  const l2y = useTransform(sy, (v) => v * -16)
  const l3x = useTransform(sx, (v) => v * -40)
  const l3y = useTransform(sy, (v) => v * -24)

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
    <div className="pointer-events-none fixed inset-0 overflow-hidden bg-void-900">
      {/* camada 1: nebulosa */}
      <motion.div style={{ x: l1x, y: l1y }} className="absolute -inset-16">
        <div className="absolute left-[8%] top-[-10%] h-[620px] w-[620px] rounded-full bg-aether-600/25 blur-[120px]" />
        <div className="absolute bottom-[-20%] right-[-5%] h-[700px] w-[700px] rounded-full bg-rune-500/[0.13] blur-[140px]" />
        <motion.div
          animate={{ opacity: active ? 0.55 : 0.18, scale: active ? 1.15 : 1 }}
          transition={{ duration: 2.4, ease: [0.16, 1, 0.3, 1] }}
          className="absolute left-[40%] top-[35%] h-[420px] w-[420px] rounded-full bg-ember-500/30 blur-[130px]"
        />
      </motion.div>

      {/* camada 2: silhueta de terreno em blocos (estilo voxel) */}
      <motion.svg style={{ x: l2x, y: l2y }} className="absolute -bottom-6 -left-12 h-[46%] w-[calc(100%+6rem)] opacity-[0.55]" viewBox="0 0 1600 400" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="far" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#1b1d33" />
            <stop offset="1" stopColor="#090A0F" />
          </linearGradient>
        </defs>
        <path
          fill="url(#far)"
          d="M0 260h80v-40h80v-30h60v-50h80v40h60v-70h80v30h60v60h80v-90h60v-40h80v60h80v40h60v-30h80v70h60v-50h80v-60h60v40h80v50h80v-30h60v60h80v-20h70v200H0z"
        />
      </motion.svg>
      <motion.svg style={{ x: l3x, y: l3y }} className="absolute -bottom-10 -left-16 h-[32%] w-[calc(100%+8rem)]" viewBox="0 0 1600 300" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="near" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#12141f" />
            <stop offset="1" stopColor="#06070A" />
          </linearGradient>
        </defs>
        <path fill="url(#near)" d="M0 200h120v-50h100v30h80v-60h120v40h60v-30h100v50h80v-80h120v60h100v-40h80v50h120v-30h80v60h100v-40h80v30h80v130H0z" />
      </motion.svg>

      {!eco && <ParticleCanvas mouse={mouse} />}

      {/* grão + vinheta */}
      <div
        className="absolute inset-0 opacity-[0.05] mix-blend-overlay"
        style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='3'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,rgba(6,7,10,.85)_100%)]" />
    </div>
  )
}
