import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip, Modal } from '@heroui/react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDownloadsStore } from '../store/downloadsStore'
import { useTorrentStore } from '../store/torrentStore'
import { formatBytes } from '../utils/formatting'

export const DownloadsScreen = (): React.JSX.Element => {
  const { clearQueueHistory, clearableDownloadCount, downloadSnapshot } = useDownloadsStore()
  const {
    downloadSnapshot: torrentSnapshot,
    cancelTorrentDownload,
    clearTorrentHistory
  } = useTorrentStore()
  const navigate = useNavigate()
  const [pendingCancelId, setPendingCancelId] = useState<string | null>(null)

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
              {torrentSnapshot.items.map((item) => {
                const isActive =
                  item.status === 'queued' ||
                  item.status === 'downloading' ||
                  item.status === 'extracting'
                return (
                  <div className="grid gap-3 rounded-xl bg-white/5 p-3" key={item.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid gap-1 min-w-0">
                        <div className="flex items-center gap-2">
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
                            size="sm"
                            variant="soft"
                          >
                            {item.status}
                          </Chip>
                          <strong className="text-zinc-100">{item.fileName}</strong>
                        </div>
                        <span className="text-sm text-zinc-400">
                          {item.platformName} · {item.torrentLabel}
                        </span>
                        <span className="text-xs text-zinc-500">
                          {formatBytes(item.bytesTransferred)} / {formatBytes(item.totalBytes)}
                        </span>
                      </div>
                      <div className="grid justify-items-end gap-2 text-sm shrink-0">
                        <span className="text-zinc-300">{item.progress}%</span>
                        {isActive ? (
                          <Button
                            className="px-2"
                            onPress={() => setPendingCancelId(item.torrentFileId)}
                            size="sm"
                            variant="danger"
                          >
                            Cancel
                          </Button>
                        ) : null}
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
                )
              })}
            </div>
          </Card.Content>
        </Card>
      ) : null}

      {totalItems === 0 ? (
        <Card>
          <Card.Content className="text-center">No downloads yet.</Card.Content>
        </Card>
      ) : null}

      <Modal.Backdrop
        isOpen={pendingCancelId !== null}
        onOpenChange={() => setPendingCancelId(null)}
        inert={undefined}
      >
        <Modal.Container>
          <Modal.Dialog
            className="w-full max-w-xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <Modal.Header>
              <Modal.Heading>Cancel download?</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-zinc-300">
                The in-progress download will be stopped and any partial data will be discarded.
              </p>
              {pendingCancelId !== null ? (
                <p className="break-all text-sm text-zinc-400">
                  {torrentSnapshot.items.find((i) => i.torrentFileId === pendingCancelId)?.fileName}
                </p>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={() => setPendingCancelId(null)} variant="tertiary">
                Keep downloading
              </Button>
              <Button
                autoFocus
                onPress={() => {
                  const id = pendingCancelId
                  setPendingCancelId(null)
                  if (id !== null) void cancelTorrentDownload(id)
                }}
                variant="danger"
              >
                Cancel download
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </section>
  )
}
