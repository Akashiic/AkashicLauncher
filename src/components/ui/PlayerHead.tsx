import { useMemo } from 'react'

/** Cabeça de jogador pixel-art 8x8 gerada deterministicamente a partir do nick (offline). */
export function PlayerHead({ name, size = 40 }: { name: string; size?: number }) {
  const pixels = useMemo(() => {
    let h = 2166136261
    for (const c of name) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
    const rnd = () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296
    const hair = `hsl(${Math.floor(rnd() * 360)},${30 + rnd() * 40}%,${18 + rnd() * 20}%)`
    const skin = ['#f2c7a5', '#d9a07a', '#b8794f', '#8d5a3b', '#f6d6bd'][Math.floor(rnd() * 5)]
    const eye = `hsl(${Math.floor(rnd() * 360)},70%,55%)`
    const grid: string[] = []
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        let c = skin
        if (y < 2 || (y < 3 && (x === 0 || x === 7)) || (y < 4 && rnd() < 0.18 && (x < 1 || x > 6))) c = hair
        if (y === 4 && (x === 1 || x === 5)) c = '#ffffff'
        if (y === 4 && (x === 2 || x === 6)) c = eye
        if (y === 6 && x >= 3 && x <= 4) c = '#5a3a2a'
        grid.push(c)
      }
    return grid
  }, [name])

  return (
    <svg width={size} height={size} viewBox="0 0 8 8" shapeRendering="crispEdges" className="rounded-md" aria-label={`Avatar de ${name}`}>
      {pixels.map((c, i) => (
        <rect key={i} x={i % 8} y={Math.floor(i / 8)} width="1" height="1" fill={c} />
      ))}
    </svg>
  )
}
