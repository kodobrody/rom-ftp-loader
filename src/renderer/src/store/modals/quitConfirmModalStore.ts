import { create } from 'zustand'
import { useAppStateStore } from '../appStateStore'

interface QuitConfirmModalStore {
  showQuitConfirmModal: boolean
  openQuitConfirmModal: () => void
  closeQuitConfirmModal: () => void
  confirmQuit: () => Promise<void>
}

export const useQuitConfirmModalStore = create<QuitConfirmModalStore>((set) => ({
  showQuitConfirmModal: false,
  openQuitConfirmModal: () => {
    set({ showQuitConfirmModal: true })
  },
  closeQuitConfirmModal: () => {
    set({ showQuitConfirmModal: false })
  },
  confirmQuit: async () => {
    useAppStateStore.getState().setErrorMessage(null)

    try {
      await window.api.quitApp()
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(error instanceof Error ? error.message : 'Failed to quit the app.')
      set({ showQuitConfirmModal: false })
    }
  }
}))
