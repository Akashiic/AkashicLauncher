/**
 * Acesso em JS aos tokens de src/theme/tokens.css (para Canvas/SVG).
 * Nunca escreva cores aqui — apenas leia as variáveis CSS.
 */

/** Referência CSS a um token, ex.: tv('--accent') → "var(--accent)". */
export const tv = (name: string) => `var(${name})`

/** Valor computado de um token, ex.: readToken('--accent') → "#c01818". */
export function readToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

/** Converte um token hex (#rgb, #rrggbb ou #rrggbbaa) em "r, g, b". */
export function tokenRgb(name: string): string {
  let h = readToken(name).replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const n = parseInt(h.slice(0, 6), 16)
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`
}

/** Tons semânticos usados por cards com brilho, badges e notícias. */
export type Tone = 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'muted'

export const TONE_VAR: Record<Tone, string> = {
  brand: 'var(--brand-hover)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  muted: 'var(--text-muted)',
}

/** Classe de texto legível (AA) para cada tom. */
export const TONE_TEXT: Record<Tone, string> = {
  brand: 'text-accent-text',
  accent: 'text-accent-text',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger-text',
  muted: 'text-muted',
}
