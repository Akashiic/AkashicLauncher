import { create } from 'zustand'

/**
 * Ponte visual entre a interface e a cena 3D (sem lógica de jogo):
 * hover do JOGAR acende o portal; o clique dispara um pulso de energia.
 */
interface FxStore {
  playHover: boolean
  pulse: number
  /** Abertura animada terminou (dispara as entradas da interface). */
  introDone: boolean
  setIntroDone(v: boolean): void
  setPlayHover(v: boolean): void
  firePulse(): void
}

export const useFx = create<FxStore>((set, get) => ({
  playHover: false,
  pulse: 0,
  introDone: false,
  setIntroDone: (introDone) => set({ introDone }),
  setPlayHover: (playHover) => set({ playHover }),
  firePulse: () => set({ pulse: get().pulse + 1 }),
}))
