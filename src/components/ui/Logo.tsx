import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/cn'

type Variant = 'mark' | 'full' | 'wordmark'

const SRC: Record<Variant, string> = {
  mark: './brand/logo-mark.png', // olho (símbolo)
  full: './brand/logo.png', // olho + nome empilhados
  wordmark: './brand/wordmark.png', // nome em linha
}
const RATIO: Record<Variant, number> = { mark: 1, full: 640 / 404, wordmark: 720 / 70 } // largura / altura

/** Brilho vermelho sutil atrás da marca: mantém o "SERIES" legível sobre o fundo escuro. */
const GLOW = 'drop-shadow(0 0 8px color-mix(in srgb, var(--accent) 55%, transparent))'

/**
 * Marca oficial da Forbidden Series (arquivos em public/brand/).
 * `size` = altura em px (para `mark` e `wordmark`) ou largura (para `full`).
 * Se a imagem não carregar, mostra o selo "FS" provisório.
 */
export function Logo({ variant = 'mark', size = 40, className, glow = true, pulse = false }: { variant?: Variant; size?: number; className?: string; glow?: boolean; pulse?: boolean }) {
  const [missing, setMissing] = useState(false)
  const w = variant === 'full' ? size : Math.round(size * RATIO[variant])
  const h = variant === 'full' ? Math.round(size / RATIO.full) : size

  if (missing) {
    return (
      <span className={cn('grid place-items-center rounded-xl border-2 border-accent bg-brand font-display text-fg', className)} style={{ width: h, height: h, fontSize: h * 0.42 }} title="Marca não encontrada em public/brand/">
        FS
      </span>
    )
  }
  return (
    <motion.span className={cn('relative inline-grid shrink-0 place-items-center', className)} style={{ width: w, height: h }}>
      {pulse && (
        <motion.span
          className="absolute inset-[15%] rounded-full bg-brand blur-xl"
          animate={{ opacity: [0.25, 0.65, 0.25] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
          aria-hidden
        />
      )}
      <img
        src={SRC[variant]}
        alt="Forbidden Series"
        width={w}
        height={h}
        draggable={false}
        onError={() => setMissing(true)}
        className="relative h-full w-full select-none object-contain"
        style={glow ? { filter: GLOW } : undefined}
      />
    </motion.span>
  )
}
