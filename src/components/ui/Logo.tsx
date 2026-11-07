import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

/**
 * Logo oficial da Forbidden Series: imagem em public/brand/logo.png.
 * A fonte pixelada do logo NÃO é recriada — se a imagem ainda não existir,
 * mostra um selo neutro "FS" só como marcador de posição.
 */
export function Logo({ size = 40, className }: { size?: number; className?: string }) {
  const [missing, setMissing] = useState(false)
  return (
    <motion.div className={cn('relative grid place-items-center', className)} style={{ width: size, height: size }} whileHover={{ scale: 1.06 }} transition={{ type: 'spring', stiffness: 300, damping: 15 }}>
      <motion.div
        className="absolute inset-0 rounded-xl bg-brand blur-lg"
        animate={{ opacity: [0.25, 0.6, 0.25] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
      />
      {missing ? (
        <span className="relative grid h-full w-full place-items-center rounded-xl border-2 border-accent bg-brand font-display text-fg" style={{ fontSize: size * 0.42 }} title="Coloque o logo em public/brand/logo.png">
          FS
        </span>
      ) : (
        <img src="./brand/logo.png" alt="Forbidden Series" draggable={false} onError={() => setMissing(true)} className="relative h-full w-full object-contain [image-rendering:pixelated]" />
      )}
    </motion.div>
  )
}
