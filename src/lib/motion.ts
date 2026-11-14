import { createElement, useEffect, useState, type ReactNode } from 'react'
import { MotionConfig } from 'framer-motion'
import { useSettings } from '@/store/settings'

// Windows com "Efeitos de animação" desligados (ou "Ajustar para obter um melhor
// desempenho") avisa o navegador com prefers-reduced-motion.
const query = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null

/**
 * Launcher "parado": o Windows pede menos movimento e o jogador deixou o launcher
 * seguir o Windows (Configurações → Estética). Aí as animações em loop param de vez.
 */
export function useCalm() {
  const follow = useSettings((s) => s.settings.followSystemMotion)
  const [system, setSystem] = useState(() => query?.matches ?? false)
  useEffect(() => {
    if (!query) return
    const sync = () => setSystem(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])
  return follow && system
}

/** O Windows está pedindo menos movimento (independe da opção do launcher). */
export const systemReducesMotion = () => query?.matches ?? false

/** Aplica o modo parado: classe `calm` no <html> (CSS) e o framer-motion junto. */
export function MotionRoot({ children }: { children: ReactNode }) {
  const calm = useCalm()
  useEffect(() => {
    document.documentElement.classList.toggle('calm', calm)
  }, [calm])
  return createElement(MotionConfig, { reducedMotion: calm ? 'always' : 'never' }, children)
}
