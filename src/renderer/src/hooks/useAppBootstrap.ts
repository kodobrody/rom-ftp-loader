import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { useAppStateStore } from '../store/appStateStore'
import { useDownloadsStore } from '../store/downloadsStore'
import { useLibraryStore } from '../store/libraryStore'
import { useGameModalStore } from '../store/modals/gameModalStore'
import { useKeyboardModalStore } from '../store/modals/keyboardModalStore'
import { useSetupStore } from '../store/setupStore'
import { hasRequiredSetup } from '../utils/formatting'

export const useAppBootstrap = (): void => {
  const selectedPlatformSourceName = useLibraryStore((store) => store.selectedPlatform?.sourceName)
  const pathname = useLocation().pathname

  useEffect(() => {
    let ignore = false

    const bootstrap = async (): Promise<void> => {
      const appState = useAppStateStore.getState()
      const setup = useSetupStore.getState()
      const library = useLibraryStore.getState()
      const downloads = useDownloadsStore.getState()

      appState.setBooting(true)

      try {
        const [savedConfig, activeDownloads] = await Promise.all([
          window.api.getConfig(),
          window.api.getDownloadState()
        ])

        if (ignore) {
          return
        }

        const ready = hasRequiredSetup(savedConfig)

        setup.setConfig(savedConfig)
        downloads.setDownloadSnapshot(activeDownloads)
        library.setDownloadSnapshot(activeDownloads)

        appState.setIsConfigured(ready)

        if (ready) {
          await library.refreshPlatforms(savedConfig)
        }
      } catch (error) {
        if (!ignore) {
          appState.setErrorMessage(
            error instanceof Error ? error.message : 'Failed to load the app state.'
          )
        }
      } finally {
        if (!ignore) {
          appState.setBooting(false)
        }
      }
    }

    void bootstrap()

    return () => {
      ignore = true
    }
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.onDownloadProgress((snapshot) => {
      const downloads = useDownloadsStore.getState()
      const library = useLibraryStore.getState()

      downloads.setDownloadSnapshot(snapshot)
      library.setDownloadSnapshot(snapshot)
      library.updateDownloadedFlags(snapshot)
      useGameModalStore.getState().refreshDerivedFromStores()

      if (!snapshot.active) {
        void library.refreshPlatforms()

        if (selectedPlatformSourceName) {
          void library.refreshGames(selectedPlatformSourceName, { fetchMissingMetadata: false })
        }
      }
    })

    return unsubscribe
  }, [selectedPlatformSourceName])

  useEffect(() => {
    useGameModalStore.getState().refreshDerivedFromStores()
    useKeyboardModalStore.getState().setIsSearchScreen(pathname === '/search')
  }, [pathname, selectedPlatformSourceName])
}
