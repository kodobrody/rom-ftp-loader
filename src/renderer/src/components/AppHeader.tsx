import { faGear, faRightFromBracket } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Chip, ProgressCircle } from '@heroui/react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStateStore } from '../store/appStateStore'
import { useLibraryStore } from '../store/libraryStore'
import { useQuitConfirmModalStore } from '../store/modals/quitConfirmModalStore'
import { useTorrentStore } from '../store/torrentStore'

export const AppHeader = (): React.JSX.Element | null => {
  const { isConfigured } = useAppStateStore()
  const {
    games,
    metadataFetchInProgress,
    metadataFetchPlatformSourceName,
    selectedPlatform,
    visiblePlatforms
  } = useLibraryStore()
  const {
    selectedPlatform: torrentSelectedPlatform,
    games: torrentGames,
    metadataFetchInProgress: torrentMetadataFetchInProgress,
    metadataFetchPlatformSourceName: torrentMetadataFetchPlatformSourceName,
    platforms: torrentPlatforms,
    browserSnapshot
  } = useTorrentStore()
  const { openQuitConfirmModal } = useQuitConfirmModalStore()
  const location = useLocation()
  const navigate = useNavigate()
  const pathname = location.pathname
  const showSetup = location.pathname === '/setup'
  const isLibraryRoute = pathname === '/'
  const isTorrentRoute = pathname.startsWith('/torrents')

  const title = showSetup
    ? ''
    : pathname === '/search'
      ? 'Search'
      : pathname === '/torrents/search'
        ? 'Torrent Search'
        : pathname === '/downloads'
          ? 'Downloads'
          : isTorrentRoute
            ? torrentSelectedPlatform
              ? torrentSelectedPlatform.displayName
              : 'STOREnt'
            : selectedPlatform
              ? selectedPlatform.name
              : 'Platforms'

  const downloadedGames = games.filter((game) => game.downloaded).length
  const gamesWithCover = games.filter((game) => Boolean(game.coverUrl)).length
  const metadataFetchProgress =
    games.length > 0 ? Math.min(100, Math.round((gamesWithCover / games.length) * 100)) : 0
  const torrentGamesWithCover = torrentGames.filter((g) => Boolean(g.coverUrl)).length
  const torrentMetadataFetchProgress =
    torrentGames.length > 0
      ? Math.min(100, Math.round((torrentGamesWithCover / torrentGames.length) * 100))
      : 0
  const remoteGames = visiblePlatforms.reduce((sum, platform) => sum + platform.remoteGameCount, 0)
  const downloadedPlatformGames = visiblePlatforms.reduce(
    (sum, platform) => sum + platform.downloadedGameCount,
    0
  )

  if (showSetup || !isConfigured) {
    return null
  }

  return (
    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold text-zinc-100">{title}</h1>
          {selectedPlatform &&
          metadataFetchInProgress &&
          metadataFetchPlatformSourceName === selectedPlatform.sourceName ? (
            <Chip color="default" size="md" variant="soft">
              <ProgressCircle
                aria-label="Fetching metadata"
                size="sm"
                color="default"
                value={metadataFetchProgress}
              >
                <ProgressCircle.Track>
                  <ProgressCircle.TrackCircle />
                  <ProgressCircle.FillCircle />
                </ProgressCircle.Track>
              </ProgressCircle>
              <span>Fetching metadata</span>
            </Chip>
          ) : null}
          {torrentSelectedPlatform &&
          torrentMetadataFetchInProgress &&
          torrentMetadataFetchPlatformSourceName === torrentSelectedPlatform.sourceName ? (
            <Chip color="default" size="md" variant="soft">
              <ProgressCircle
                aria-label="Fetching metadata"
                size="sm"
                color="default"
                value={torrentMetadataFetchProgress}
              >
                <ProgressCircle.Track>
                  <ProgressCircle.TrackCircle />
                  <ProgressCircle.FillCircle />
                </ProgressCircle.Track>
              </ProgressCircle>
              <span>Fetching metadata</span>
            </Chip>
          ) : null}
        </div>
        {selectedPlatform && !isTorrentRoute ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <Chip color="default" size="md" variant="soft">
              {games.length} total
            </Chip>
            <Chip color="success" size="md" variant="soft">
              {downloadedGames} downloaded
            </Chip>
          </div>
        ) : torrentSelectedPlatform && isTorrentRoute ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <Chip color="default" size="md" variant="soft">
              {torrentGames.length} games
            </Chip>
          </div>
        ) : pathname === '/torrents' ? (
          <div className="mt-3 flex flex-wrap gap-3">
            <Chip color="default" size="md" variant="soft">
              {torrentPlatforms.length} platforms
            </Chip>
            <Chip color="default" size="md" variant="soft">
              {browserSnapshot.files.length} files indexed
            </Chip>
            {browserSnapshot.sourceErrors.length > 0 ? (
              <Chip color="warning" size="md" variant="soft">
                {browserSnapshot.sourceErrors.length} source
                {browserSnapshot.sourceErrors.length === 1 ? ' error' : ' errors'}
              </Chip>
            ) : null}
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
      </div>
    </div>
  )
}
