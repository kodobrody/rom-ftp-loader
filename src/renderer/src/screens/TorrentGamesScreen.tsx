import { faArrowLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip, Modal } from '@heroui/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import type { TorrentGameGroup } from '../../../shared/types'
import { useTorrentStore } from '../store/torrentStore'
import { formatBytes } from '../utils/formatting'

export const TorrentGamesScreen = (): React.JSX.Element => {
  const navigate = useNavigate()
  const { platformId } = useParams<{ platformId: string }>()
  const gamesLoading = useTorrentStore((store) => store.gamesLoading)
  const games = useTorrentStore((store) => store.games)
  const downloadSnapshot = useTorrentStore((store) => store.downloadSnapshot)
  const loadGames = useTorrentStore((store) => store.loadGames)
  const fetchGameMetadata = useTorrentStore((store) => store.fetchGameMetadata)
  const queueDownload = useTorrentStore((store) => store.queueDownload)

  const [selectedGame, setSelectedGame] = useState<TorrentGameGroup | null>(null)

  useEffect(() => {
    if (!platformId) {
      return
    }

    void loadGames(platformId)
  }, [platformId, loadGames])

  useEffect(() => {
    if (games.length === 0 || !platformId) {
      return
    }

    const gamesNeedingMetadata = games.filter((g) => g.metadataStatus === 'missing')

    if (gamesNeedingMetadata.length === 0) {
      return
    }

    void fetchGameMetadata(platformId, gamesNeedingMetadata)
  }, [games, platformId, fetchGameMetadata])

  const getStatusForGame = (game: TorrentGameGroup) => {
    for (const file of game.files) {
      const item = downloadSnapshot.items.find((i) => i.torrentFileId === file.entryId)

      if (item) {
        return item
      }
    }

    return null
  }

  const handleGameClick = (game: TorrentGameGroup) => {
    if (game.files.length === 1) {
      void queueDownload(game.files[0].entryId)
      return
    }

    setSelectedGame(game)
  }

  return (
    <section className="library-layout grid gap-4">
      <Card>
        <Card.Content className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex flex-wrap gap-3">
            <Chip size="md" variant="soft">
              {games.length} games
            </Chip>
          </div>
          <div className="flex flex-wrap justify-end gap-3">
            <Button onPress={() => navigate('/torrents')} variant="tertiary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to platforms
            </Button>
            {platformId ? (
              <Button
                isDisabled={gamesLoading}
                onPress={() => void loadGames(platformId)}
                variant="tertiary"
              >
                <FontAwesomeIcon icon={faRotateRight} />
                Reload
              </Button>
            ) : null}
          </div>
        </Card.Content>
      </Card>

      {gamesLoading ? (
        <Card>
          <Card.Content className="grid min-h-40 place-items-center p-4 text-center text-zinc-400">
            Loading games...
          </Card.Content>
        </Card>
      ) : games.length === 0 ? (
        <Card>
          <Card.Content className="grid min-h-40 place-items-center p-4 text-center text-zinc-400">
            No games found for this platform.
          </Card.Content>
        </Card>
      ) : (
        <div className="grid max-h-[72vh] gap-3 overflow-auto pr-1 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((game) => {
            const downloadItem = getStatusForGame(game)
            const isBusy =
              downloadItem?.status === 'queued' ||
              downloadItem?.status === 'downloading' ||
              downloadItem?.status === 'extracting'

            return (
              <button
                className="flex flex-col gap-2 rounded-xl bg-white/5 p-3 text-left transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isBusy}
                key={game.id}
                onClick={() => handleGameClick(game)}
                type="button"
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-16 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-black/30 text-[10px] text-zinc-500">
                    {game.coverUrl ? (
                      <img
                        alt={game.displayName}
                        className="h-full w-full object-cover"
                        src={game.coverUrl}
                      />
                    ) : (
                      'No cover'
                    )}
                  </div>
                  <div className="min-w-0">
                    <strong className="block truncate text-sm text-zinc-100">
                      {game.displayName}
                    </strong>
                    <span className="block text-xs text-zinc-400">
                      {game.files.length > 1
                        ? `${game.files.length} release groups`
                        : game.files[0].releaseGroupName}
                    </span>
                    {downloadItem ? (
                      <span
                        className={`mt-1 block text-xs font-semibold ${
                          downloadItem.status === 'completed'
                            ? 'text-emerald-400'
                            : downloadItem.status === 'error'
                              ? 'text-rose-400'
                              : 'text-cyan-400'
                        }`}
                      >
                        {downloadItem.status === 'extracting'
                          ? 'Extracting...'
                          : downloadItem.status === 'downloading'
                            ? `${downloadItem.progress}%`
                            : downloadItem.status}
                      </span>
                    ) : (
                      <span className="mt-1 block text-xs text-zinc-500">
                        {formatBytes(game.files.reduce((sum, f) => sum + f.size, 0))}
                      </span>
                    )}
                  </div>
                </div>

                {downloadItem && ['downloading', 'extracting'].includes(downloadItem.status) ? (
                  <div className="h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-linear-to-r from-blue-400 to-cyan-400 transition-all"
                      style={{
                        width:
                          downloadItem.status === 'extracting'
                            ? '100%'
                            : `${downloadItem.progress}%`
                      }}
                    />
                  </div>
                ) : null}
              </button>
            )
          })}
        </div>
      )}

      <Modal.Backdrop
        isOpen={Boolean(selectedGame)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) {
            setSelectedGame(null)
          }
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-2xl">
            <Modal.Header>
              <Modal.Heading>{selectedGame?.displayName ?? ''}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="grid gap-3 p-4">
              <p className="text-sm text-zinc-400">Choose a release group to download from</p>
              {selectedGame?.files.map((file) => {
                const downloadItem = downloadSnapshot.items.find(
                  (i) => i.torrentFileId === file.entryId
                )
                const isBusy =
                  downloadItem?.status === 'queued' ||
                  downloadItem?.status === 'downloading' ||
                  downloadItem?.status === 'extracting'

                return (
                  <div
                    className="grid gap-2 rounded-xl bg-white/5 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                    key={file.entryId}
                  >
                    <div>
                      <strong className="block truncate text-zinc-100">
                        {file.releaseGroupName}
                      </strong>
                      <span className="block truncate text-xs text-zinc-400">{file.fileName}</span>
                      <span className="block text-xs text-zinc-500">{formatBytes(file.size)}</span>
                      {downloadItem ? (
                        <span
                          className={`mt-1 block text-xs font-semibold ${
                            downloadItem.status === 'completed'
                              ? 'text-emerald-400'
                              : downloadItem.status === 'error'
                                ? 'text-rose-400'
                                : 'text-cyan-400'
                          }`}
                        >
                          {downloadItem.status === 'extracting'
                            ? 'Extracting...'
                            : downloadItem.status === 'downloading'
                              ? `${downloadItem.progress}%`
                              : downloadItem.status}
                        </span>
                      ) : null}
                    </div>
                    <Button
                      isDisabled={isBusy || downloadItem?.status === 'completed'}
                      onPress={() => {
                        void queueDownload(file.entryId)
                        setSelectedGame(null)
                      }}
                      variant={downloadItem?.status === 'completed' ? 'secondary' : 'primary'}
                    >
                      {downloadItem?.status === 'completed'
                        ? 'Downloaded'
                        : isBusy
                          ? 'Downloading...'
                          : `Download from ${file.releaseGroupName}`}
                    </Button>
                  </div>
                )
              })}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </section>
  )
}
