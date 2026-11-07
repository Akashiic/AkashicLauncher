import { useMemo } from 'react'
import { tv } from '@/theme'

const SKINS = ['--avatar-skin-1', '--avatar-skin-2', '--avatar-skin-3', '--avatar-skin-4']
const HAIRS = ['--avatar-hair-1', '--avatar-hair-2', '--avatar-hair-3', '--avatar-hair-4']

/** Cabeça de jogador pixel-art 8x8 gerada deterministicamente a partir do nick (offline). Cores vêm do tema. */
export function PlayerHead({ name, size = 40 }: { name: string; size?: number }) {
  const pixels = useMemo(() => {
    let h = 2166136261
    for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296
    const hair = tv(HAIRS[Math.floor(rnd() * HAIRS.length)])
    const skin = tv(SKINS[Math.floor(rnd() * SKINS.length)])
    const grid: string[] = []
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        let c = skin
        if (y < 2 || (y < 3 && (x === 0 || x === 7)) || (y < 4 && rnd() < 0.18 && (x < 1 || x > 6))) c = hair
        if (y === 4 && (x === 1 || x === 5)) c = tv('--avatar-eye-white')
        if (y === 4 && (x === 2 || x === 6)) c = tv('--avatar-eye')
        if (y === 6 && x >= 3 && x <= 4) c = tv('--avatar-mouth')
        grid.push(c)
      }
    return grid
  }, [name])

  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" className="rounded-md" aria-label={`Avatar de ${name}`}>
      {pixels.map((c, i) => (
        <rect key={i} x={i % 8} y={Math.floor(i / 8)} width="1" height="1" style={{ fill: c }} />
      ))}
    </svg>
  )
}
