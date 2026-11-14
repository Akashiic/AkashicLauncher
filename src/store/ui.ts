import { create } from 'zustand'
import { FEATURES } from '@/lib/features'

export type Route = 'home' | 'modpack' | 'news' | 'settings' | 'skin'
export type SettingsTab = 'performance' | 'game' | 'mods' | 'audio'

interface UiStore {
  route: Route
  settingsTab: SettingsTab
  logsOpen: boolean
  /** Diálogo de adicionar perfil aberto manualmente (sem perfis ele é obrigatório). */
  addAccountOpen: boolean
  setAddAccountOpen(v: boolean): void
  navigate(r: Route): void
  openSettings(tab?: SettingsTab): void
  setSettingsTab(t: SettingsTab): void
  setLogsOpen(v: boolean): void
}

export const useUi = create<UiStore>((set) => ({
  route: 'home',
  settingsTab: 'performance',
  logsOpen: false,
  addAccountOpen: false,
  setAddAccountOpen: (addAccountOpen) => set({ addAccountOpen }),
  // seção desligada (ex.: Notícias) leva ao Início
  navigate: (route) => set({ route: route === 'news' && !FEATURES.news ? 'home' : route }),
  openSettings: (tab) => set((s) => ({ route: 'settings', settingsTab: tab ?? s.settingsTab })),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setLogsOpen: (logsOpen) => set({ logsOpen }),
}))
