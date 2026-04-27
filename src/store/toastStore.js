import { create } from 'zustand'

export const useToastStore = create((set, get) => ({
  /** @type {{ id: string, message: string, variant: 'success' | 'error' | 'info' }[]} */
  toasts: [],
  /**
   * @param {string} message
   * @param {'success' | 'error' | 'info'} [variant]
   */
  show: (message, variant = 'info') => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : String(Date.now())
    set((s) => ({ toasts: [...s.toasts, { id, message, variant }] }))
    window.setTimeout(() => {
      get().dismiss(id)
    }, 4200)
  },
  dismiss: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
