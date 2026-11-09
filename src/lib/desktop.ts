import { getCurrentWindow } from '@tauri-apps/api/window'
import { bridge } from './bridge'

/**
 * Ajustes do app desktop (Tauri):
 * - arrastar a janela pelas áreas `.drag` (exceto controles e `.no-drag`);
 * - mostrar a janela assim que a interface monta (ela nasce oculta e com o fundo
 *   do tema, então não pisca em branco). Não usa requestAnimationFrame: com a
 *   janela oculta o WebView pausa os quadros e ela nunca apareceria.
 */
export function setupDesktop() {
  if (!bridge.isDesktop) return
  const win = getCurrentWindow()

  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0 || e.detail > 1) return
    const el = e.target as Element | null
    if (!el?.closest('.drag')) return
    if (el.closest('.no-drag, button, a, input, textarea, select, [role="button"], [role="slider"], [role="menuitem"]')) return
    e.preventDefault()
    void win.startDragging()
  })
}

/** Chamado pelo App depois da primeira montagem. */
export function revealWindow() {
  if (bridge.isDesktop) bridge.window.show()
}
