import { useEffect, useRef } from 'react'
import { defaultSkin } from '@/lib/skin'
import { activeAccount, useSettings } from '@/store/settings'

/** Rosto do jogador recortado da skin (rosto 8×8 + camada do chapéu). Sem `skin`, usa a do perfil ativo. */
export function SkinHead({ size = 30, skin, className }: { size?: number; skin?: string | null; className?: string }) {
  const activeSkin = useSettings((s) => activeAccount(s.settings)?.skinDataUrl ?? null)
  const src = (skin === undefined ? activeSkin : skin) ?? defaultSkin()
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
    img.src = src
  }, [src])

  return <canvas ref={ref} width={8} height={8} className={className} style={{ width: size, height: size, imageRendering: 'pixelated' }} aria-hidden />
}
