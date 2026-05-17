import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip } from '@heroui/react'
import { useNavigate } from 'react-router-dom'
import { useDownloadsStore } from '../store/downloadsStore'
import { formatBytes } from '../utils/formatting'

export const DownloadsScreen = (): React.JSX.Element => {
  const { clearQueueHistory, clearableDownloadCount, downloadSnapshot } = useDownloadsStore()
  const navigate = useNavigate()

  return (
    <section className="library-layout grid gap-4">
      <Card>
        <Card.Content className="grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="flex flex-wrap gap-3">
            <Chip size="md" variant="soft">
              {downloadSnapshot.items.length} files in queue history
            </Chip>
            <Chip color={downloadSnapshot.active ? 'accent' : 'default'} size="md" variant="soft">
              {downloadSnapshot.active ? 'Queue running' : 'Queue idle'}
            </Chip>
          </div>
          <div className="flex flex-wrap justify-end gap-3 md:justify-self-end">
            <Button autoFocus onPress={() => navigate('/')} variant="tertiary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to library
            </Button>
            <Button
              isDisabled={clearableDownloadCount === 0}
              onPress={() => void clearQueueHistory()}
              variant="tertiary"
            >
              Clear queue history ({clearableDownloadCount})
            </Button>
          </div>
        </Card.Content>
      </Card>

      {downloadSnapshot.items.length > 0 ? (
        <Card>
          <Card.Content className="grid gap-4 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Download progress</p>
                <h2 className="text-xl font-semibold text-zinc-100">
                  {downloadSnapshot.active ? 'Queue running' : 'Last queue summary'}
                </h2>
              </div>
              <strong className="text-2xl text-zinc-100">{downloadSnapshot.overallProgress}%</strong>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-linear-to-r from-blue-400 to-cyan-400 transition-all"
                style={{ width: `${downloadSnapshot.overallProgress}%` }}
              />
            </div>

            <div className="grid max-h-[54vh] gap-3 overflow-auto pr-1">
              {downloadSnapshot.items.map((item) => (
                <div className="grid gap-3 rounded-xl bg-white/5 p-3" key={item.gameId}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid gap-1">
                      <strong className="text-zinc-100">{item.gameName}</strong>
                      <span className="text-sm text-zinc-400">
                        {item.platformName} · {formatBytes(item.bytesTransferred)} / {formatBytes(item.totalBytes)}
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
      ) : (
        <Card>
          <Card.Content className='text-center'>
            No downloads yet.
          </Card.Content>
        </Card>
      )}
    </section>
  )
}