import { faSkullCrossbones } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button } from '@heroui/react'
import { useGamepadNavigation } from '@renderer/hooks/useGamepadNavigation'
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

  useGamepadNavigation()

  if (booting) {
    return <BootScreen />
  }

  if (!isConfigured && location.pathname !== '/setup') {
    return (
      <main className="grid min-h-screen place-items-center p-8">
        <div className="grid w-full max-w-xl justify-items-center gap-4 rounded-3xl p-8 text-center backdrop-blur">
          <div className="grid size-16 place-items-center rounded-full bg-rose-500/10 text-rose-300">
            <FontAwesomeIcon className="text-2xl" icon={faSkullCrossbones} />
          </div>
          <div className="grid gap-2">
            <h1 className="text-3xl font-semibold text-zinc-100">Invalid connection</h1>
            <p className="text-sm text-zinc-300">
              Go to settings to update connection credentials.
            </p>
          </div>
          <Button onPress={() => navigate('/setup')} variant="primary">
            Go to Settings
          </Button>
        </div>

        {errorMessage ? <p className="error-banner">{errorMessage}</p> : null}
        {infoMessage ? <p className="info-banner">{infoMessage}</p> : null}
      </main>
    )
  }

  return (
    <main className="grid p-8 content-start gap-6 grid-rows-[auto_min-content] min-h-screen">
      <AppHeader />

      <Routes>
        <Route path="/setup" element={<SetupScreen />} />
        <Route
          path="/downloads"
          element={!isConfigured ? <Navigate replace to="/setup" /> : <DownloadsScreen />}
        />
        <Route
          path="/search"
          element={!isConfigured ? <Navigate replace to="/setup" /> : <SearchScreen />}
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
