import { create } from 'zustand'
import type { AppConfig, DownloadSnapshot, GameEntry, PlatformSummary } from '../../../shared/types'
import { emptySnapshot, hasRequiredSetup } from '../utils/formatting'
import { useAppStateStore } from './appStateStore'
import { useBulkDeleteConfirmModalStore } from './modals/bulkDeleteConfirmModalStore'
import { useGameModalStore } from './modals/gameModalStore'
import { useSetupStore } from './setupStore'

type SelectionKind = 'downloaded' | 'available' | null

type PlatformMenuRef = React.RefObject<HTMLDivElement | null>

interface LibraryStore {
  selectedPlatform: PlatformSummary | null
  platformsLoading: boolean
  gamesLoading: boolean
  showDownloadedOnly: boolean
  selectionMode: boolean
  showPlatformMenu: boolean
  globalMetadataLoading: boolean
  platformMetadataLoading: boolean
  platformMetadataClearing: boolean
  platforms: PlatformSummary[]
  visiblePlatforms: PlatformSummary[]
  games: GameEntry[]
  visibleGames: GameEntry[]
  selectedGameIds: string[]
  selectedGames: GameEntry[]
  selectedTotalSize: number
  selectionKind: SelectionKind
  downloadSnapshot: DownloadSnapshot
  platformMenuRef: PlatformMenuRef
  setDownloadSnapshot: (downloadSnapshot: DownloadSnapshot) => void
  setGames: (games: GameEntry[]) => void
  updateDownloadedFlags: (snapshot: DownloadSnapshot) => void
  resetLibraryView: () => void
  togglePlatformMenu: () => void
  refreshPlatforms: (nextConfig?: AppConfig) => Promise<void>
  toggleShowDownloadedOnly: () => void
  fetchMissingAllPlatforms: () => Promise<void>
  openPlatform: (platform: PlatformSummary) => Promise<void>
  backToPlatforms: () => void
  refreshView: () => Promise<void>
  refreshGames: (
    platformName: string,
    options?: { fetchMissingMetadata?: boolean; forceRefetchMetadata?: boolean }
  ) => Promise<GameEntry[]>
  refetchPlatformMetadata: () => Promise<void>
  clearPlatformMetadata: () => Promise<void>
  toggleSelectionMode: () => void
  openBulkDeleteConfirmModal: () => void
  downloadSelectedGames: () => Promise<void>
  clearSelection: () => void
  gameTileClick: (game: GameEntry) => void
  closeGameModal: () => void
}

const applyDerived = (
  state: Pick<
    LibraryStore,
    'games' | 'platforms' | 'selectedGameIds' | 'selectionMode' | 'showDownloadedOnly'
  >
): ReturnType<typeof applyDerived> => {
  const selectedGames = state.games.filter((game) => state.selectedGameIds.includes(game.id))
  const selectionKind: SelectionKind =
    selectedGames.length === 0 ? null : selectedGames[0].downloaded ? 'downloaded' : 'available'

  let visibleGames = state.showDownloadedOnly
    ? state.games.filter((game) => game.downloaded)
    : state.games

  if (state.selectionMode && selectionKind !== null) {
    visibleGames = visibleGames.filter((game) =>
      selectionKind === 'downloaded' ? game.downloaded : !game.downloaded
    )
  }

  visibleGames = [...visibleGames].sort((left, right) => {
    if (left.downloaded !== right.downloaded) {
      return left.downloaded ? -1 : 1
    }

    const leftName = left.displayName || left.name
    const rightName = right.displayName || right.name
    return leftName.localeCompare(rightName)
  })

  const visiblePlatforms = state.showDownloadedOnly
    ? state.platforms.filter((platform) => platform.downloadedGameCount > 0)
    : state.platforms

  const selectedTotalSize = selectedGames.reduce((sum, game) => sum + game.size, 0)

  return {
    selectedGames,
    selectionKind,
    selectedTotalSize,
    visibleGames,
    visiblePlatforms
  }
}

const applyMetadataUpdateToGames = (
  games: GameEntry[],
  platformSourceName: string,
  romFileName: string,
  metadata: {
    displayName: string
    cleanedName: string
    coverUrl: string | null
    status: 'found' | 'missing' | 'error'
  }
): GameEntry[] => {
  return games.map((game) => {
    if (game.platformSourceName !== platformSourceName || game.name !== romFileName) {
      return game
    }

    return {
      ...game,
      displayName: metadata.displayName || game.displayName,
      cleanedName: metadata.cleanedName || game.cleanedName,
      coverUrl:
        typeof metadata.coverUrl === 'string' || metadata.coverUrl === null
          ? metadata.coverUrl
          : game.coverUrl,
      metadataStatus: metadata.status
    }
  })
}

export const useLibraryStore = create<LibraryStore>((set, get) => ({
  selectedPlatform: null,
  platformsLoading: false,
  gamesLoading: false,
  showDownloadedOnly: false,
  selectionMode: false,
  showPlatformMenu: false,
  globalMetadataLoading: false,
  platformMetadataLoading: false,
  platformMetadataClearing: false,
  platforms: [],
  visiblePlatforms: [],
  games: [],
  visibleGames: [],
  selectedGameIds: [],
  selectedGames: [],
  selectedTotalSize: 0,
  selectionKind: null,
  downloadSnapshot: emptySnapshot,
  platformMenuRef: { current: null },
  setDownloadSnapshot: (downloadSnapshot) => {
    set({ downloadSnapshot })
    useGameModalStore.getState().refreshDerivedFromStores()
  },
  setGames: (games) => {
    const selectedGameIds = get().selectedGameIds.filter((id) =>
      games.some((game) => game.id === id)
    )
    const derived = applyDerived({
      games,
      platforms: get().platforms,
      selectedGameIds,
      selectionMode: get().selectionMode,
      showDownloadedOnly: get().showDownloadedOnly
    })

    set({ games, selectedGameIds, ...derived })
    useGameModalStore.getState().refreshDerivedFromStores()
  },
  updateDownloadedFlags: (snapshot) => {
    const games = get().games.map((game) => {
      const completedItem = snapshot.items.find(
        (item) => item.gameId === game.id && item.status === 'completed'
      )
      return completedItem ? { ...game, downloaded: true } : game
    })
    const derived = applyDerived({
      games,
      platforms: get().platforms,
      selectedGameIds: get().selectedGameIds,
      selectionMode: get().selectionMode,
      showDownloadedOnly: get().showDownloadedOnly
    })

    set({ games, ...derived })
    useGameModalStore.getState().refreshDerivedFromStores()
  },
  resetLibraryView: () => {
    const nextBase = {
      selectedPlatform: null,
      games: [],
      showDownloadedOnly: false,
      selectedGameIds: [],
      selectionMode: false,
      showPlatformMenu: false
    }

    const derived = applyDerived({
      games: nextBase.games,
      platforms: get().platforms,
      selectedGameIds: nextBase.selectedGameIds,
      selectionMode: nextBase.selectionMode,
      showDownloadedOnly: nextBase.showDownloadedOnly
    })

    set({ ...nextBase, ...derived })
  },
  togglePlatformMenu: () => {
    set((state) => ({ showPlatformMenu: !state.showPlatformMenu }))
  },
  refreshPlatforms: async (nextConfig) => {
    const setupConfig = useSetupStore.getState().config
    const config = nextConfig ?? setupConfig

    if (!hasRequiredSetup(config)) {
      return
    }

    set({ platformsLoading: true })

    try {
      const platforms = await window.api.listPlatforms()
      const selectedPlatform = get().selectedPlatform
      const nextSelectedPlatform = selectedPlatform
        ? (platforms.find((platform) => platform.sourceName === selectedPlatform.sourceName) ??
          null)
        : null
      const derived = applyDerived({
        games: get().games,
        platforms,
        selectedGameIds: get().selectedGameIds,
        selectionMode: get().selectionMode,
        showDownloadedOnly: get().showDownloadedOnly
      })

      set({ platforms, selectedPlatform: nextSelectedPlatform, ...derived })
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(error instanceof Error ? error.message : 'Failed to load platforms.')
    } finally {
      set({ platformsLoading: false })
    }
  },
  toggleShowDownloadedOnly: () => {
    const nextShowDownloadedOnly = !get().showDownloadedOnly
    const derived = applyDerived({
      games: get().games,
      platforms: get().platforms,
      selectedGameIds: [],
      selectionMode: get().selectionMode,
      showDownloadedOnly: nextShowDownloadedOnly
    })

    set({
      showPlatformMenu: false,
      showDownloadedOnly: nextShowDownloadedOnly,
      selectedGameIds: [],
      ...derived
    })
  },
  fetchMissingAllPlatforms: async () => {
    set({ globalMetadataLoading: true })

    try {
      const result = await window.api.fetchMissingMetadataAllPlatforms()
      useAppStateStore
        .getState()
        .setInfoMessage(
          `Refetched metadata for ${result.romsFetched} ROMs in ${result.platformsProcessed} platforms.`
        )

      await get().refreshPlatforms()

      const selectedPlatform = get().selectedPlatform
      if (selectedPlatform) {
        await get().refreshGames(selectedPlatform.sourceName, { fetchMissingMetadata: false })
      }
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(
          error instanceof Error ? error.message : 'Failed to fetch missing metadata.'
        )
    } finally {
      set({ globalMetadataLoading: false })
    }
  },
  openPlatform: async (platform) => {
    set({
      selectedPlatform: platform,
      showPlatformMenu: false,
      selectionMode: false,
      selectedGameIds: []
    })
    useAppStateStore.getState().setErrorMessage(null)
    useAppStateStore.getState().setInfoMessage(null)
    useGameModalStore.getState().closeGameModal()

    const games = await get().refreshGames(platform.sourceName, { fetchMissingMetadata: false })

    const gamesMissingCover = games.filter((game) => !game.coverUrl)
    if (gamesMissingCover.length === 0) {
      return
    }

    const prioritizedGames = [...gamesMissingCover].sort((left, right) => {
      if (left.downloaded !== right.downloaded) {
        return left.downloaded ? -1 : 1
      }

      const leftName = left.displayName || left.name
      const rightName = right.displayName || right.name
      return leftName.localeCompare(rightName)
    })

    for (const game of prioritizedGames) {
      const currentSelectedPlatform = get().selectedPlatform

      if (!currentSelectedPlatform || currentSelectedPlatform.sourceName !== platform.sourceName) {
        break
      }

      try {
        const metadata = await window.api.fetchGameMetadata(platform.sourceName, game.name)
        const nextGames = applyMetadataUpdateToGames(
          get().games,
          platform.sourceName,
          metadata.romFileName,
          metadata
        )
        get().setGames(nextGames)
      } catch {
        // Keep auto-fetch best-effort; manual actions can retry and surface specific errors.
      }
    }
  },
  backToPlatforms: () => {
    set({
      selectedPlatform: null,
      showPlatformMenu: false,
      selectionMode: false,
      selectedGameIds: []
    })
    useGameModalStore.getState().closeGameModal()
  },
  refreshView: async () => {
    const selectedPlatform = get().selectedPlatform
    if (!selectedPlatform) {
      return
    }

    await get().refreshGames(selectedPlatform.sourceName, { fetchMissingMetadata: false })
  },
  refreshGames: async (platformName, options) => {
    set({ gamesLoading: true })

    try {
      const games = await window.api.listGames(platformName, options)
      get().setGames(games)
      return games
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(error instanceof Error ? error.message : 'Failed to load games.')
      return []
    } finally {
      set({ gamesLoading: false })
    }
  },
  refetchPlatformMetadata: async () => {
    const selectedPlatform = get().selectedPlatform
    if (!selectedPlatform) {
      return
    }

    set({ platformMetadataLoading: true })
    useAppStateStore.getState().setErrorMessage(null)
    useAppStateStore.getState().setInfoMessage(null)

    try {
      const games = await window.api.listGames(selectedPlatform.sourceName, {
        fetchMissingMetadata: false
      })
      get().setGames(games)

      let processedCount = 0
      const prioritizedGames = [...games].sort((left, right) => {
        if (left.downloaded !== right.downloaded) {
          return left.downloaded ? -1 : 1
        }

        const leftName = left.displayName || left.name
        const rightName = right.displayName || right.name
        return leftName.localeCompare(rightName)
      })

      for (const game of prioritizedGames) {
        const metadata = await window.api.fetchGameMetadata(
          selectedPlatform.sourceName,
          game.name,
          true
        )
        const nextGames = applyMetadataUpdateToGames(
          get().games,
          selectedPlatform.sourceName,
          metadata.romFileName,
          metadata
        )
        get().setGames(nextGames)
        processedCount += 1
      }

      useAppStateStore
        .getState()
        .setInfoMessage(
          `Metadata refreshed for ${processedCount} games on ${selectedPlatform.name}.`
        )
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(error instanceof Error ? error.message : 'Failed to refetch metadata.')
    } finally {
      set({ platformMetadataLoading: false })
    }
  },
  clearPlatformMetadata: async () => {
    const selectedPlatform = get().selectedPlatform
    if (!selectedPlatform) {
      return
    }

    set({ platformMetadataClearing: true })
    useAppStateStore.getState().setErrorMessage(null)
    useAppStateStore.getState().setInfoMessage(null)

    try {
      const deletedCount = await window.api.clearPlatformMetadata(selectedPlatform.sourceName)
      useAppStateStore
        .getState()
        .setInfoMessage(`Deleted metadata for ${deletedCount} entries on ${selectedPlatform.name}.`)
      await get().refreshGames(selectedPlatform.sourceName, { fetchMissingMetadata: false })
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(error instanceof Error ? error.message : 'Failed to clear metadata.')
    } finally {
      set({ platformMetadataClearing: false })
    }
  },
  toggleSelectionMode: () => {
    const nextSelectionMode = !get().selectionMode
    const nextSelectedGameIds = nextSelectionMode ? get().selectedGameIds : []

    const derived = applyDerived({
      games: get().games,
      platforms: get().platforms,
      selectedGameIds: nextSelectedGameIds,
      selectionMode: nextSelectionMode,
      showDownloadedOnly: get().showDownloadedOnly
    })

    set({
      selectionMode: nextSelectionMode,
      showPlatformMenu: false,
      selectedGameIds: nextSelectedGameIds,
      ...derived
    })
  },
  openBulkDeleteConfirmModal: () => {
    useGameModalStore.getState().refreshDerivedFromStores()
    useBulkDeleteConfirmModalStore.getState().openBulkDeleteConfirmModal()
  },
  downloadSelectedGames: async () => {
    const selectedPlatform = get().selectedPlatform
    const selectedGames = get().selectedGames

    if (!selectedPlatform || selectedGames.length === 0) {
      return
    }

    const availableGames = selectedGames.filter((game) => !game.downloaded)

    if (availableGames.length === 0) {
      return
    }

    useAppStateStore.getState().setErrorMessage(null)

    try {
      const snapshot = await window.api.downloadGames(selectedPlatform.sourceName, availableGames)
      set({ downloadSnapshot: snapshot, selectedGameIds: [], selectionMode: false })
      const derived = applyDerived({
        games: get().games,
        platforms: get().platforms,
        selectedGameIds: [],
        selectionMode: false,
        showDownloadedOnly: get().showDownloadedOnly
      })
      set({ ...derived })
      useGameModalStore.getState().refreshDerivedFromStores()
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(
          error instanceof Error ? error.message : 'Failed to start the download queue.'
        )
    }
  },
  clearSelection: () => {
    const derived = applyDerived({
      games: get().games,
      platforms: get().platforms,
      selectedGameIds: [],
      selectionMode: get().selectionMode,
      showDownloadedOnly: get().showDownloadedOnly
    })

    set({ selectedGameIds: [], ...derived })
  },
  gameTileClick: (game) => {
    const queueItem = get().downloadSnapshot.items.find((item) => item.gameId === game.id)
    const isDownloading = Boolean(queueItem && ['queued', 'downloading'].includes(queueItem.status))

    if (get().selectionMode && !isDownloading) {
      const selected = new Set(get().selectedGameIds)

      if (selected.has(game.id)) {
        selected.delete(game.id)
      } else {
        selected.add(game.id)
      }

      const selectedGameIds = [...selected]
      const derived = applyDerived({
        games: get().games,
        platforms: get().platforms,
        selectedGameIds,
        selectionMode: get().selectionMode,
        showDownloadedOnly: get().showDownloadedOnly
      })

      set({ selectedGameIds, ...derived })
      return
    }

    useGameModalStore.getState().openGameModal(game.id)
  },
  closeGameModal: () => {
    useGameModalStore.getState().closeGameModal()
  }
}))
