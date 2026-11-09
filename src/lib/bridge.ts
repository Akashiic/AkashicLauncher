// Ponte entre a interface e o processo nativo (Tauri/Rust), com fallback para o navegador (localStorage).
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'

export interface AkashicBridge {
  /** Rodando no app desktop (Tauri). */
  isDesktop: boolean
  platform: string
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    hide(): void
    show(): void
    /** Informa o processo nativo se o jogo está rodando (menu da bandeja). */
    setGameRunning(running: boolean): void
    /** "Fechar o jogo" clicado no menu da bandeja. */
    onTrayStopGame(cb: () => void): () => void
    onMaximized(cb: (v: boolean) => void): () => void
  }
  settings: {
    load(): Promise<unknown>
    save(data: unknown): Promise<string>
    path(): Promise<string>
  }
  shell: { openGameDir(): Promise<string>; openExternal(url: string): Promise<void> }
}

const LS_KEY = 'akashic.settings.v1'

const browserBridge: AkashicBridge = {
  isDesktop: false,
  platform: 'web',
  window: {
    minimize: () => console.info('[mock] minimize'),
    toggleMaximize: () => {
      if (document.fullscreenElement) document.exitFullscreen()
      else document.documentElement.requestFullscreen?.().catch(() => {})
    },
    close: () => console.info('[mock] close'),
    hide: () => console.info('[mock] hide (tray)'),
    show: () => console.info('[mock] show'),
    setGameRunning: () => {},
    onTrayStopGame: () => () => {},
    onMaximized: () => () => {},
  },
  settings: {
    load: async () => {
      try {
        const raw = localStorage.getItem(LS_KEY)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },
    save: async (data) => {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(data))
      } catch {
        /* storage indisponível */
      }
      return `localStorage:${LS_KEY}`
    },
    path: async () => `localStorage:${LS_KEY}`,
  },
  shell: {
    openGameDir: async () => '~/.akashic/.minecraft (mock)',
    openExternal: async (url) => {
      window.open(url, '_blank', 'noopener,noreferrer')
    },
  },
}

function tauriBridge(): AkashicBridge {
  const win = getCurrentWindow()
  const fail = (what: string) => (e: unknown) => console.warn(`[nativo] ${what} falhou:`, e)
  return {
    isDesktop: true,
    platform: navigator.userAgent.includes('Windows') ? 'win32' : navigator.userAgent.includes('Mac') ? 'darwin' : 'linux',
    window: {
      minimize: () => void win.minimize().catch(fail('minimizar')),
      toggleMaximize: () => {}, // janela de tamanho fixo
      close: () => void win.close().catch(fail('fechar')),
      hide: () => void win.hide().catch(fail('esconder')),
      show: () => void Promise.all([win.unminimize(), win.show(), win.setFocus()]).catch(fail('mostrar')),
      setGameRunning: (running) => void invoke('set_game_running', { running }).catch(fail('bandeja')),
      onTrayStopGame: (cb) => {
        const off = listen('tray:stop-game', () => cb())
        return () => void off.then((f) => f())
      },
      onMaximized: () => () => {},
    },
    settings: {
      load: () => invoke('settings_load'),
      save: (data) => invoke<string>('settings_save', { data }),
      path: () => invoke<string>('settings_path'),
    },
    shell: {
      openGameDir: () => invoke<string>('open_game_dir'),
      openExternal: (url) => invoke<void>('open_external', { url }),
    },
  }
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const bridge: AkashicBridge = isTauri ? tauriBridge() : browserBridge
