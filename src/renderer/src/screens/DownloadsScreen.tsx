import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip } from '@heroui/react'
import { useNavigate } from 'react-router-dom'
import { useDownloadsStore } from '../store/downloadsStore'
import { useTorrentStore } from '../store/torrentStore'
import { formatBytes } from '../utils/formatting'

export const DownloadsScreen = (): React.JSX.Element => {
  const { clearQueueHistory, clearableDownloadCount, downloadSnapshot } = useDownloadsStore()
  const { downloadSnapshot: torrentSnapshot, setDownloadSnapshot: setTorrentSnapshot } =
    useTorrentStore()
  const navigate = useNavigate()

  const clearTorrentHistory = async (): Promise<void> => {
    const cleared = torrentSnapshot.items.filter((item) =>
      ['queued', 'downloading', 'extracting'].includes(item.status)
    )
    setTorrentSnapshot({
      active: cleared.some((i) => ['queued', 'downloading', 'extracting'].includes(i.status)),
      items: cleared
    })
  }

  const clearableTorrentCount = torrentSnapshot.items.filter(
    (item) => !['queued', 'downloading', 'extracting'].includes(item.status)
  ).length

  const totalItems = downloadSnapshot.items.length + torrentSnapshot.items.length
  const isAnyActive = downloadSnapshot.active || torrentSnapshot.active

  return (
    <section className="library-layout grid gap-4">
      <Card>
        <Card.Content className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex flex-wrap gap-3">
            <Chip size="md" variant="soft">
              {totalItems} items in history
            </Chip>
            <Chip color={isAnyActive ? 'accent' : 'default'} size="md" variant="soft">
              {isAnyActive ? 'Downloads running' : 'Queue idle'}
            </Chip>
          </div>
          <div className="flex flex-wrap justify-end gap-3 md:justify-self-end">
            <Button autoFocus onPress={() => navigate('/')} variant="tertiary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to library
            </Button>
          </div>
        </Card.Content>
      </Card>

      {/* Classic library downloads */}
      {downloadSnapshot.items.length > 0 ? (
        <Card>
          <Card.Content className="grid gap-4 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Library downloads
                </p>
                <h2 className="text-xl font-semibold text-zinc-100">
                  {downloadSnapshot.active ? 'Queue running' : 'Last queue summary'}
                </h2>
              </div>
              <div className="flex items-center gap-3">
                <strong className="text-2xl text-zinc-100">
                  {downloadSnapshot.overallProgress}%
                </strong>
                <Button
                  isDisabled={clearableDownloadCount === 0}
                  onPress={() => void clearQueueHistory()}
                  variant="tertiary"
                >
                  Clear ({clearableDownloadCount})
                </Button>
              </div>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-linear-to-r from-blue-400 to-cyan-400 transition-all"
                style={{ width: `${downloadSnapshot.overallProgress}%` }}
              />
            </div>
            <div className="grid max-h-[40vh] gap-3 overflow-auto pr-1">
              {downloadSnapshot.items.map((item) => (
                <div className="grid gap-3 rounded-xl bg-white/5 p-3" key={item.gameId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <strong className="text-zinc-100">{item.gameName}</strong>
                      <span className="text-sm text-zinc-400">
                        {item.platformName} · {formatBytes(item.bytesTransferred)} /{' '}
                        {formatBytes(item.totalBytes)}
                      </span>
                    </div>
                    <div className="grid justify-items-end gap-1 text-sm">
                      <Chip
                        color={
                          item.status === 'completed'
                            ? 'success'
                            : item.status === 'error'
                              ? 'danger'
                              : item.status === 'downloading'
                                ? 'accent'
                                : 'warning'
                        }
                        size="md"
                        variant="soft"
                      >
                        {item.status}
                      </Chip>
                      <span className="text-zinc-300">{item.progress}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-linear-to-r from-blue-400 to-cyan-400 transition-all"
                      style={{ width: `${item.progress}%` }}
                    />
                  </div>
                  {item.error ? <p className="text-sm text-rose-300">{item.error}</p> : null}
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
      ) : null}

      {/* Torrent downloads */}
      {torrentSnapshot.items.length > 0 ? (
        <Card>
          <Card.Content className="grid gap-4 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Torrent downloads
                </p>
                <h2 className="text-xl font-semibold text-zinc-100">
                  {torrentSnapshot.active ? 'Downloading' : 'Completed'}
                </h2>
              </div>
              <Button
                isDisabled={clearableTorrentCount === 0}
                onPress={() => void clearTorrentHistory()}
                variant="tertiary"
              >
                Clear ({clearableTorrentCount})
              </Button>
            </div>
            <div className="grid max-h-[40vh] gap-3 overflow-auto pr-1">
              {torrentSnapshot.items.map((item) => (
                <div className="grid gap-3 rounded-xl bg-white/5 p-3" key={item.id}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <strong className="text-zinc-100">{item.fileName}</strong>
                      <span className="text-sm text-zinc-400">
                        {item.platformName} · {item.torrentLabel}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {formatBytes(item.bytesTransferred)} / {formatBytes(item.totalBytes)}
                      </span>
                    </div>
                    <div className="grid justify-items-end gap-1 text-sm">
                      <Chip
                        color={
                          item.status === 'completed'
                            ? 'success'
                            : item.status === 'error'
                              ? 'danger'
                              : item.status === 'downloading' || item.status === 'extracting'
                                ? 'accent'
                                : 'warning'
                        }
                        size="md"
                        variant="soft"
                      >
                        {item.status}
                      </Chip>
                      <span className="text-zinc-300">{item.progress}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full bg-linear-to-r from-blue-400 to-cyan-400 transition-all"
                      style={{
                        width: item.status === 'extracting' ? '100%' : `${item.progress}%`
                      }}
                    />
                  </div>
                  {item.error ? <p className="text-sm text-rose-300">{item.error}</p> : null}
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
      ) : null}

      {totalItems === 0 ? (
        <Card>
          <Card.Content className="text-center">No downloads yet.</Card.Content>
        </Card>
      ) : null}
    </section>
  )
}
