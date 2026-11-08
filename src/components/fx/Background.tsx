import { useCallback, useEffect, useRef, useState } from 'react'
import { ParticleCanvas } from './ParticleCanvas'
import { PortalCanvas } from './PortalCanvas'
import { useSettings } from '@/store/settings'

const hasWebGL = (() => {
  try {
    const c = document.createElement('canvas')
    return !!(c.getContext('webgl2') || c.getContext('webgl'))
  } catch {
    return false
  }
})()

/**
 * Fundo do launcher: a cena 3D "O Portal Proibido".
 * Sem WebGL, cai para o fundo simples (vinheta + brasas 2D).
 */
export function Background() {
  const eco = useSettings((s) => s.settings.ecoMode)
  const [webgl, setWebgl] = useState(hasWebGL)
  const mouse = useRef({ x: 0, y: 0 })
  const fallback = useCallback(() => setWebgl(false), [])

  // parallax das brasas 2D no fundo de reserva
  useEffect(() => {
    if (webgl) return
    const move = (e: MouseEvent) => (mouse.current = { x: (e.clientX / window.innerWidth) * 2 - 1, y: (e.clientY / window.innerHeight) * 2 - 1 })
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [webgl])

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden bg-bg">
      {webgl ? (
        <PortalCanvas onUnavailable={fallback} />
      ) : (
        <>
          <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 70% 65% at 0% 0%, var(--vignette), transparent 70%)' }} />
          {!eco && <ParticleCanvas mouse={mouse} />}
        </>
      )}
      {/* escurece o lado esquerdo para o texto manter contraste sobre a cena */}
      <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, var(--bg-base) 0%, color-mix(in srgb, var(--bg-base) 70%, transparent) 28%, transparent 55%)' }} />
      <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse at center, transparent 50%, var(--vignette-edge) 100%)' }} />
    </div>
  )
}
