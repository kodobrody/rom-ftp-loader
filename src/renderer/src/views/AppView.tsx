import { useGamepadNavigation } from '@renderer/hooks/useGamepadNavigation'
import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
import { useAppStateStore } from '../store/appStateStore'

export const AppView = (): React.JSX.Element => {
  const { booting, errorMessage, infoMessage, isConfigured } = useAppStateStore()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (booting || isConfigured) {
      return
    }

    if (location.pathname !== '/setup') {
      navigate('/setup', { replace: true })
    }
  }, [booting, isConfigured, location.pathname, navigate])

  useGamepadNavigation();

  if (booting) {
    return <BootScreen />
  }

  return (
    <main className="grid p-8 content-start gap-6 grid-rows-[auto_min-content] min-h-screen">
      <AppHeader />

      <Routes>
        <Route path="/setup" element={<SetupScreen />} />
        <Route
          path="/downloads"
          element={
            !isConfigured ? (
              <Navigate replace to="/setup" />
            ) : (
              <DownloadsScreen />
            )
          }
        />
        <Route
          path="/search"
          element={
            !isConfigured ? (
              <Navigate replace to="/setup" />
            ) : (
              <SearchScreen />
            )
          }
        />
        <Route
          path="/"
          element={
            !isConfigured ? (
              <Navigate replace to="/setup" />
            ) : (
              <PlatformsScreen />
            )
          }
        />
        <Route
          path="/platform/:platformId"
          element={
            !isConfigured ? (
              <Navigate replace to="/setup" />
            ) : (
              <GamesScreen />
            )
          }
        />
        <Route path="*" element={<Navigate replace to={isConfigured ? '/' : '/setup'} />} />
      </Routes>

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