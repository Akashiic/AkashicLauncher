import { readToken } from '@/theme'

/**
 * Skins na 1.7.10: formato clássico 64×32 (modelo Steve, sem braço fino).
 * Skins 64×64 (1.8+) são aceitas, mas o jogo usa só a metade de cima —
 * a segunda camada (jaqueta, mangas, calça) e os membros esquerdos próprios não aparecem.
 */
export interface SkinInfo {
  dataUrl: string
  width: number
  height: number
  name: string
}

export const SKIN_MAX_BYTES = 256 * 1024

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Não foi possível ler a imagem.'))
    img.src = src
  })
}

/** Valida um arquivo de skin (PNG 64×32 ou 64×64, até 256 KB). */
export async function readSkinFile(file: File): Promise<SkinInfo> {
  if (file.type !== 'image/png' && !file.name.toLowerCase().endsWith('.png')) throw new Error('A skin precisa ser um arquivo .png.')
  if (file.size > SKIN_MAX_BYTES) throw new Error('Arquivo grande demais (máx. 256 KB).')
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error('Falha ao ler o arquivo.'))
    r.readAsDataURL(file)
  })
  const img = await loadImage(dataUrl)
  const ok = img.width === 64 && (img.height === 32 || img.height === 64)
  if (!ok) throw new Error(`Tamanho ${img.width}×${img.height} não suportado. Use 64×32 ou 64×64.`)
  return { dataUrl, width: img.width, height: img.height, name: file.name }
}

export async function skinSize(dataUrl: string) {
  const img = await loadImage(dataUrl)
  return { width: img.width, height: img.height }
}

let cachedDefault: string | null = null

/** Skin padrão "Forbidden" (64×32), desenhada por código com as cores do tema. */
export function defaultSkin(): string {
  if (cachedDefault) return cachedDefault
  const c = document.createElement('canvas')
  c.width = 64
  c.height = 32
  const g = c.getContext('2d')!
  const col = (name: string) => readToken(name)
  const rect = (x: number, y: number, w: number, h: number, color: string) => {
    g.fillStyle = color
    g.fillRect(x, y, w, h)
  }
  const noise = (x: number, y: number, w: number, h: number, a: string, b: string, seed: number) => {
    for (let i = 0; i < w; i++)
      for (let j = 0; j < h; j++) {
        const n = Math.sin((x + i) * 12.9898 + (y + j) * 78.233 + seed) * 43758.5453
        rect(x + i, y + j, 1, 1, n - Math.floor(n) > 0.72 ? b : a)
      }
  }
  const hood = col('--scene-crimson')
  const hoodDark = col('--brand')
  const robe = col('--scene-stone-dark')
  const robeLight = col('--scene-stone')
  const trim = col('--accent')
  const skin = col('--avatar-skin-2')
  const eye = col('--avatar-eye')
  const boots = col('--scene-obsidian')

  // cabeça (0,0): capuz em volta, rosto na frente (8,8)
  noise(0, 0, 32, 16, hood, hoodDark, 1)
  rect(8, 8, 8, 8, hood)
  rect(9, 10, 6, 6, skin) // rosto sob o capuz
  rect(9, 9, 6, 1, hoodDark)
  rect(10, 12, 2, 1, eye)
  rect(13, 12, 2, 1, eye)
  rect(11, 14, 2, 1, hoodDark)
  // camada do chapéu (32,0): borda do capuz projetada
  rect(40, 8, 8, 2, hoodDark)
  rect(40, 8, 1, 8, hoodDark)
  rect(47, 8, 1, 8, hoodDark)
  // corpo (16,16): manto escuro com faixa vermelha
  noise(16, 16, 24, 16, robe, robeLight, 2)
  rect(23, 20, 2, 12, trim)
  rect(20, 26, 8, 1, trim)
  // braços (40,16): mangas com punho vermelho
  noise(40, 16, 16, 16, robe, robeLight, 3)
  rect(44, 29, 4, 3, skin)
  rect(44, 28, 4, 1, trim)
  // pernas (0,16): calça escura e botas
  noise(0, 16, 16, 16, robeLight, robe, 4)
  rect(0, 28, 16, 4, boots)
  cachedDefault = c.toDataURL('image/png')
  return cachedDefault
}
