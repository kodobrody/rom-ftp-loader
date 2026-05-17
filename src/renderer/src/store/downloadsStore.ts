import { create } from 'zustand'
import type { DownloadSnapshot } from '../../../shared/types'
import { emptySnapshot } from '../utils/formatting'
import { useAppStateStore } from './appStateStore'
import { useLibraryStore } from './libraryStore'

interface DownloadsStore {
  downloadSnapshot: DownloadSnapshot
  clearableDownloadCount: number
  setDownloadSnapshot: (downloadSnapshot: DownloadSnapshot) => void
  clearQueueHistory: () => Promise<void>
}

export const useDownloadsStore = create<DownloadsStore>((set) => ({
  downloadSnapshot: emptySnapshot,
  clearableDownloadCount: 0,
  setDownloadSnapshot: (downloadSnapshot) => {
    set({
      downloadSnapshot,
      clearableDownloadCount: downloadSnapshot.items.filter(
        (item) => !['queued', 'downloading'].includes(item.status)
      ).length
    })
  },
  clearQueueHistory: async () => {
    useAppStateStore.getState().setErrorMessage(null)

    try {
      const snapshot = await window.api.clearDownloadQueueHistory()
      set({
        downloadSnapshot: snapshot,
        clearableDownloadCount: snapshot.items.filter(
          (item) => !['queued', 'downloading'].includes(item.status)
        ).length
      })
      useLibraryStore.getState().setDownloadSnapshot(snapshot)
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(
          error instanceof Error ? error.message : 'Failed to clear download queue history.'
        )
    }
  }
}))
