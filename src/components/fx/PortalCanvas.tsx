import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useSettings } from '@/store/settings'
import { useLaunch } from '@/store/launch'
import { useFx } from '@/store/fx'
import type { PortalScene } from '@/scene/PortalScene'

declare global {
  interface Window {
    __portal?: PortalScene
  }
}

/**
 * Monta a cena 3D. Pausa quando a janela está oculta/minimizada ou o jogo está
 * rodando. No Modo Economia (ou com "reduzir movimento") mostra um quadro estático
 * da própria cena.
 */
export function PortalCanvas({ onUnavailable }: { onUnavailable: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const sceneRef = useRef<PortalScene | null>(null)
  const [visible, setVisible] = useState(false)
  const eco = useSettings((s) => s.settings.ecoMode)
  const gameRunning = useLaunch((s) => s.phase === 'running')

  // criação / destruição
  useEffect(() => {
    let cancelled = false
    let ro: ResizeObserver | undefined
    const canvas = ref.current!
    const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))
    // montagem em etapas curtas: a abertura continua animando enquanto a cena prepara
    import('@/scene/PortalScene')
      .then(async ({ PortalScene }) => {
        await nextFrame()
        if (cancelled) return
        const scene = new PortalScene(canvas)
        sceneRef.current = scene
        if (import.meta.env.DEV) window.__portal = scene
        scene.onFirstFrame = () => setVisible(true)
        await nextFrame()
        await scene.warmup()
        if (cancelled) return
        const fit = () => scene.resize(canvas.clientWidth, canvas.clientHeight)
        fit()
        ro = new ResizeObserver(fit)
        ro.observe(canvas)
        window.dispatchEvent(new Event('portal:ready'))
      })
      .catch((e) => {
        if (cancelled) return
        console.warn('[cena] WebGL indisponível, usando fundo simples.', e)
        onUnavailable()
      })
    return () => {
      cancelled = true
      ro?.disconnect()
      sceneRef.current?.dispose()
      sceneRef.current = null
      if (window.__portal) delete window.__portal
    }
  }, [onUnavailable])

  // mouse → parallax e luz do cursor
  useEffect(() => {
    const move = (e: MouseEvent) => sceneRef.current?.setMouse((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1)
    window.addEventListener('mousemove', move)
    return () => window.removeEventListener('mousemove', move)
  }, [])

  // o portal responde ao JOGAR: acende no hover, carrega com o progresso, pulsa no clique
  const phase = useLaunch((s) => s.phase)
  const progress = useLaunch((s) => s.progress)
  const playHover = useFx((s) => s.playHover)
  const pulse = useFx((s) => s.pulse)
  useEffect(() => {
    const s = sceneRef.current
    if (!s) return
    const energy =
      phase === 'verifying' || phase === 'downloading' ? 0.5 + progress * 0.7
      : phase === 'launching' ? 1.3 + progress * 0.6
      : phase === 'running' || phase === 'stopping' ? 0.1
      : playHover ? 0.85
      : 0
    s.setEnergy(energy)
    // ao abrir o jogo, a câmera mergulha no portal junto com o progresso
    s.setDive(phase === 'launching' ? 0.2 + progress * 0.8 : 0)
  }, [phase, progress, playHover])
  useEffect(() => {
    if (pulse) sceneRef.current?.pulse()
  }, [pulse])

  // rodar, pausar ou congelar
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => {
      const s = sceneRef.current
      if (!s) return
      const frozen = eco || reduced.matches
      if (frozen) {
        s.stop()
        s.renderAt(8, true)
      } else if (document.hidden) s.stop()
      else if (gameRunning) {
        // deixa a câmera recuar do portal antes de pausar
        s.start()
        window.clearTimeout(pauseTimer)
        pauseTimer = window.setTimeout(() => s.stop(), 3200)
      } else {
        window.clearTimeout(pauseTimer)
        s.start()
      }
    }
    let pauseTimer: number | undefined
    apply()
    window.addEventListener('portal:ready', apply)
    document.addEventListener('visibilitychange', apply)
    reduced.addEventListener('change', apply)
    return () => {
      window.removeEventListener('portal:ready', apply)
      document.removeEventListener('visibilitychange', apply)
      reduced.removeEventListener('change', apply)
      window.clearTimeout(pauseTimer)
    }
  }, [eco, gameRunning])

  return (
    <motion.canvas
      ref={ref}
      initial={{ opacity: 0 }}
      animate={{ opacity: visible ? 1 : 0 }}
      transition={{ duration: 1.8, ease: [0.16, 1, 0.3, 1] }}
      className="absolute inset-0 h-full w-full"
      aria-hidden
    />
  )
}
