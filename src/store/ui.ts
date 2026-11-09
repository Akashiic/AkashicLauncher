import { create } from 'zustand'

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
  navigate: (route) => set({ route }),
  openSettings: (tab) => set((s) => ({ route: 'settings', settingsTab: tab ?? s.settingsTab })),
  setSettingsTab: (settingsTab) => set({ settingsTab }),
  setLogsOpen: (logsOpen) => set({ logsOpen }),
}))
