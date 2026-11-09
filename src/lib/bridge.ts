// Abstração sobre a ponte do Electron com fallback para navegador (localStorage).
export interface AkashicBridge {
  isElectron: boolean
  platform: string
  window: {
    minimize(): void
    toggleMaximize(): void
    close(): void
    hide(): void
    show(): void
    /** Informa o processo principal se o jogo está rodando (menu da bandeja). */
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

declare global {
  interface Window {
    akashic?: AkashicBridge
  }
}

const LS_KEY = 'akashic.settings.v1'

const browserBridge: AkashicBridge = {
  isElectron: false,
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

export const bridge: AkashicBridge = window.akashic ?? browserBridge
