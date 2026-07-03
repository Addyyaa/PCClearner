import { create } from 'zustand'

interface AppState {
  loading: boolean
  loadingText: string
  toast?: string
  setLoading: (loading: boolean, loadingText?: string) => void
  showToast: (message: string) => void
  clearToast: () => void
}

export const useAppStore = create<AppState>((set) => ({
  loading: false,
  loadingText: '',
  setLoading: (loading, loadingText = '') => set({ loading, loadingText }),
  showToast: (toast) => set({ toast }),
  clearToast: () => set({ toast: undefined })
}))
