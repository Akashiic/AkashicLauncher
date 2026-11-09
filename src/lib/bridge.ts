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
  /** Núcleo do jogo em Rust (só no app desktop). */
  game?: GameApi
}

export interface PlayRequest {
  account: { username: string; uuid: string; type: 'offline' | 'microsoft' }
  memoryGb: number
  jvmArgs: string[]
  javaPath: string | null
  pack: { tag: string; url: string; size: number; sha256?: string } | null
}

/** Retrato do progresso emitido pelo Rust (`launch:progress`). */
export interface NativeProgress {
  phase: 'verifying' | 'downloading' | 'launching'
  stage: string
  filesDone: number
  filesTotal: number
  bytesDone: number
  bytesTotal: number
  progress: number
  speed: number // bytes/s
  current: string
}

/** Plano/resumo de atualização do modpack calculado pelo Rust. */
export interface UpdateSummary {
  mode: 'none' | 'full' | 'delta' | 'repair'
  from: string | null
  to: string
  downloadBytes: number
  added: number
  changed: number
  removed: number
  repaired: number
}

export type PackRef = NonNullable<PlayRequest['pack']>

export interface GameEvents {
  'launch:progress': NativeProgress
  'launch:logs': string[]
  'launch:pack-installed': string
  'game:window': null
  'game:exit': { code: number | null; crashReport: string | null }
  'launch:pack-updated': UpdateSummary
  'launch:notice': { kind: 'info' | 'warning' | 'error' | 'success'; title: string; body?: string }
}

export interface GameApi {
  play(req: PlayRequest): Promise<void>
  cancel(): Promise<void>
  stop(): Promise<boolean>
  verify(pack: PackRef | null): Promise<{ checked: number; repaired: number }>
  /** O que uma atualização vai baixar (lê só o índice do .zip remoto). */
  plan(pack: PackRef): Promise<UpdateSummary>
  installed(): Promise<string | null>
  on<K extends keyof GameEvents>(event: K, cb: (payload: GameEvents[K]) => void): () => void
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
    game: {
      play: (req) => invoke<void>('game_play', { req }),
      cancel: () => invoke<void>('game_cancel'),
      stop: () => invoke<boolean>('game_stop'),
      verify: (pack) => invoke('game_verify', { pack }),
      plan: (pack) => invoke<UpdateSummary>('game_update_plan', { pack }),
      installed: () => invoke<string | null>('game_installed'),
      on: (event, cb) => {
        const off = listen(event, (e) => cb(e.payload as never))
        return () => void off.then((f) => f())
      },
    },
  }
}

const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window

export const bridge: AkashicBridge = isTauri ? tauriBridge() : browserBridge
