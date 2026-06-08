import { faArrowLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip } from '@heroui/react'
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTorrentStore } from '../store/torrentStore'
import { formatBytes } from '../utils/formatting'

const getDownloadLabel = (status: string): string => {
  if (status === 'completed') {
    return 'Downloaded'
  }

  if (status === 'downloading') {
    return 'Downloading...'
  }

  if (status === 'queued') {
    return 'Queued'
  }

  return 'Download file'
}

export const TorrentTestScreen = (): React.JSX.Element => {
  const navigate = useNavigate()
  const {
    browserLoading,
    browserSnapshot,
    downloadFile,
    downloadSnapshot,
    hydrateDownloadSnapshot,
    refreshBrowserState
  } = useTorrentStore()

  useEffect(() => {
    console.log('[TORRENT] TorrentTestScreen mount refresh')
    void hydrateDownloadSnapshot()
    void refreshBrowserState()
  }, [hydrateDownloadSnapshot, refreshBrowserState])

  return (
    <section className="library-layout grid gap-4">
      <div className="flex flex-wrap gap-3">
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
          {browserLoading ? 'Refreshing...' : 'Refresh torrent files'}
        </Button>
      </div>

      <Card>
        <Card.Content className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex flex-wrap gap-3">
            <Chip size="md" variant="soft">
              {browserSnapshot.files.length} files discovered
            </Chip>
            <Chip color={downloadSnapshot.active ? 'accent' : 'default'} size="md" variant="soft">
              {downloadSnapshot.active ? 'Torrent downloads running' : 'Torrent downloads idle'}
            </Chip>
            <Chip
              color={browserSnapshot.sourceErrors.length > 0 ? 'warning' : 'success'}
              size="md"
              variant="soft"
            >
              {browserSnapshot.sourceErrors.length} source issues
            </Chip>
          </div>
        </Card.Content>
      </Card>

      {downloadSnapshot.items.length > 0 ? (
        <Card>
          <Card.Content className="grid gap-4 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                  Torrent downloads
                </p>
                <h2 className="text-xl font-semibold text-zinc-100">Per-file progress</h2>
              </div>
            </div>

            <div className="grid gap-3">
              {downloadSnapshot.items.map((item) => (
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

      {browserSnapshot.sourceErrors.length > 0 ? (
        <Card>
          <Card.Content className="grid gap-3 p-4">
            <h2 className="text-lg font-semibold text-zinc-100">Source issues</h2>
            <div className="grid gap-2">
              {browserSnapshot.sourceErrors.map((sourceError) => (
                <div
                  className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-100"
                  key={sourceError.torrentId}
                >
                  {sourceError.message}
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
      ) : null}

      {browserSnapshot.files.length > 0 ? (
        <Card>
          <Card.Content className="grid max-h-[60vh] gap-3 overflow-auto p-4">
            {browserSnapshot.files.map((file) => {
              const downloadItem = downloadSnapshot.items.find(
                (item) => item.torrentFileId === file.id
              )
              const isBusy =
                downloadItem?.status === 'queued' || downloadItem?.status === 'downloading'

              return (
                <div
                  className="grid gap-3 rounded-xl bg-white/5 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  key={file.id}
                >
                  <div className="grid gap-2 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="truncate text-zinc-100">{file.romName}</strong>
                      <Chip size="sm" variant="soft">
                        {formatBytes(file.size)}
                      </Chip>
                      <Chip
                        color={
                          file.matchConfidence === 'exact'
                            ? 'success'
                            : file.matchConfidence === 'fuzzy'
                              ? 'warning'
                              : 'default'
                        }
                        size="sm"
                        variant="soft"
                      >
                        {file.matchConfidence}
                      </Chip>
                    </div>
                    <p className="text-sm text-zinc-300">
                      {file.platformName} to {file.matchedPlatformName}
                    </p>
                    <p className="text-sm text-zinc-400">
                      {file.releaseGroupName} · {file.torrentLabel}
                    </p>
                    <p className="truncate text-xs text-zinc-500">{file.relativePath}</p>
                  </div>
                  <Button
                    isDisabled={isBusy}
                    onPress={() => {
                      void downloadFile(file.id)
                    }}
                    variant={downloadItem?.status === 'completed' ? 'secondary' : 'primary'}
                  >
                    {getDownloadLabel(downloadItem?.status ?? 'idle')}
                  </Button>
                </div>
              )
            })}
          </Card.Content>
        </Card>
      ) : (
        <Card>
          <Card.Content className="grid min-h-40 place-items-center p-4 text-center text-zinc-400">
            {browserLoading
              ? 'Reading torrent metadata...'
              : 'No torrent files available yet. Add a magnet or .torrent file in settings.'}
          </Card.Content>
        </Card>
      )}
    </section>
  )
}
