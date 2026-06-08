import { Button, ProgressCircle } from '@heroui/react'
import { useNavigate } from 'react-router-dom'
import { useDownloadsStore } from '../store/downloadsStore'
import { useTorrentStore } from '../store/torrentStore'

export const DownloadsButton = (): React.JSX.Element => {
  const navigate = useNavigate()
  const { downloadSnapshot } = useDownloadsStore()
  const { downloadSnapshot: torrentSnapshot } = useTorrentStore()

  const activeCount =
    downloadSnapshot.items.filter((i) => i.status === 'queued' || i.status === 'downloading')
      .length +
    torrentSnapshot.items.filter(
      (i) => i.status === 'queued' || i.status === 'downloading' || i.status === 'extracting'
    ).length

  const totalCount =
    downloadSnapshot.items.filter((i) => i.status === 'queued' || i.status === 'downloading')
      .length +
    torrentSnapshot.items.filter(
      (i) => i.status === 'queued' || i.status === 'downloading' || i.status === 'extracting'
    ).length

  const progress = totalCount > 0 ? Math.round(((totalCount - activeCount) / totalCount) * 100) : 0

  return (
    <Button onPress={() => navigate('/downloads')} variant="tertiary">
      {activeCount > 0 ? (
        <ProgressCircle
          aria-label={`${activeCount} download${activeCount === 1 ? '' : 's'} in progress`}
          color="default"
          size="sm"
          value={progress}
        >
          <ProgressCircle.Track>
            <ProgressCircle.TrackCircle />
            <ProgressCircle.FillCircle />
          </ProgressCircle.Track>
        </ProgressCircle>
      ) : null}
      Downloads{activeCount > 0 ? ` (${activeCount})` : ''}
    </Button>
  )
}
