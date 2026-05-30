import { faArrowLeft, faGear, faRightFromBracket } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip } from '@heroui/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStateStore } from '../store/appStateStore'
import { useLibraryStore } from '../store/libraryStore'
import { useQuitConfirmModalStore } from '../store/modals/quitConfirmModalStore'

export const AppHeader = (): React.JSX.Element => {
  const { isConfigured } = useAppStateStore()
  const { games, selectedPlatform, visiblePlatforms } = useLibraryStore()
  const { openQuitConfirmModal } = useQuitConfirmModalStore()
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = location.pathname
  const showSetup = location.pathname === '/setup'
  const isLibraryRoute = pathname === '/'

  const title = showSetup
    ? 'Setup'
    : pathname === '/search'
      ? 'Search'
      : pathname === '/downloads'
        ? 'Downloads'
        : selectedPlatform
          ? selectedPlatform.name
          : 'Platforms'

  const downloadedGames = games.filter((game) => game.downloaded).length
  const remoteGames = visiblePlatforms.reduce((sum, platform) => sum + platform.remoteGameCount, 0)
  const downloadedPlatformGames = visiblePlatforms.reduce(
    (sum, platform) => sum + platform.downloadedGameCount,
    0
  )

  return (
    <Card>
      <Card.Content className="grid gap-4 rounded-2xl backdrop-blur md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-zinc-100">{title}</h1>
          {selectedPlatform ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <Chip color="default" size="md" variant="soft">
                {games.length} total
              </Chip>
              <Chip color="success" size="md" variant="soft">
                {downloadedGames} downloaded
              </Chip>
            </div>
          ) : !showSetup && isLibraryRoute ? (
            <div className="mt-3 flex flex-wrap gap-3">
              <Chip color="default" size="md" variant="soft">
                {visiblePlatforms.length} platforms
              </Chip>
              <Chip color="accent" size="md" variant="soft">
                {remoteGames} remote games
              </Chip>
              <Chip color="success" size="md" variant="soft">
                {downloadedPlatformGames} downloaded locally
              </Chip>
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3 md:justify-self-end">
          {isConfigured && !showSetup && !selectedPlatform && isLibraryRoute ? (
            <>
              <Button onPress={() => navigate('/setup')} variant="tertiary">
                <FontAwesomeIcon icon={faGear} />
                Settings
              </Button>
              <Button onPress={openQuitConfirmModal} variant="danger">
                <FontAwesomeIcon icon={faRightFromBracket} />
                Quit
              </Button>
            </>
          ) : null}
          {isConfigured && showSetup ? (
            <Button onPress={() => navigate('/')} variant="primary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Continue to library
            </Button>
          ) : null}
        </div>
      </Card.Content>
    </Card>
  )
}