/**
 * Login com a conta Microsoft (contas originais).
 *
 * No app desktop é real e roda em Rust (src-tauri/src/auth): página oficial da
 * Microsoft no navegador → Xbox Live → XSTS → Minecraft → perfil. Os tokens ficam
 * no cofre do Rust (DPAPI no Windows) e nunca chegam aqui nem no settings.json.
 * No navegador (desenvolvimento da interface) o fluxo é simulado.
 */
import { bridge, type AuthFailure, type MsProfile } from '@/lib/bridge'

export type { AuthFailure, MsProfile }

export const MS_STEPS = ['Conta Microsoft', 'Xbox Live', 'Autorização XSTS', 'Minecraft', 'Perfil do jogador'] as const

export const isAuthFailure = (e: unknown): e is AuthFailure => !!e && typeof e === 'object' && 'code' in e && 'message' in e

export const authMessage = (e: unknown) => (isAuthFailure(e) ? e.message : String(e))

/** Título curto para o aviso de erro de cada tipo. */
export function authErrorTitle(e: unknown) {
  if (!isAuthFailure(e)) return 'Não foi possível entrar'
  switch (e.code) {
    case 'not_approved':
    case 'not_configured':
      return 'Contas Microsoft em breve'
    case 'no_minecraft':
      return 'Conta sem Minecraft'
    case 'no_xbox':
      return 'Falta o perfil do Xbox'
    case 'child':
      return 'Conta de menor de idade'
    case 'relogin':
      return 'Entre de novo na conta'
    case 'network':
    case 'timeout':
      return 'Sem resposta do login'
    default:
      return 'Não foi possível entrar'
  }
}

/** Login real disponível? (null = navegador, com simulação) */
export async function microsoftAvailable(): Promise<boolean | null> {
  if (!bridge.auth) return null
  return bridge.auth.configured().catch(() => false)
}

export async function loginMicrosoft(onStep: (index: number) => void, onBrowser: (url: string) => void = () => {}): Promise<MsProfile> {
  if (bridge.auth) return bridge.auth.login({ onStep, onBrowser })
  return simulate(onStep)
}

export const cancelMicrosoft = () => bridge.auth?.cancel()

// ---- simulação (só no navegador) ----
const DEMO_NAMES = ['Forbidden_Hero', 'NetherWalker', 'Akashi_Lord', 'RedRune_', 'VoidCrafter']

function randomUuidV4() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

async function simulate(onStep: (index: number) => void): Promise<MsProfile> {
  for (let i = 0; i < MS_STEPS.length; i++) {
    onStep(i)
    await new Promise((r) => setTimeout(r, 650 + Math.random() * 350))
  }
  onStep(MS_STEPS.length)
  return { username: DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)], uuid: randomUuidV4(), skin: null }
}
