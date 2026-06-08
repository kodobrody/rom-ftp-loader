import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppConfig,
  DownloadSnapshot,
  GameEntry,
  GameMetadataUpdate,
  IgdbSearchResult,
  LibraryCacheSnapshot,
  PlatformSummary,
  TorrentBrowserSnapshot,
  TorrentDownloadSnapshot,
  TorrentGameGroup,
  TorrentPlatformSummary
} from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getConfig: () => Promise<AppConfig>
      resetAppData: () => Promise<boolean>
      saveConfig: (config: AppConfig) => Promise<AppConfig>
      openOnScreenKeyboard: () => Promise<boolean>
      pickDirectory: () => Promise<string | null>
      pickTorrentFile: () => Promise<string[] | null>
      pickConfigFile: () => Promise<string | null>
      loadConfigFromFile: (filePath: string) => Promise<AppConfig>
      testFileServiceConnection: (config: AppConfig) => Promise<boolean>
      testTwitchConnection: (config: AppConfig) => Promise<boolean>
      getLibraryCache: () => Promise<LibraryCacheSnapshot>
      listPlatforms: () => Promise<PlatformSummary[]>
      listGames: (
        platformName: string,
        options?: { fetchMissingMetadata?: boolean; forceRefetchMetadata?: boolean }
      ) => Promise<GameEntry[]>
      deleteLocalFile: (localPath: string) => Promise<boolean>
      fetchGameMetadata: (
        platformName: string,
        romFileName: string,
        forceRefetch?: boolean
      ) => Promise<GameMetadataUpdate>
      searchIgdbGames: (platformName: string, query: string) => Promise<IgdbSearchResult[]>
      manualMatchGameMetadata: (
        platformName: string,
        romFileName: string,
        matchedName: string,
        matchedCoverUrl: string | null
      ) => Promise<GameMetadataUpdate>
      downloadGames: (platformName: string, games: GameEntry[]) => Promise<DownloadSnapshot>
      cancelDownload: (gameId: string) => Promise<DownloadSnapshot>
      clearDownloadQueueHistory: () => Promise<DownloadSnapshot>
      getDownloadState: () => Promise<DownloadSnapshot>
      getTorrentBrowserState: () => Promise<TorrentBrowserSnapshot>
      refreshTorrentBrowserState: () => Promise<TorrentBrowserSnapshot>
      listTorrentPlatforms: () => Promise<TorrentPlatformSummary[]>
      listTorrentGames: (platformSourceName: string) => Promise<TorrentGameGroup[]>
      getTorrentDownloadState: () => Promise<TorrentDownloadSnapshot>
      downloadTorrentFile: (torrentFileId: string) => Promise<TorrentDownloadSnapshot>
      quitApp: () => Promise<void>
      onTorrentBrowserState: (listener: (snapshot: TorrentBrowserSnapshot) => void) => () => void
      onDownloadProgress: (listener: (snapshot: DownloadSnapshot) => void) => () => void
      onTorrentDownloadProgress: (
        listener: (snapshot: TorrentDownloadSnapshot) => void
      ) => () => void
      getVersions: () => NodeJS.ProcessVersions
    }
  }
}
