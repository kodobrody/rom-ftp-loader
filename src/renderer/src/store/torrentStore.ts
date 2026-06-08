import { create } from 'zustand'
import type {
  GameMetadataUpdate,
  TorrentBrowserSnapshot,
  TorrentDownloadSnapshot,
  TorrentGameGroup,
  TorrentPlatformSummary
} from '../../../shared/types'
import { useAppStateStore } from './appStateStore'

const emptyBrowserSnapshot: TorrentBrowserSnapshot = {
  files: [],
  resolvedNames: {},
  sourceErrors: []
}

const buildTorrentPlatforms = (
  browserSnapshot: TorrentBrowserSnapshot
): TorrentPlatformSummary[] => {
  const platforms = new Map<string, TorrentPlatformSummary>()

  for (const file of browserSnapshot.files) {
    const key = file.matchedPlatformSourceName
    const existing = platforms.get(key)

    if (existing) {
      existing.fileCount += 1

      if (!existing.releaseGroups.includes(file.releaseGroupName)) {
        existing.releaseGroups.push(file.releaseGroupName)
      }
    } else {
      platforms.set(key, {
        id: key,
        displayName: file.matchedPlatformName,
        sourceName: file.matchedPlatformSourceName,
        fileCount: 1,
        releaseGroups: [file.releaseGroupName]
      })
    }
  }

  return [...platforms.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  )
}

const emptyDownloadSnapshot: TorrentDownloadSnapshot = {
  active: false,
  items: []
}

interface TorrentStore {
  browserSnapshot: TorrentBrowserSnapshot
  browserLoading: boolean
  platforms: TorrentPlatformSummary[]
  selectedPlatform: TorrentPlatformSummary | null
  gamesLoading: boolean
  metadataFetchInProgress: boolean
  metadataFetchPlatformSourceName: string | null
  games: TorrentGameGroup[]
  activeTorrentGame: TorrentGameGroup | null
  downloadSnapshot: TorrentDownloadSnapshot
  setBrowserSnapshot: (browserSnapshot: TorrentBrowserSnapshot) => void
  setBrowserLoading: (browserLoading: boolean) => void
  setDownloadSnapshot: (downloadSnapshot: TorrentDownloadSnapshot) => void
  hydrateDownloadSnapshot: () => Promise<void>
  ensureBrowserState: () => Promise<void>
  refreshBrowserState: () => Promise<void>
  openPlatform: (platform: TorrentPlatformSummary) => Promise<void>
  backToPlatforms: () => void
  loadGames: (platformSourceName: string) => Promise<TorrentGameGroup[]>
  fetchGameMetadata: (platformSourceName: string, games: TorrentGameGroup[]) => Promise<void>
  openTorrentGame: (game: TorrentGameGroup) => void
  closeTorrentGame: () => void
  patchGameMetadata: (gameId: string, metadata: GameMetadataUpdate) => void
  queueDownload: (torrentFileId: string) => Promise<void>
  downloadFile: (torrentFileId: string) => Promise<void>
}

export const useTorrentStore = create<TorrentStore>((set, get) => ({
  browserSnapshot: emptyBrowserSnapshot,
  browserLoading: false,
  platforms: [],
  selectedPlatform: null,
  gamesLoading: false,
  metadataFetchInProgress: false,
  metadataFetchPlatformSourceName: null,
  games: [],
  activeTorrentGame: null,
  downloadSnapshot: emptyDownloadSnapshot,
  setBrowserSnapshot: (browserSnapshot) => {
    set({ browserSnapshot, platforms: buildTorrentPlatforms(browserSnapshot) })
  },
  setBrowserLoading: (browserLoading) => {
    set({ browserLoading })
  },
  setDownloadSnapshot: (downloadSnapshot) => {
    set({ downloadSnapshot })
  },
  hydrateDownloadSnapshot: async () => {
    try {
      const downloadSnapshot = await window.api.getTorrentDownloadState()
      set({ downloadSnapshot })
    } catch {
      /* ignore */
    }
  },
  ensureBrowserState: async () => {
    if (get().platforms.length > 0 || get().browserLoading) {
      return
    }

    const appState = useAppStateStore.getState()

    set({ browserLoading: true })

    try {
      const snapshot = await window.api.getTorrentBrowserState()
      set({ browserSnapshot: snapshot, platforms: buildTorrentPlatforms(snapshot) })
    } catch (error) {
      appState.setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load torrent browser state.'
      )
    } finally {
      set({ browserLoading: false })
    }
  },
  refreshBrowserState: async () => {
    const appState = useAppStateStore.getState()

    set({ browserLoading: true })
    appState.setErrorMessage(null)

    try {
      const snapshot = await window.api.refreshTorrentBrowserState()
      set({ browserSnapshot: snapshot, platforms: buildTorrentPlatforms(snapshot) })
    } catch (error) {
      appState.setErrorMessage(
        error instanceof Error ? error.message : 'Failed to refresh torrent state.'
      )
    } finally {
      set({ browserLoading: false })
    }
  },
  openPlatform: async (platform) => {
    set({
      selectedPlatform: platform,
      games: [],
      activeTorrentGame: null,
      metadataFetchInProgress: false,
      metadataFetchPlatformSourceName: null
    })

    const games = await get().loadGames(platform.sourceName)

    const gamesNeedingMetadata = games.filter((g) => g.metadataStatus !== 'found')

    if (gamesNeedingMetadata.length === 0) {
      return
    }

    set({ metadataFetchInProgress: true, metadataFetchPlatformSourceName: platform.sourceName })

    try {
      for (const game of gamesNeedingMetadata) {
        if (get().selectedPlatform?.sourceName !== platform.sourceName) {
          break
        }

        const repFile = game.files[0]

        if (!repFile) {
          continue
        }

        try {
          const metadata = await window.api.fetchGameMetadata(platform.sourceName, repFile.fileName)

          if (get().selectedPlatform?.sourceName !== platform.sourceName) {
            break
          }

          set((state) => ({
            games: state.games.map((g) =>
              g.id !== game.id
                ? g
                : {
                    ...g,
                    displayName: metadata.displayName || g.displayName,
                    cleanedName: metadata.cleanedName || g.cleanedName,
                    coverUrl: metadata.coverUrl,
                    metadataStatus: metadata.status
                  }
            )
          }))
        } catch {
          // Best-effort metadata fetch; silently skip failures
        }
      }
    } finally {
      const selected = get().selectedPlatform
      set({
        metadataFetchInProgress: false,
        metadataFetchPlatformSourceName:
          selected?.sourceName === platform.sourceName ? platform.sourceName : null
      })
    }
  },
  backToPlatforms: () => {
    set({
      selectedPlatform: null,
      games: [],
      activeTorrentGame: null,
      metadataFetchInProgress: false,
      metadataFetchPlatformSourceName: null
    })
  },
  loadGames: async (platformSourceName: string) => {
    set({ gamesLoading: true, games: [] })

    try {
      const games = await window.api.listTorrentGames(platformSourceName)
      set({ games })
      return games
    } catch (error) {
      useAppStateStore
        .getState()
        .setErrorMessage(error instanceof Error ? error.message : 'Failed to load torrent games.')
      return []
    } finally {
      set({ gamesLoading: false })
    }
  },
  fetchGameMetadata: async (
    platformSourceName: string,
    gamesNeedingMetadata: TorrentGameGroup[]
  ) => {
    const results = await Promise.allSettled(
      gamesNeedingMetadata.map(async (game) => {
        const representativeFile = game.files[0]

        if (!representativeFile) {
          return game
        }

        try {
          const metadata = await window.api.fetchGameMetadata(
            platformSourceName,
            representativeFile.fileName
          )

          return {
            ...game,
            displayName: metadata.displayName,
            cleanedName: metadata.cleanedName,
            coverUrl: metadata.coverUrl,
            metadataStatus: metadata.status
          } satisfies TorrentGameGroup
        } catch {
          return { ...game, metadataStatus: 'error' } satisfies TorrentGameGroup
        }
      })
    )

    const updatedGames = results
      .map((result) => (result.status === 'fulfilled' ? result.value : null))
      .filter((g): g is TorrentGameGroup => Boolean(g))

    set((state) => ({
      games: state.games.map((g) => updatedGames.find((u) => u.id === g.id) ?? g)
    }))
  },
  openTorrentGame: (game) => {
    set({ activeTorrentGame: game })
  },
  closeTorrentGame: () => {
    set({ activeTorrentGame: null })
  },
  patchGameMetadata: (gameId, metadata) => {
    set((state) => ({
      games: state.games.map((g) =>
        g.id !== gameId
          ? g
          : {
              ...g,
              displayName: metadata.displayName || g.displayName,
              cleanedName: metadata.cleanedName || g.cleanedName,
              coverUrl:
                typeof metadata.coverUrl === 'string' || metadata.coverUrl === null
                  ? metadata.coverUrl
                  : g.coverUrl,
              metadataStatus: metadata.status
            }
      ),
      activeTorrentGame:
        state.activeTorrentGame?.id === gameId
          ? {
              ...state.activeTorrentGame,
              displayName: metadata.displayName || state.activeTorrentGame.displayName,
              cleanedName: metadata.cleanedName || state.activeTorrentGame.cleanedName,
              coverUrl:
                typeof metadata.coverUrl === 'string' || metadata.coverUrl === null
                  ? metadata.coverUrl
                  : state.activeTorrentGame.coverUrl,
              metadataStatus: metadata.status
            }
          : state.activeTorrentGame
    }))
  },
  queueDownload: async (torrentFileId) => {
    const appState = useAppStateStore.getState()
    appState.setErrorMessage(null)

    try {
      const downloadSnapshot = await window.api.downloadTorrentFile(torrentFileId)
      set({ downloadSnapshot })
    } catch (error) {
      appState.setErrorMessage(
        error instanceof Error ? error.message : 'Failed to start torrent download.'
      )
    }
  },
  downloadFile: async (torrentFileId) => {
    await get().queueDownload(torrentFileId)
  }
}))
