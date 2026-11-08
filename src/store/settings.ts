import { create } from 'zustand'
import { bridge } from '@/lib/bridge'
import { audio, type AudioSettings, type ChannelSettings } from '@/audio/AudioManager'

/** 'bundled' = Java 8 Zulu 8u512 incluso no launcher (padrão); 'custom' = caminho escolhido pelo jogador. */
export type JavaMode = 'bundled' | 'custom'
export type JvmPreset = 'default' | 'fps' | 'low' | 'custom'
export type Resolution = '1080p' | '720p' | 'fullscreen' | 'borderless'
export type LaunchBehavior = 'tray' | 'keep' | 'close'
export type Minimap = 'journeymap' | 'voxelmap' | 'none'

export interface Settings {
  version: 1
  memoryGb: number
  javaMode: JavaMode
  javaPath: string
  jvmPreset: JvmPreset
  jvmArgs: string
  resolution: Resolution
  launchBehavior: LaunchBehavior
  optionalMods: Record<string, boolean>
  minimap: Minimap
  audio: AudioSettings
  ecoMode: boolean
  profileId: string
  nickname: string
  /** Skin do jogador (PNG em data URL) ou null para a skin padrão. */
  skinDataUrl: string | null
}

export const JVM_PRESETS: Record<Exclude<JvmPreset, 'custom'>, { label: string; hint: string; args: string }> = {
  default: {
    label: 'Padrão',
    hint: 'Equilíbrio seguro para a maioria dos PCs.',
    args: '-XX:+UseG1GC -XX:MaxGCPauseMillis=50 -XX:+UnlockExperimentalVMOptions',
  },
  fps: {
    label: 'Otimizado para FPS',
    hint: 'G1GC agressivo, menos travadas em modpacks pesados.',
    args: '-XX:+UseG1GC -XX:+UnlockExperimentalVMOptions -XX:G1NewSizePercent=20 -XX:G1ReservePercent=20 -XX:MaxGCPauseMillis=40 -XX:G1HeapRegionSize=16M -XX:+DisableExplicitGC -XX:+AlwaysPreTouch -Dfml.ignorePatchDiscrepancies=true',
  },
  low: {
    label: 'PC Fraco',
    hint: 'Menos threads de GC e menor uso de memória.',
    args: '-XX:+UseConcMarkSweepGC -XX:+CMSIncrementalMode -XX:-UseAdaptiveSizePolicy -Xmn128M -XX:ParallelGCThreads=2',
  },
}

export const OPTIONAL_MODS: { id: string; name: string; desc: string; tag: 'Performance' | 'Visual' | 'Áudio' | 'Utilidade'; impact: 'baixo' | 'médio' | 'alto'; conflicts?: string[] }[] = [
  { id: 'fastcraft', name: 'FastCraft', desc: 'Otimizações de renderização e ticks. Ganho de FPS imediato na 1.7.10.', tag: 'Performance', impact: 'baixo', conflicts: ['angelica'] },
  { id: 'angelica', name: 'Angelica', desc: 'Renderizador moderno (backport) com suporte a shaders. Substitui o FastCraft.', tag: 'Performance', impact: 'baixo', conflicts: ['fastcraft', 'optifine'] },
  { id: 'optifine', name: 'OptiFine HD U E7', desc: 'Controle fino de gráficos, zoom e texturas conectadas.', tag: 'Visual', impact: 'médio', conflicts: ['angelica'] },
  { id: 'shaders', name: 'Shaders Support', desc: 'Habilita shaderpacks (requer OptiFine ou Angelica). Pesado em GPUs fracas.', tag: 'Visual', impact: 'alto' },
  { id: 'dynsurround', name: 'Dynamic Surroundings', desc: 'Sons ambientes, partículas de chuva e efeitos de bioma imersivos.', tag: 'Áudio', impact: 'médio' },
  { id: 'betterfoliage', name: 'Better Foliage', desc: 'Grama e folhas volumétricas, mais vida ao mundo.', tag: 'Visual', impact: 'médio' },
  { id: 'nei-addons', name: 'NEI Addons', desc: 'Receitas extras e integração com mods de tecnologia.', tag: 'Utilidade', impact: 'baixo' },
  { id: 'inventorytweaks', name: 'Inventory Tweaks', desc: 'Organização automática do inventário com um clique.', tag: 'Utilidade', impact: 'baixo' },
]

export const PROFILES = [
  { id: 'survival', name: 'Akashic Survival', sub: 'Forge 10.13.4.1614 · 186 mods', badge: 'Principal' },
  { id: 'lite', name: 'Akashic Lite', sub: 'Sem shaders · 142 mods', badge: 'Leve' },
  { id: 'creative', name: 'Build Realm', sub: 'Creative · 64 mods', badge: 'Evento' },
]

const ch = (volume: number): ChannelSettings => ({ volume, muted: false })

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  memoryGb: 6,
  javaMode: 'bundled',
  javaPath: '',
  jvmPreset: 'default',
  jvmArgs: JVM_PRESETS.default.args,
  resolution: '1080p',
  launchBehavior: 'tray',
  optionalMods: { fastcraft: true, angelica: false, optifine: true, shaders: false, dynsurround: true, betterfoliage: false, 'nei-addons': true, inventorytweaks: true },
  minimap: 'journeymap',
  audio: { master: ch(0.8), bgm: ch(0.45), sfx: ch(0.7), sbfx: ch(0.5) },
  ecoMode: false,
  profileId: 'survival',
  nickname: 'Akashi_Wanderer',
  skinDataUrl: null,
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

interface SettingsStore {
  settings: Settings
  hydrated: boolean
  saveState: SaveState
  savedPath: string
  hydrate(): Promise<void>
  update(patch: Partial<Settings>): void
  setAudio(channel: keyof AudioSettings, patch: Partial<ChannelSettings>): void
  toggleMod(id: string): string[]
  reset(): void
}

/** Mescla profunda e defensiva: arquivos antigos/corrompidos não quebram o app. */
function merge(raw: unknown): Settings {
  if (!raw || typeof raw !== 'object') return structuredClone(DEFAULT_SETTINGS)
  const r = raw as Partial<Settings>
  const d = DEFAULT_SETTINGS
  const audioIn = (r.audio ?? {}) as Partial<AudioSettings>
  const chan = (k: keyof AudioSettings): ChannelSettings => ({
    volume: typeof audioIn[k]?.volume === 'number' ? Math.min(1, Math.max(0, audioIn[k]!.volume)) : d.audio[k].volume,
    muted: typeof audioIn[k]?.muted === 'boolean' ? audioIn[k]!.muted : d.audio[k].muted,
  })
  return {
    ...d,
    ...r,
    version: 1,
    memoryGb: Math.min(16, Math.max(2, Number(r.memoryGb) || d.memoryGb)),
    // versões antigas usavam 'auto' (detectar Java do sistema): migra para o Zulu incluso
    javaMode: r.javaMode === 'custom' ? 'custom' : 'bundled',
    skinDataUrl: typeof r.skinDataUrl === 'string' && r.skinDataUrl.startsWith('data:image/png') ? r.skinDataUrl : null,
    optionalMods: { ...d.optionalMods, ...(r.optionalMods ?? {}) },
    audio: { master: chan('master'), bgm: chan('bgm'), sfx: chan('sfx'), sbfx: chan('sbfx') },
  }
}

let saveTimer: number | undefined
let savedFlashTimer: number | undefined

export const useSettings = create<SettingsStore>((set, get) => {
  const persist = () => {
    window.clearTimeout(saveTimer)
    set({ saveState: 'saving' })
    saveTimer = window.setTimeout(async () => {
      try {
        const path = await bridge.settings.save(get().settings)
        set({ saveState: 'saved', savedPath: path })
        window.clearTimeout(savedFlashTimer)
        savedFlashTimer = window.setTimeout(() => set({ saveState: 'idle' }), 1800)
      } catch (e) {
        console.error(e)
        set({ saveState: 'error' })
      }
    }, 350)
  }

  const commit = (settings: Settings) => {
    set({ settings })
    audio.applySettings(settings.audio)
    document.documentElement.classList.toggle('eco', settings.ecoMode)
    persist()
  }

  return {
    settings: DEFAULT_SETTINGS,
    hydrated: false,
    saveState: 'idle',
    savedPath: '',
    async hydrate() {
      const raw = await bridge.settings.load().catch(() => null)
      const settings = merge(raw)
      set({ settings, hydrated: true, savedPath: await bridge.settings.path() })
      audio.applySettings(settings.audio)
      document.documentElement.classList.toggle('eco', settings.ecoMode)
    },
    update(patch) {
      commit({ ...get().settings, ...patch })
    },
    setAudio(channel, patch) {
      const s = get().settings
      commit({ ...s, audio: { ...s.audio, [channel]: { ...s.audio[channel], ...patch } } })
    },
    /** Alterna um mod opcional, desligando conflitos. Retorna nomes desativados. */
    toggleMod(id) {
      const s = get().settings
      const next = { ...s.optionalMods, [id]: !s.optionalMods[id] }
      const disabled: string[] = []
      if (next[id]) {
        const mod = OPTIONAL_MODS.find((m) => m.id === id)
        mod?.conflicts?.forEach((c) => {
          if (next[c]) {
            next[c] = false
            disabled.push(OPTIONAL_MODS.find((m) => m.id === c)?.name ?? c)
          }
        })
      }
      commit({ ...s, optionalMods: next })
      return disabled
    },
    reset() {
      commit(structuredClone({ ...DEFAULT_SETTINGS, nickname: get().settings.nickname }))
    },
  }
})
