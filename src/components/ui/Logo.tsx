import { motion } from 'framer-motion'

/** Emblema do servidor: cristal rúnico isométrico com pulso de brilho. */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <motion.div className="relative" style={{ width: size, height: size }} whileHover={{ rotate: 8, scale: 1.06 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
      <motion.div
        className="absolute inset-0 rounded-xl bg-aether-500/50 blur-xl"
        animate={{ opacity: [0.35, 0.8, 0.35], scale: [0.85, 1.1, 0.85] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      <svg viewBox="0 0 48 48" className="relative h-full w-full drop-shadow-[0_0_10px_rgba(124,92,255,.6)]">
        <defs>
          <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#B9A4FF" />
            <stop offset="1" stopColor="#6243F0" />
          </linearGradient>
          <linearGradient id="lg-b" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7FF3E6" />
            <stop offset="1" stopColor="#14C8B8" />
          </linearGradient>
        </defs>
        <path d="M24 3 43 14v20L24 45 5 34V14z" fill="#12141D" stroke="url(#lg-a)" strokeWidth="1.5" />
        <path d="M24 9 37 16.5 24 24 11 16.5z" fill="url(#lg-a)" opacity=".95" />
        <path d="M11 16.5 24 24v15L11 31.5z" fill="#6243F0" opacity=".55" />
        <path d="M37 16.5 24 24v15l13-7.5z" fill="url(#lg-b)" opacity=".7" />
        <path d="M24 15v18M18 22l6 4 6-4" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" opacity=".9" fill="none" />
      </svg>
    </motion.div>
  )
}
