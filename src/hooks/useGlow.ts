import { useCallback } from 'react'

/** Atualiza --mx/--my para o border glow reativo seguir o cursor. */
export function useGlow<T extends HTMLElement = HTMLDivElement>() {
  return useCallback((e: React.MouseEvent<T>) => {
    const el = e.currentTarget
    const r = el.getBoundingClientRect()
    el.style.setProperty('--mx', `${e.clientX - r.left}px`)
    el.style.setProperty('--my', `${e.clientY - r.top}px`)
  }, [])
}
