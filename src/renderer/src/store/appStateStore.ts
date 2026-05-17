import { create } from 'zustand'

interface AppStateStore {
  booting: boolean
  isConfigured: boolean
  errorMessage: string | null
  infoMessage: string | null
  setBooting: (booting: boolean) => void
  setIsConfigured: (isConfigured: boolean) => void
  setErrorMessage: (message: string | null) => void
  setInfoMessage: (message: string | null) => void
}

export const useAppStateStore = create<AppStateStore>((set) => ({
  booting: true,
  isConfigured: false,
  errorMessage: null,
  infoMessage: null,
  setBooting: (booting) => {
    set({ booting })
  },
  setIsConfigured: (isConfigured) => {
    set({ isConfigured })
  },
  setErrorMessage: (errorMessage) => {
    set({ errorMessage })
  },
  setInfoMessage: (infoMessage) => {
    set({ infoMessage })
  }
}))
