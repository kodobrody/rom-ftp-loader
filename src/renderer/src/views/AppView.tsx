import { useGamepadNavigation } from '@renderer/hooks/useGamepadNavigation'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import { BootScreen } from '../components/BootScreen'
import { BulkDeleteConfirmModal } from '../components/modals/BulkDeleteConfirmModal'
import { DeleteConfirmModal } from '../components/modals/DeleteConfirmModal'
import { GameModal } from '../components/modals/GameModal'
import { KeyboardModal } from '../components/modals/KeyboardModal'
import { QuitConfirmModal } from '../components/modals/QuitConfirmModal'
import { DownloadsScreen } from '../screens/DownloadsScreen'
import { GamesScreen } from '../screens/GamesScreen'
import { PlatformsScreen } from '../screens/PlatformsScreen'
import { SearchScreen } from '../screens/SearchScreen'
import { SetupScreen } from '../screens/SetupScreen'
import { TorrentTestScreen } from '../screens/TorrentTestScreen'
import { useAppStateStore } from '../store/appStateStore'

export const AppView = (): React.JSX.Element => {
  const { booting, errorMessage, infoMessage, isConfigured, onboardingActive } = useAppStateStore()
  const location = useLocation()
  const onboardingMode = onboardingActive && location.pathname === '/setup'

  useGamepadNavigation()

  if (booting) {
    return <BootScreen />
  }

  if (onboardingActive && location.pathname !== '/setup') {
    return <Navigate replace to="/setup" />
  }

  return (
    <main className="grid p-8 content-start gap-6 grid-rows-[auto_min-content] min-h-screen">
      {!onboardingMode ? <AppHeader /> : null}

      {onboardingMode ? (
        <div className="grid min-h-[calc(100vh-6rem)] content-center">
          <Routes>
            <Route path="/setup" element={<SetupScreen onboardingMode />} />
            <Route path="*" element={<Navigate replace to="/setup" />} />
          </Routes>
        </div>
      ) : (
        <Routes>
          <Route path="/setup" element={<SetupScreen onboardingMode={false} />} />
          <Route
            path="/downloads"
            element={!isConfigured ? <Navigate replace to="/setup" /> : <DownloadsScreen />}
          />
          <Route
            path="/search"
            element={!isConfigured ? <Navigate replace to="/setup" /> : <SearchScreen />}
          />
          <Route
            path="/torrents"
            element={!isConfigured ? <Navigate replace to="/setup" /> : <TorrentTestScreen />}
          />
          <Route
            path="/"
            element={!isConfigured ? <Navigate replace to="/setup" /> : <PlatformsScreen />}
          />
          <Route
            path="/platform/:platformId"
            element={!isConfigured ? <Navigate replace to="/setup" /> : <GamesScreen />}
          />
          <Route path="*" element={<Navigate replace to={isConfigured ? '/' : '/setup'} />} />
        </Routes>
      )}

      <GameModal />
      <DeleteConfirmModal />
      <BulkDeleteConfirmModal />
      <QuitConfirmModal />
      <KeyboardModal />

      {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
      {infoMessage ? <p className="info-banner">{infoMessage}</p> : null}
    </main>
  )
}
