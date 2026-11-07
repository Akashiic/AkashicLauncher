import { useEffect, useRef } from 'react'

interface P {
  x: number
  y: number
  z: number // profundidade 0..1 (parallax + tamanho)
  vx: number
  vy: number
  r: number
  life: number
  hue: number
  tw: number
}

/**
 * Poeira estelar + brasas flutuantes em Canvas 2D, ~60fps, com parallax por profundidade.
 * Pausa automaticamente quando a janela fica oculta.
 */
export function ParticleCanvas({ mouse }: { mouse: React.MutableRefObject<{ x: number; y: number }> }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d', { alpha: true })!
    let w = 0
    let h = 0
    let dpr = 1
    let raf = 0
    let ps: P[] = []

    const spawn = (anywhere: boolean): P => {
      const z = Math.random()
      const ember = Math.random() < 0.28
      return {
        x: Math.random() * w,
        y: anywhere ? Math.random() * h : h + 10,
        z,
        vx: (Math.random() - 0.5) * 0.12,
        vy: -(0.08 + Math.random() * 0.35) * (0.4 + z),
        r: (ember ? 1.1 : 0.6) + z * (ember ? 1.8 : 1.2),
        life: Math.random() * Math.PI * 2,
        hue: ember ? 22 + Math.random() * 20 : Math.random() < 0.5 ? 255 : 172,
        tw: 0.6 + Math.random() * 1.6,
      }
    }

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      w = canvas.clientWidth
      h = canvas.clientHeight
      canvas.width = w * dpr
      canvas.height = h * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      const target = Math.round(Math.min(140, (w * h) / 9000))
      while (ps.length < target) ps.push(spawn(true))
      ps.length = target
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    let last = performance.now()
    let px = 0
    let py = 0
    const frame = (now: number) => {
      const dt = Math.min(48, now - last) / 16.67
      last = now
      // suaviza o parallax
      px += (mouse.current.x - px) * 0.05
      py += (mouse.current.y - py) * 0.05
      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'lighter'
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]
        p.life += 0.02 * dt * p.tw
        p.x += (p.vx + Math.sin(p.life * 0.7) * 0.08) * dt
        p.y += p.vy * dt
        if (p.y < -12 || p.x < -20 || p.x > w + 20) {
          ps[i] = spawn(false)
          continue
        }
        const ox = px * 22 * (p.z + 0.15)
        const oy = py * 14 * (p.z + 0.15)
        const a = (0.25 + 0.55 * (0.5 + 0.5 * Math.sin(p.life * 2))) * (0.35 + p.z * 0.65)
        const x = p.x - ox
        const y = p.y - oy
        const glowR = p.r * 5
        const g = ctx.createRadialGradient(x, y, 0, x, y, glowR)
        const col = p.hue < 60 ? `hsla(${p.hue},100%,62%,` : `hsla(${p.hue},90%,75%,`
        g.addColorStop(0, col + a + ')')
        g.addColorStop(0.25, col + a * 0.35 + ')')
        g.addColorStop(1, col + '0)')
        ctx.fillStyle = g
        ctx.beginPath()
        ctx.arc(x, y, glowR, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)

    const vis = () => {
      cancelAnimationFrame(raf)
      if (!document.hidden) {
        last = performance.now()
        raf = requestAnimationFrame(frame)
      }
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      document.removeEventListener('visibilitychange', vis)
    }
  }, [mouse])

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" />
}
