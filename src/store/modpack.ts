import { create } from 'zustand'
import { compareVersions, describeUpdate, fetchModpackReleases, formatMB, packRef, type ModpackRelease } from '@/lib/modpack'
import { useSettings } from '@/store/settings'
import { bridge, type UpdateSummary } from '@/lib/bridge'
import { toast } from '@/store/toasts'

const NOTIFIED_KEY = 'forbidden.update.notified'

type Status = 'idle' | 'checking' | 'ready' | 'error'

interface ModpackStore {
  status: Status
  releases: ModpackRelease[]
  latest: ModpackRelease | null
  fromCache: boolean
  lastChecked: number
  error: string | null
  /** App desktop: o que a próxima atualização vai baixar (tamanho exato). */
  plan: UpdateSummary | null
  check(): Promise<void>
  refreshPlan(): Promise<void>
}

/** Versões do modpack (releases TEOF- do GitHub). */
export const useModpack = create<ModpackStore>((set, get) => ({
  status: 'idle',
  releases: [],
  latest: null,
  fromCache: false,
  lastChecked: 0,
  error: null,
  plan: null,
  async refreshPlan() {
    const game = bridge.game
    const { latest } = get()
    const installed = useSettings.getState().settings.modpackVersion
    const st = modpackState(installed, latest)
    const ref = packRef(latest)
    if (!game || !ref || st.kind !== 'update') {
      set({ plan: null })
      return
    }
    try {
      const plan = await game.plan(ref)
      set({ plan })
      // avisa uma vez por versão nova
      let notified: string | null = null
      try {
        notified = localStorage.getItem(NOTIFIED_KEY)
      } catch {
        /* sem storage */
      }
      if (notified !== ref.tag) {
        const what = plan.mode === 'delta' ? `${describeUpdate(plan) || 'Ajustes'} · ${formatMB(plan.downloadBytes)}` : `Download de ${formatMB(plan.downloadBytes)}`
        toast({ kind: 'info', title: `${ref.tag} disponível`, body: `${what}. A atualização acontece quando você clicar em ATUALIZAR.` }, 8000)
        try {
          localStorage.setItem(NOTIFIED_KEY, ref.tag)
        } catch {
          /* sem storage */
        }
      }
    } catch {
      set({ plan: null }) // sem o plano, a interface mostra o tamanho do .zip
    }
  },
  async check() {
    if (get().status === 'checking') return
    set({ status: 'checking', error: null })
    try {
      const r = await fetchModpackReleases()
      set({ status: 'ready', releases: r.releases, latest: r.releases[0] ?? null, fromCache: r.fromCache, lastChecked: r.fetchedAt })
      void get().refreshPlan()
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
