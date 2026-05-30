import { create } from 'zustand'
import type { DownloadSnapshot, GameEntry } from '../../../../shared/types'
import { useAppStateStore } from '../appStateStore'
import { useLibraryStore } from '../libraryStore'
import { useDeleteConfirmModalStore } from './deleteConfirmModalStore'

interface SearchModalEntry {
  platformSourceName: string
  gameId: string
}

interface GameModalStore {
  activeGameModalId: string | null
  searchModalEntry: SearchModalEntry | null
  directModalGame: GameEntry | null
  modalGame: GameEntry | null
  activeGameQueueItem: DownloadSnapshot['items'][number] | null
  gameModalRef: React.RefObject<HTMLElement | null>
  setSearchModalEntry: (entry: SearchModalEntry | null) => void
  openGameModalFromEntry: (entry: GameEntry) => void
  refreshDerivedFromStores: () => void
  openGameModal: (gameId: string) => void
  closeGameModal: () => void
  cancelDownloadFromModal: () => Promise<void>
  downloadGameFromModal: () => Promise<void>
  deleteDownloadedGameFromModal: () => Promise<void>
}

export const useGameModalStore = create<GameModalStore>((set, get) => ({
  activeGameModalId: null,
  searchModalEntry: null,
  directModalGame: null,
  modalGame: null,
  activeGameQueueItem: null,
  gameModalRef: { current: null },
  setSearchModalEntry: (searchModalEntry) => {
    set({ searchModalEntry, directModalGame: null })
    get().refreshDerivedFromStores()
  },
  openGameModalFromEntry: (entry) => {
    const library = useLibraryStore.getState()
    const activeGameQueueItem =
      library.downloadSnapshot.items.find((item) => item.gameId === entry.id) ?? null

    set({
      activeGameModalId: null,
      searchModalEntry: null,
      directModalGame: entry,
      modalGame: entry,
      activeGameQueueItem
    })
    useDeleteConfirmModalStore.getState().closeDeleteConfirmModal()
  },
  refreshDerivedFromStores: () => {
    const library = useLibraryStore.getState()
    const searchModalEntry = get().searchModalEntry
    const directModalGame = get().directModalGame

    const activeGame = get().activeGameModalId
      ? (library.games.find((game) => game.id === get().activeGameModalId) ?? null)
      : null

    const resolvedSearchModalGame =
      activeGame ??
      (searchModalEntry
        ? (library.games.find(
            (game) =>
              game.id === searchModalEntry.gameId &&
              game.platformSourceName === searchModalEntry.platformSourceName
          ) ?? null)
        : null)

    const modalGame =
      resolvedSearchModalGame ??
      (directModalGame
        ? (library.games.find(
            (game) =>
              game.id === directModalGame.id &&
              game.platformSourceName === directModalGame.platformSourceName
          ) ?? directModalGame)
        : null)

    const activeGameQueueItem = modalGame
      ? (library.downloadSnapshot.items.find((item) => item.gameId === modalGame.id) ?? null)
      : null

    set({ modalGame, activeGameQueueItem })
  },
  openGameModal: (gameId) => {
    set({ activeGameModalId: gameId, searchModalEntry: null, directModalGame: null })
    useDeleteConfirmModalStore.getState().closeDeleteConfirmModal()
    get().refreshDerivedFromStores()
  },
  closeGameModal: () => {
    set({
      activeGameModalId: null,
      searchModalEntry: null,
      directModalGame: null,
      modalGame: null,
      activeGameQueueItem: null
    })
    useDeleteConfirmModalStore.getState().closeDeleteConfirmModal()
  },
  cancelDownloadFromModal: async () => {
    const modalGame = get().modalGame

    if (!modalGame) {
      return
    }

    useAppStateStore.getState().setErrorMessage(null)

    try {
      const snapshot = await window.api.cancelDownload(modalGame.id)
      useLibraryStore.getState().setDownloadSnapshot(snapshot)
      get().refreshDerivedFromStores()
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(error instanceof Error ? error.message : 'Failed to cancel the download.')
    }
  },
  downloadGameFromModal: async () => {
    const modalGame = get().modalGame
    if (!modalGame) {
      return
    }

    const library = useLibraryStore.getState()
    useAppStateStore.getState().setErrorMessage(null)

    try {
      const snapshot = await window.api.downloadGames(modalGame.platformSourceName, [modalGame])
      library.setDownloadSnapshot(snapshot)
      get().closeGameModal()
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(
          error instanceof Error ? error.message : 'Failed to start the download queue.'
        )
    }
  },
  deleteDownloadedGameFromModal: async () => {
    const modalGame = get().modalGame
    if (!modalGame) {
      return
    }

    useAppStateStore.getState().setErrorMessage(null)

    try {
      const deleted = await window.api.deleteLocalFile(modalGame.localPath)

      if (!deleted) {
        useAppStateStore.getState().setErrorMessage('Could not delete local file.')
        return
      }

      get().closeGameModal()

      const library = useLibraryStore.getState()
      await library.refreshGames(modalGame.platformSourceName, { fetchMissingMetadata: false })
      await library.refreshPlatforms()
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(error instanceof Error ? error.message : 'Failed to delete local file.')
    }
  }
}))
