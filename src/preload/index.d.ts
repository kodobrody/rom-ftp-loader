import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  AppConfig,
  DownloadSnapshot,
  GameEntry,
  GameMetadataUpdate,
  LibraryCacheSnapshot,
  PlatformSummary
} from '../shared/types'

declare global {
  interface Window {
    electron: ElectronAPI
    api: {
      getConfig: () => Promise<AppConfig>
      saveConfig: (config: AppConfig) => Promise<AppConfig>
      openOnScreenKeyboard: () => Promise<boolean>
      pickDirectory: () => Promise<string | null>
      pickConfigFile: () => Promise<string | null>
      loadConfigFromFile: (filePath: string) => Promise<AppConfig>
      testFtpConnection: (config: AppConfig) => Promise<boolean>
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
      clearPlatformMetadata: (platformName: string) => Promise<number>
      downloadGames: (platformName: string, games: GameEntry[]) => Promise<DownloadSnapshot>
      cancelDownload: (gameId: string) => Promise<DownloadSnapshot>
      clearDownloadQueueHistory: () => Promise<DownloadSnapshot>
      getDownloadState: () => Promise<DownloadSnapshot>
      quitApp: () => Promise<void>
      onDownloadProgress: (listener: (snapshot: DownloadSnapshot) => void) => () => void
      getVersions: () => NodeJS.ProcessVersions
    }
  }
}
