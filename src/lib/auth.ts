/**
 * Login com a conta Microsoft — SIMULADO nesta versão (nenhuma rede é usada).
 *
 * Fluxo real (a implementar no processo principal do Electron, via IPC):
 *  1. OAuth da Microsoft (MSAL, tenant "consumers") numa BrowserWindow → código → token
 *  2. Xbox Live:   POST https://user.auth.xboxlive.com/user/authenticate
 *  3. XSTS:        POST https://xsts.auth.xboxlive.com/xsts/authorize
 *  4. Minecraft:   POST https://api.minecraftservices.com/authentication/login_with_xbox
 *  5. Licença:     GET  https://api.minecraftservices.com/entitlements/mcstore
 *  6. Perfil:      GET  https://api.minecraftservices.com/minecraft/profile  → nick + UUID
 * Requisitos: app registrado no Azure + aprovação da Mojang para usar a API do Minecraft.
 * Tokens guardados com safeStorage do Electron, nunca no settings.json.
 */

export const MS_STEPS = ['Conta Microsoft', 'Xbox Live', 'Autorização XSTS', 'Minecraft', 'Perfil do jogador'] as const

const DEMO_NAMES = ['Forbidden_Hero', 'NetherWalker', 'Akashi_Lord', 'RedRune_', 'VoidCrafter']

function randomUuidV4() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

/** Simula a cadeia de autenticação, avisando cada etapa concluída. */
export async function loginMicrosoft(onStep: (index: number) => void): Promise<{ username: string; uuid: string }> {
  for (let i = 0; i < MS_STEPS.length; i++) {
    onStep(i)
    await new Promise((r) => setTimeout(r, 650 + Math.random() * 350))
  }
  onStep(MS_STEPS.length)
  return { username: DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)], uuid: randomUuidV4() }
}
