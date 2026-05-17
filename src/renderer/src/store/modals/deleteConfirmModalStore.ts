import { create } from 'zustand'

interface DeleteConfirmModalStore {
  showDeleteConfirmModal: boolean
  openDeleteConfirmModal: () => void
  closeDeleteConfirmModal: () => void
}

export const useDeleteConfirmModalStore = create<DeleteConfirmModalStore>((set) => ({
  showDeleteConfirmModal: false,
  openDeleteConfirmModal: () => {
    set({ showDeleteConfirmModal: true })
  },
  closeDeleteConfirmModal: () => {
    set({ showDeleteConfirmModal: false })
  }
}))
