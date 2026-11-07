import { create } from 'zustand'

export type ServerState = 'online' | 'maintenance' | 'offline'

interface ServerStore {
  state: ServerState
  players: number
  maxPlayers: number
  ping: number
  history: number[]
  tps: number
  tick(): void
  cycleState(): void
}

/** Mock reativo de status do servidor — substitua por um ping real (SLP 1.7) depois. */
export const useServer = create<ServerStore>((set, get) => ({
  state: 'online',
  players: 48,
  maxPlayers: 100,
  ping: 24,
  tps: 19.8,
  history: Array.from({ length: 24 }, (_, i) => 30 + Math.round(Math.sin(i / 3) * 10 + Math.random() * 8)),
  tick() {
    const s = get()
    if (s.state !== 'online') {
      set({ players: 0, ping: 0, tps: 0 })
      return
    }
    const drift = Math.round((Math.random() - 0.48) * 4)
    const players = Math.min(s.maxPlayers, Math.max(12, s.players + drift))
    const ping = Math.max(9, Math.min(140, Math.round(s.ping * 0.7 + (18 + Math.random() * 18) * 0.3 + (Math.random() < 0.05 ? 40 : 0))))
    const tps = Math.min(20, Math.max(16.5, +(s.tps + (Math.random() - 0.45) * 0.4).toFixed(1)))
    set({ players, ping, tps, history: [...s.history.slice(1), players] })
  },
  cycleState() {
    const order: ServerState[] = ['online', 'maintenance', 'offline']
    const next = order[(order.indexOf(get().state) + 1) % order.length]
    set({ state: next, ...(next === 'online' ? { players: 41, ping: 26, tps: 19.9 } : { players: 0, ping: 0, tps: 0 }) })
  },
}))
