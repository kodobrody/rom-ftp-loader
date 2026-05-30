import { create } from 'zustand'
import type { AppConfig } from '../../../shared/types'
import { emptyConfig, hasRequiredSetup } from '../utils/formatting'
import { useAppStateStore } from './appStateStore'
import { useLibraryStore } from './libraryStore'

interface SetupStore {
  config: AppConfig
  directoryPicking: boolean
  configFileLoading: boolean
  setupReady: boolean
  setConfig: (config: AppConfig) => void
  setDirectoryPicking: (directoryPicking: boolean) => void
  setConfigFileLoading: (configFileLoading: boolean) => void
  updateConfig: (partial: Partial<AppConfig>) => void
  persistConfig: (
    partial: Partial<AppConfig>,
    options?: { refreshLibrary?: boolean; infoMessage?: string | null }
  ) => Promise<AppConfig | null>
  pickDirectory: () => Promise<void>
  loadConfigFromFile: () => Promise<void>
}

export const useSetupStore = create<SetupStore>((set, get) => ({
  config: emptyConfig,
  directoryPicking: false,
  configFileLoading: false,
  setupReady: false,
  setConfig: (config) => {
    set({ config, setupReady: hasRequiredSetup(config) })
  },
  setDirectoryPicking: (directoryPicking) => {
    set({ directoryPicking })
  },
  setConfigFileLoading: (configFileLoading) => {
    set({ configFileLoading })
  },
  updateConfig: (partial) => {
    const nextConfig = { ...get().config, ...partial }
    set({ config: nextConfig, setupReady: hasRequiredSetup(nextConfig) })
  },
  persistConfig: async (partial, options) => {
    const appState = useAppStateStore.getState()
    const library = useLibraryStore.getState()

    try {
      const savedConfig = await window.api.saveConfig({ ...get().config, ...partial })
      const ready = hasRequiredSetup(savedConfig)

      set({ config: savedConfig, setupReady: ready })
      appState.setIsConfigured(ready)

      if (ready && options?.refreshLibrary) {
        library.resetLibraryView()
        await library.refreshPlatforms(savedConfig)
      } else if (!ready) {
        library.resetLibraryView()
      }

      if (typeof options?.infoMessage === 'string') {
        appState.setInfoMessage(options.infoMessage)
      }

      return savedConfig
    } catch (error) {
      appState.setErrorMessage(
        error instanceof Error ? error.message : 'Failed to save configuration.'
      )
      return null
    }
  },
  pickDirectory: async () => {
    const appState = useAppStateStore.getState()

    set({ directoryPicking: true })
    appState.setErrorMessage(null)

    try {
      const pickedDirectory = await window.api.pickDirectory()

      if (pickedDirectory) {
        await get().persistConfig({ romsDirectory: pickedDirectory }, { refreshLibrary: true })
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
      await get().persistConfig(loadedConfig, {
        refreshLibrary: true,
        infoMessage: `Config loaded from ${pickedFile.split(/[\\/]/).pop()}`
      })
    } catch (error) {
      appState.setErrorMessage(
        error instanceof Error ? error.message : 'Failed to load config from file.'
      )
    } finally {
      set({ configFileLoading: false })
    }
  }
}))
