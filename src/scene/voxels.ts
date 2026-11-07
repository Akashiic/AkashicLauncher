import * as THREE from 'three'
import { fbm2, mulberry32 } from './noise'

export type BlockKind = 'stone' | 'crimson' | 'magma' | 'obsidian'
export interface Block {
  x: number
  y: number
  z: number
  kind: BlockKind
}

const key = (x: number, y: number, z: number) => `${x},${y},${z}`

/**
 * Ilha flutuante em blocos: topo levemente ondulado, base afunilando em
 * estalactites. Só blocos com alguma face exposta são mantidos.
 */
export function generateIsland(opts: { radius: number; depth: number; seed: number; magma?: number; flat?: number }) {
  const { radius: R, depth: H, seed } = opts
  const flat = opts.flat ?? 0
  const rnd = mulberry32(seed)
  const cells = new Map<string, Block>()
  const surface = (x: number, z: number, d: number) => Math.round(fbm2(x * 0.12 + 40, z * 0.12, seed + 3) * 2.2 - 0.6 + (1 - d) * 1.2)
  // plataforma plana no centro (base do portal)
  const topY = surface(0, 0, 0)

  for (let x = -R - 2; x <= R + 2; x++) {
    for (let z = -R - 2; z <= R + 2; z++) {
      const edge = fbm2(x * 0.18, z * 0.18, seed) * 0.55
      const d = Math.sqrt(x * x + z * z) / R + edge - 0.25
      if (d >= 1) continue
      // centro plano; à frente do portal (z > 0) nada fica mais alto que a plataforma
      let top = x * x + z * z <= flat * flat ? topY : surface(x, z, d)
      if (z > -1) top = Math.min(top, topY)
      const spike = fbm2(x * 0.35, z * 0.35, seed + 9)
      const depth = Math.max(1, Math.floor(Math.pow(1 - d, 0.9) * H * (0.45 + spike * 0.9)))
      for (let y = top; y > top - depth; y--) {
        cells.set(key(x, y, z), { x, y, z, kind: y === top ? 'crimson' : 'stone' })
      }
    }
  }

  const all = [...cells.values()]
  const exposed = all.filter(
    (b) =>
      !cells.has(key(b.x + 1, b.y, b.z)) ||
      !cells.has(key(b.x - 1, b.y, b.z)) ||
      !cells.has(key(b.x, b.y + 1, b.z)) ||
      !cells.has(key(b.x, b.y - 1, b.z)) ||
      !cells.has(key(b.x, b.y, b.z + 1)) ||
      !cells.has(key(b.x, b.y, b.z - 1)),
  )
  // blocos de magma (emissivos) só em laterais visíveis, abaixo da superfície
  const sides = exposed.filter((b) => b.kind === 'stone' && b.y < topY - 1)
  for (let i = 0; i < (opts.magma ?? 0) && sides.length; i++) sides.splice(Math.floor(rnd() * sides.length), 1)[0].kind = 'magma'
  return { blocks: exposed, topY, cells }
}

/** Moldura do portal (estilo portal do Nether, ampliado). Retorna blocos e o centro do vão. */
export function portalFrame(baseY: number, innerW = 3, innerH = 5) {
  const blocks: Block[] = []
  const half = Math.floor((innerW + 2) / 2)
  for (let i = 0; i < innerW + 2; i++) {
    for (let j = 0; j < innerH + 2; j++) {
      const border = i === 0 || i === innerW + 1 || j === 0 || j === innerH + 1
      if (border) blocks.push({ x: i - half, y: baseY + j, z: 0, kind: 'obsidian' })
    }
  }
  const center = new THREE.Vector3((innerW + 1) / 2 - half, baseY + 1 + (innerH - 1) / 2, 0)
  return { blocks, center, innerW, innerH }
}

/** Textura 16x16 em pixel-art (pedra) gerada em canvas, filtrada como no Minecraft. */
export function pixelTexture(seed: number, contrast = 0.35) {
  const size = 16
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = size
  const ctx = canvas.getContext('2d')!
  const rnd = mulberry32(seed)
  const img = ctx.createImageData(size, size)
  for (let i = 0; i < size * size; i++) {
    const x = i % size
    const y = Math.floor(i / size)
    // manchas + ruído fino, tons de cinza (a cor real vem da instância)
    const blot = fbm2(x * 0.3, y * 0.3, seed, 3)
    const v = Math.round(255 * (1 - contrast + contrast * (0.55 * blot + 0.45 * rnd())))
    const edge = x === 0 || y === 0 ? 0.82 : x === size - 1 || y === size - 1 ? 0.9 : 1
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(v * edge)
    img.data[i * 4 + 3] = 255
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(canvas)
  tex.magFilter = THREE.NearestFilter
  tex.minFilter = THREE.NearestMipmapLinearFilter
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return tex
}
