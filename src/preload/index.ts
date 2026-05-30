import { electronAPI } from '@electron-toolkit/preload'
import { contextBridge, ipcRenderer } from 'electron'
import type {
  AppConfig,
  DownloadSnapshot,
  GameEntry,
  GameMetadataUpdate,
  LibraryCacheSnapshot,
  PlatformSummary
} from '../shared/types'

// Custom APIs for renderer
const api = {
  getConfig: () => ipcRenderer.invoke('app:get-config') as Promise<AppConfig>,
  saveConfig: (config: AppConfig) =>
    ipcRenderer.invoke('app:save-config', config) as Promise<AppConfig>,
  openOnScreenKeyboard: () =>
    ipcRenderer.invoke('system:open-onscreen-keyboard') as Promise<boolean>,
  pickDirectory: () => ipcRenderer.invoke('app:pick-directory') as Promise<string | null>,
  pickConfigFile: () => ipcRenderer.invoke('app:pick-config-file') as Promise<string | null>,
  loadConfigFromFile: (filePath: string) =>
    ipcRenderer.invoke('app:load-config-from-file', filePath) as Promise<AppConfig>,
  testFtpConnection: (config: AppConfig) =>
    ipcRenderer.invoke('app:test-ftp-connection', config) as Promise<boolean>,
  testTwitchConnection: (config: AppConfig) =>
    ipcRenderer.invoke('app:test-twitch-connection', config) as Promise<boolean>,
  getLibraryCache: () => ipcRenderer.invoke('library:get-cache') as Promise<LibraryCacheSnapshot>,
  listPlatforms: () => ipcRenderer.invoke('library:list-platforms') as Promise<PlatformSummary[]>,
  listGames: (
    platformName: string,
    options?: { fetchMissingMetadata?: boolean; forceRefetchMetadata?: boolean }
  ) => ipcRenderer.invoke('library:list-games', platformName, options) as Promise<GameEntry[]>,
  deleteLocalFile: (localPath: string) =>
    ipcRenderer.invoke('library:delete-local-file', localPath) as Promise<boolean>,
  fetchGameMetadata: (platformName: string, romFileName: string, forceRefetch?: boolean) =>
    ipcRenderer.invoke(
      'metadata:fetch-game',
      platformName,
      romFileName,
      forceRefetch
    ) as Promise<GameMetadataUpdate>,
  clearPlatformMetadata: (platformName: string) =>
    ipcRenderer.invoke('metadata:clear-platform', platformName) as Promise<number>,
  downloadGames: (platformName: string, games: GameEntry[]) =>
    ipcRenderer.invoke('downloads:start', platformName, games) as Promise<DownloadSnapshot>,
  cancelDownload: (gameId: string) =>
    ipcRenderer.invoke('downloads:cancel', gameId) as Promise<DownloadSnapshot>,
  clearDownloadQueueHistory: () =>
    ipcRenderer.invoke('downloads:clear-history') as Promise<DownloadSnapshot>,
  getDownloadState: () => ipcRenderer.invoke('downloads:get-state') as Promise<DownloadSnapshot>,
  quitApp: () => ipcRenderer.invoke('app:quit') as Promise<void>,
  onDownloadProgress: (listener: (snapshot: DownloadSnapshot) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, snapshot: DownloadSnapshot) => {
      listener(snapshot)
    }

    ipcRenderer.on('downloads:progress', subscription)

    return () => {
      ipcRenderer.off('downloads:progress', subscription)
    }
  },
  getVersions: () => process.versions
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
