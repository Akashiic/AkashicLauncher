import { create } from 'zustand'
import { compareVersions, fetchModpackReleases, type ModpackRelease } from '@/lib/modpack'
import { useSettings } from '@/store/settings'

type Status = 'idle' | 'checking' | 'ready' | 'error'

interface ModpackStore {
  status: Status
  releases: ModpackRelease[]
  latest: ModpackRelease | null
  fromCache: boolean
  lastChecked: number
  error: string | null
  check(): Promise<void>
}

/** Versões do modpack (releases TEOF- do GitHub). */
export const useModpack = create<ModpackStore>((set, get) => ({
  status: 'idle',
  releases: [],
  latest: null,
  fromCache: false,
  lastChecked: 0,
  error: null,
  async check() {
    if (get().status === 'checking') return
    set({ status: 'checking', error: null })
    try {
      const r = await fetchModpackReleases()
      set({ status: 'ready', releases: r.releases, latest: r.releases[0] ?? null, fromCache: r.fromCache, lastChecked: r.fetchedAt })
    } catch (e) {
      set({ status: 'error', error: (e as Error).message })
    }
  },
}))

/** Situação do modpack: o que está instalado e se há versão nova. */
export function modpackState(installed: string | null, latest: ModpackRelease | null) {
  if (!latest) return { kind: installed ? ('unknown' as const) : ('unavailable' as const), installed, latest }
  if (!installed) return { kind: 'install' as const, installed, latest }
  return { kind: compareVersions(latest.parts, installed) > 0 ? ('update' as const) : ('current' as const), installed, latest }
}

export function useModpackState() {
  const installed = useSettings((s) => s.settings.modpackVersion)
  const latest = useModpack((s) => s.latest)
  return modpackState(installed, latest)
}
