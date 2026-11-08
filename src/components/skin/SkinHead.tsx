import { useEffect, useRef } from 'react'
import { defaultSkin } from '@/lib/skin'
import { useSettings } from '@/store/settings'

/** Rosto do jogador recortado da skin atual (rosto 8×8 + camada do chapéu). */
export function SkinHead({ size = 30, className }: { size?: number; className?: string }) {
  const skin = useSettings((s) => s.settings.skinDataUrl) ?? defaultSkin()
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const g = ref.current?.getContext('2d')
      if (!g) return
      g.imageSmoothingEnabled = false
      g.clearRect(0, 0, 8, 8)
      g.drawImage(img, 8, 8, 8, 8, 0, 0, 8, 8) // rosto
      g.drawImage(img, 40, 8, 8, 8, 0, 0, 8, 8) // chapéu
    }
    img.src = skin
  }, [skin])

  return <canvas ref={ref} width={8} height={8} className={className} style={{ width: size, height: size, imageRendering: 'pixelated' }} aria-hidden />
}
