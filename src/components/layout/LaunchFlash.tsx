import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useLaunch } from '@/store/launch'

/** Clarão vermelho quando o jogo abre (fim do mergulho no portal). */
export function LaunchFlash() {
  const phase = useLaunch((s) => s.phase)
  const prev = useRef(phase)
  const [n, setN] = useState(0)

  useEffect(() => {
    if (prev.current === 'launching' && phase === 'running') setN((x) => x + 1)
    prev.current = phase
  }, [phase])

  if (!n) return null
  return (
    <motion.div
      key={n}
      aria-hidden
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 0.92, 0] }}
      transition={{ duration: 1.4, times: [0, 0.12, 1], ease: 'easeOut' }}
      className="pointer-events-none absolute inset-0 z-[60]"
      style={{ background: 'radial-gradient(circle at 68% 36%, var(--scene-portal-hot) 0%, var(--accent-strong) 28%, var(--brand) 62%, var(--shade) 100%)' }}
    />
  )
}
