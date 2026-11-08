import { useEffect, useRef, useState } from 'react'
import type { SkinModel } from '@/scene/SkinModel'

/** Boneco 3D da skin: gira sozinho, arraste para girar. Carregado sob demanda. */
export function SkinViewer({ skin, walking, className }: { skin: string; walking: boolean; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const model = useRef<SkinModel | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let cancelled = false
    let ro: ResizeObserver | undefined
    import('@/scene/SkinModel')
      .then(({ SkinModel }) => {
        if (cancelled || !ref.current) return
        const m = new SkinModel(ref.current)
        model.current = m
        const fit = () => ref.current && m.resize(ref.current.clientWidth, ref.current.clientHeight)
        fit()
        ro = new ResizeObserver(fit)
        ro.observe(ref.current)
        m.start()
        setReady(true)
      })
      .catch((e) => console.warn('[skin] visualizador indisponível', e))
    return () => {
      cancelled = true
      ro?.disconnect()
      model.current?.dispose()
      model.current = null
    }
  }, [])

  useEffect(() => {
    if (ready) void model.current?.setSkin(skin)
  }, [skin, ready])

  useEffect(() => {
    if (model.current) model.current.walking = walking
  }, [walking, ready])

  return <canvas ref={ref} className={className} style={{ touchAction: 'none', cursor: 'grab' }} aria-label="Pré-visualização 3D da skin (arraste para girar)" role="img" />
}
