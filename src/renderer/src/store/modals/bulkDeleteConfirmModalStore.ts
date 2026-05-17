import { create } from 'zustand'
import { useAppStateStore } from '../appStateStore'
import { useLibraryStore } from '../libraryStore'

interface BulkDeleteConfirmModalStore {
  showBulkDeleteConfirmModal: boolean
  openBulkDeleteConfirmModal: () => void
  closeBulkDeleteConfirmModal: () => void
  deleteSelectedGamesConfirmed: () => Promise<void>
}

export const useBulkDeleteConfirmModalStore = create<BulkDeleteConfirmModalStore>((set) => ({
  showBulkDeleteConfirmModal: false,
  openBulkDeleteConfirmModal: () => {
    set({ showBulkDeleteConfirmModal: true })
  },
  closeBulkDeleteConfirmModal: () => {
    set({ showBulkDeleteConfirmModal: false })
  },
  deleteSelectedGamesConfirmed: async () => {
    const library = useLibraryStore.getState()
    const selectedGames = library.selectedGames
    const wasSelectionMode = library.selectionMode

    if (selectedGames.length === 0) {
      return
    }

    const downloadedGames = selectedGames.filter((game) => game.downloaded)
    const platformSourceName = downloadedGames[0]?.platformSourceName

    if (downloadedGames.length === 0 || !platformSourceName) {
      return
    }

    useAppStateStore.getState().setErrorMessage(null)

    try {
      let deletedFileCount = 0
      let failedFileCount = 0

      for (const game of downloadedGames) {
        const filesToDelete =
          game.downloadFiles && game.downloadFiles.length > 0
            ? game.downloadFiles.map((file) => file.localPath)
            : [game.localPath]

        for (const localPath of filesToDelete) {
          const deleted = await window.api.deleteLocalFile(localPath)

          if (deleted) {
            deletedFileCount += 1
          } else {
            failedFileCount += 1
          }
        }
      }

      set({ showBulkDeleteConfirmModal: false })
      library.clearSelection()

      if (wasSelectionMode) {
        library.toggleSelectionMode()
      }

      await library.refreshGames(platformSourceName, { fetchMissingMetadata: false })
      await library.refreshPlatforms()

      if (deletedFileCount > 0) {
        useAppStateStore
          .getState()
          .setInfoMessage(
            `Deleted ${deletedFileCount} local file${deletedFileCount === 1 ? '' : 's'}.`
          )
      }

      if (failedFileCount > 0 && deletedFileCount > 0) {
        useAppStateStore
          .getState()
          .setErrorMessage(
            `${failedFileCount} file${failedFileCount === 1 ? '' : 's'} could not be deleted.`
          )
      } else if (failedFileCount > 0) {
        useAppStateStore.getState().setErrorMessage('Selected files could not be deleted.')
      }
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(
          error instanceof Error ? error.message : 'Failed to delete selected games.'
        )
    }
  }
}))
