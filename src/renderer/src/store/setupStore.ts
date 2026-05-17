import { create } from 'zustand'
import type { AppConfig } from '../../../shared/types'
import { emptyConfig, hasRequiredSetup } from '../utils/formatting'
import { useAppStateStore } from './appStateStore'
import { useLibraryStore } from './libraryStore'

interface SetupStore {
  config: AppConfig
  saving: boolean
  directoryPicking: boolean
  configFileLoading: boolean
  ftpTesting: boolean
  setupReady: boolean
  setConfig: (config: AppConfig) => void
  setSaving: (saving: boolean) => void
  setDirectoryPicking: (directoryPicking: boolean) => void
  setConfigFileLoading: (configFileLoading: boolean) => void
  setFtpTesting: (ftpTesting: boolean) => void
  updateConfig: (partial: Partial<AppConfig>) => void
  pickDirectory: () => Promise<void>
  loadConfigFromFile: () => Promise<void>
  testFtpConnection: () => Promise<void>
  saveConfig: (event: React.FormEvent<HTMLFormElement>) => Promise<boolean>
}

export const useSetupStore = create<SetupStore>((set, get) => ({
  config: emptyConfig,
  saving: false,
  directoryPicking: false,
  configFileLoading: false,
  ftpTesting: false,
  setupReady: false,
  setConfig: (config) => {
    set({ config, setupReady: hasRequiredSetup(config) })
  },
  setSaving: (saving) => {
    set({ saving })
  },
  setDirectoryPicking: (directoryPicking) => {
    set({ directoryPicking })
  },
  setConfigFileLoading: (configFileLoading) => {
    set({ configFileLoading })
  },
  setFtpTesting: (ftpTesting) => {
    set({ ftpTesting })
  },
  updateConfig: (partial) => {
    const nextConfig = { ...get().config, ...partial }
    set({ config: nextConfig, setupReady: hasRequiredSetup(nextConfig) })
  },
  pickDirectory: async () => {
    const appState = useAppStateStore.getState()

    set({ directoryPicking: true })
    appState.setErrorMessage(null)

    try {
      const pickedDirectory = await window.api.pickDirectory()

      if (pickedDirectory) {
        const nextConfig = { ...get().config, romsDirectory: pickedDirectory }
        set({ config: nextConfig, setupReady: hasRequiredSetup(nextConfig) })
      }
    } catch (error) {
      appState.setErrorMessage(
        error instanceof Error ? error.message : 'Failed to pick a directory.'
      )
    } finally {
      set({ directoryPicking: false })
    }
  },
  loadConfigFromFile: async () => {
    const appState = useAppStateStore.getState()

    set({ configFileLoading: true })
    appState.setErrorMessage(null)

    try {
      const pickedFile = await window.api.pickConfigFile()

      if (!pickedFile) {
        return
      }

      const loadedConfig = await window.api.loadConfigFromFile(pickedFile)
      set({ config: loadedConfig, setupReady: hasRequiredSetup(loadedConfig) })
      appState.setInfoMessage(`Config loaded from ${pickedFile.split(/[\\/]/).pop()}`)
    } catch (error) {
      appState.setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load config from file.'
      )
    } finally {
      set({ configFileLoading: false })
    }
  },
  testFtpConnection: async () => {
    const appState = useAppStateStore.getState()

    set({ ftpTesting: true })
    appState.setErrorMessage(null)

    try {
      await window.api.testFtpConnection(get().config)
      appState.setInfoMessage('FTP connection test succeeded.')
    } catch (error) {
      appState.setErrorMessage(
        error instanceof Error ? error.message : 'Failed to connect to FTP server.'
      )
    } finally {
      set({ ftpTesting: false })
    }
  },
  saveConfig: async (event) => {
    event.preventDefault()

    const appState = useAppStateStore.getState()
    const library = useLibraryStore.getState()

    set({ saving: true })
    appState.setErrorMessage(null)

    try {
      await window.api.testFtpConnection(get().config)

      const savedConfig = await window.api.saveConfig(get().config)
      const ready = hasRequiredSetup(savedConfig)

      set({ config: savedConfig, setupReady: ready })

      appState.setIsConfigured(ready)

      if (ready) {
        library.resetLibraryView()
        await library.refreshPlatforms(savedConfig)
      }

      return ready
    } catch (error) {
      appState.setErrorMessage(
        error instanceof Error ? error.message : 'Failed to save configuration.'
      )
      return false
    } finally {
      set({ saving: false })
    }
  }
}))
