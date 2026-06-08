import { faArrowLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip } from '@heroui/react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTorrentStore } from '../store/torrentStore'

export const TorrentPlatformsScreen = (): React.JSX.Element => {
  const navigate = useNavigate()
  const browserLoading = useTorrentStore((store) => store.browserLoading)
  const platforms = useTorrentStore((store) => store.platforms)
  const ensureBrowserState = useTorrentStore((store) => store.ensureBrowserState)
  const refreshBrowserState = useTorrentStore((store) => store.refreshBrowserState)

  useEffect(() => {
    void ensureBrowserState()
  }, [ensureBrowserState])

  return (
    <section className="library-layout grid gap-4">
      <Card>
        <Card.Content className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex flex-wrap gap-3">
            <Chip size="md" variant="soft">
              {platforms.length} platforms
            </Chip>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button onPress={() => navigate('/')} variant="tertiary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to library
            </Button>
            <Button
              isDisabled={browserLoading}
              onPress={() => void refreshBrowserState()}
              variant="tertiary"
            >
              <FontAwesomeIcon icon={faRotateRight} />
              {browserLoading ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
        </Card.Content>
      </Card>

      {browserLoading && platforms.length === 0 ? (
        <Card>
          <Card.Content className="grid min-h-40 place-items-center p-4 text-center text-zinc-400">
            Reading torrent metadata...
          </Card.Content>
        </Card>
      ) : platforms.length === 0 ? (
        <Card>
          <Card.Content className="grid min-h-40 place-items-center p-4 text-center text-zinc-400">
            No torrent files matched the Minerva_Myrient structure. Add a torrent source in
            settings.
          </Card.Content>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {platforms.map((platform) => (
            <button
              className="grid gap-2 rounded-xl bg-white/5 p-4 text-left transition hover:bg-white/10"
              key={platform.id}
              onClick={() => navigate(`/torrents/platform/${platform.id}`)}
              type="button"
            >
              <strong className="text-lg text-zinc-100">{platform.displayName}</strong>
              <div className="flex flex-wrap gap-2">
                <Chip color="default" size="sm" variant="soft">
                  {platform.fileCount} files
                </Chip>
                {platform.releaseGroups.map((group) => (
                  <Chip color="accent" key={group} size="sm" variant="soft">
                    {group}
                  </Chip>
                ))}
              </div>
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
