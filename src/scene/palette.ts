import { Color } from 'three'
import { readToken } from '@/theme'

/** Paleta da cena lida de src/theme/tokens.css (nenhuma cor definida aqui). */
export function scenePalette() {
  const c = (name: string) => new Color(readToken(name))
  return {
    bg: c('--bg-base'),
    skyTop: c('--scene-sky-top'),
    skyHorizon: c('--scene-sky-horizon'),
    haze: c('--scene-haze'),
    stoneDark: c('--scene-stone-dark'),
    stone: c('--scene-stone'),
    stoneLight: c('--scene-stone-light'),
    crimson: c('--scene-crimson'),
    crimsonLight: c('--scene-crimson-light'),
    obsidian: c('--scene-obsidian'),
    brand: c('--brand'),
    brandHover: c('--brand-hover'),
    accent: c('--accent'),
    accentStrong: c('--accent-strong'),
    portalHot: c('--scene-portal-hot'),
    rim: c('--scene-rim'),
    ash: c('--text-muted'),
  }
}
export type ScenePalette = ReturnType<typeof scenePalette>
