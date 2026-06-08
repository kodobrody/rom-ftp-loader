import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card } from '@heroui/react'
import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { TorrentGameModal } from '../components/modals/TorrentGameModal'
import { useTorrentStore } from '../store/torrentStore'
import { formatBytes } from '../utils/formatting'

export const TorrentGamesScreen = (): React.JSX.Element => {
  const navigate = useNavigate()
  const { platformId } = useParams<{ platformId: string }>()
  const {
    gamesLoading,
    games,
    downloadSnapshot,
    openPlatform,
    backToPlatforms,
    openTorrentGame,
    platforms
  } = useTorrentStore()

  useEffect(() => {
    if (!platformId) {
      return
    }

    const platform = platforms.find((p) => p.id === platformId)

    if (platform) {
      void openPlatform(platform)
    }

    return () => {
      backToPlatforms()
    }
  }, [platformId, platforms, openPlatform, backToPlatforms])

  const getStatusForGame = (gameId: string) => {
    const game = games.find((g) => g.id === gameId)
    if (!game) return null

    for (const file of game.files) {
      const item = downloadSnapshot.items.find((i) => i.torrentFileId === file.entryId)
      if (item) return item
    }

    return null
  }

  return (
    <section className="library-layout grid gap-4">
      <Card>
        <Card.Content className="flex flex-row flex-wrap items-center gap-3">
          <Button onPress={() => navigate('/torrents')} variant="tertiary">
            <FontAwesomeIcon icon={faArrowLeft} />
            Back to platforms
          </Button>
          <Button onPress={() => navigate('/downloads')} variant="tertiary">
            Downloads
          </Button>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="grid gap-4">
          {gamesLoading ? (
            <p className="rounded-xl bg-white/5 p-6 text-center text-zinc-400">Loading games...</p>
          ) : games.length === 0 ? (
            <p className="rounded-xl bg-white/5 p-6 text-center text-zinc-400">
              No games found for this platform.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 3xl:grid-cols-8">
              {games.map((game) => {
                const downloadItem = getStatusForGame(game.id)
                const isBusy =
                  downloadItem?.status === 'queued' ||
                  downloadItem?.status === 'downloading' ||
                  downloadItem?.status === 'extracting'
                const isCompleted = game.files.every((f) =>
                  downloadSnapshot.items.some(
                    (i) => i.torrentFileId === f.entryId && i.status === 'completed'
                  )
                )
                const bottomStatusLabel = downloadItem
                  ? downloadItem.status === 'completed'
                    ? 'Downloaded'
                    : `${downloadItem.status} ${downloadItem.status === 'downloading' ? `${downloadItem.progress}%` : ''}`
                  : isCompleted
                    ? 'Downloaded'
                    : null

                return (
                  <button
                    className={`relative flex flex-col overflow-hidden rounded-xl bg-white/5 p-2 text-left transition hover:bg-white/10 ${isBusy ? 'ring-1 ring-sky-300/40' : ''}`}
                    disabled={false}
                    key={game.id}
                    onClick={() => openTorrentGame(game)}
                    type="button"
                  >
                    <span className="absolute right-2 top-2 z-10 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-zinc-100">
                      {(() => {
                        const sizes = game.files.map((f) => f.size)
                        const min = Math.min(...sizes)
                        const max = Math.max(...sizes)
                        return sizes.length > 1 && min !== max
                          ? `${formatBytes(min)} – ${formatBytes(max)}`
                          : formatBytes(min)
                      })()}
                    </span>

                    {game.files.length > 1 ? (
                      <span className="absolute left-2 top-2 z-10 rounded-full bg-blue-600/80 px-2 py-0.5 text-xs font-semibold text-white">
                        {game.files.length} releases
                      </span>
                    ) : null}

                    <div className="-mx-2 -mt-2 grid aspect-3/4 place-items-center overflow-hidden bg-black/25">
                      {game.coverUrl ? (
                        <img
                          alt={game.displayName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          src={game.coverUrl}
                        />
                      ) : (
                        <div className="text-xs text-zinc-500">No cover</div>
                      )}
                    </div>

                    <div className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1">
                      <strong className="line-clamp-2 block max-h-8 text-center text-sm leading-4 text-zinc-100">
                        {game.displayName}
                      </strong>
                    </div>

                    <div
                      className={`-mx-2 -mb-2 mt-auto flex h-8 items-center justify-center px-3 text-center text-xs font-semibold uppercase tracking-[0.08em] ${bottomStatusLabel ? 'text-white' : 'text-transparent'} ${
                        bottomStatusLabel
                          ? downloadItem && downloadItem.status !== 'completed'
                            ? 'bg-sky-600'
                            : 'bg-emerald-600'
                          : 'bg-transparent'
                      }`}
                    >
                      {bottomStatusLabel ?? ''}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Card.Content>
      </Card>

      <TorrentGameModal />
    </section>
  )
}
