import { faArrowLeft, faFolder, faMagnifyingGlass } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, ProgressCircle } from '@heroui/react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTorrentStore } from '../store/torrentStore'

export const TorrentPlatformsScreen = (): React.JSX.Element => {
  const navigate = useNavigate()
  const { platforms, browserLoading, browserSnapshot, ensureBrowserState } = useTorrentStore()

  useEffect(() => {
    void ensureBrowserState()
  }, [ensureBrowserState])

  return (
    <section className="library-layout grid gap-4">
      <Card className="overflow-visible">
        <Card.Content className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Button onPress={() => navigate('/')} variant="tertiary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to library
            </Button>
          </div>
          <div className="flex items-center gap-2">
            {platforms.length > 0 ? (
              <Button onPress={() => navigate('/torrents/search')} variant="tertiary">
                <FontAwesomeIcon icon={faMagnifyingGlass} />
                Search
              </Button>
            ) : null}
            {browserLoading ? (
              <ProgressCircle aria-label="Loading torrent data" isIndeterminate size="sm" />
            ) : null}
          </div>
        </Card.Content>
      </Card>

      {browserSnapshot.sourceErrors.length > 0 ? (
        <Card>
          <Card.Content className="grid gap-2">
            {browserSnapshot.sourceErrors.map((err) => (
              <p
                className="rounded-lg bg-amber-500/10 p-3 text-sm text-amber-100"
                key={err.torrentId}
              >
                {err.message}
              </p>
            ))}
          </Card.Content>
        </Card>
      ) : null}

      {browserLoading && platforms.length === 0 ? (
        <Card>
          <Card.Content className="text-center">Loading torrent platforms...</Card.Content>
        </Card>
      ) : platforms.length === 0 ? (
        <Card>
          <Card.Content className="text-center">
            No torrent sources configured, or no matching files found. Add a torrent source in
            Setup.
          </Card.Content>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 3xl:grid-cols-8">
          {platforms.map((platform) => (
            <Button
              className="flex h-40 w-full flex-col items-center justify-center gap-0 text-left transition"
              key={platform.id}
              onClick={() => navigate(`/torrents/platform/${encodeURIComponent(platform.id)}`)}
              variant="tertiary"
            >
              <FontAwesomeIcon className="mb-4 text-6xl text-blue-300" icon={faFolder} />
              <span className="whitespace-normal text-center text-zinc-400">
                {platform.displayName}
              </span>
              <span className="text-zinc-400">{platform.fileCount} files</span>
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
