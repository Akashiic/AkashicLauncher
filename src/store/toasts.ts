import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'warning' | 'error'
export interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
}

interface ToastStore {
  toasts: Toast[]
  push(t: Omit<Toast, 'id'>, ms?: number): void
  dismiss(id: number): void
}

let seq = 0
export const useToasts = create<ToastStore>((set, get) => ({
  toasts: [],
  push(t, ms = 3600) {
    const id = ++seq
    set({ toasts: [...get().toasts.slice(-3), { ...t, id }] })
    window.setTimeout(() => get().dismiss(id), ms)
  },
  dismiss(id) {
    set({ toasts: get().toasts.filter((t) => t.id !== id) })
  },
}))

export const toast = (t: Omit<Toast, 'id'>, ms?: number) => useToasts.getState().push(t, ms)
