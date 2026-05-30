export interface AppConfig {
  romsDirectory: string
  twitchClientId: string
  twitchAccessToken: string
  twitchClientSecret: string
  ftpUrl: string
  ftpUsername: string
  ftpPassword: string
}

export interface PlatformSummary {
  id: string
  name: string
  sourceName: string
  romExtensions: string[]
  remoteGameCount: number
  downloadedGameCount: number
  totalSize: number
  localPath: string
}

export interface GameEntry {
  id: string
  name: string
  platformName: string
  platformSourceName: string
  cleanedName: string
  displayName: string
  discLabel: string | null
  coverUrl: string | null
  metadataStatus: 'found' | 'missing' | 'error'
  size: number
  modifiedAt: string | null
  downloaded: boolean
  localPath: string
  remotePath: string
  downloadFiles?: Array<{
    name: string
    size: number
    localPath: string
    remotePath: string
  }>
}

export interface GameMetadataUpdate {
  romFileName: string
  displayName: string
  coverUrl: string | null
  cleanedName: string
  status: 'found' | 'missing' | 'error'
}

export interface IgdbSearchResult {
  id: number
  name: string
  coverUrl: string | null
}

export interface LibraryCacheSnapshot {
  platforms: PlatformSummary[]
  gamesByPlatform: Record<string, GameEntry[]>
}

export type DownloadQueueItemStatus = 'queued' | 'downloading' | 'completed' | 'error'

export interface DownloadQueueItem {
  gameId: string
  gameName: string
  platformId: string
  platformName: string
  bytesTransferred: number
  totalBytes: number
  progress: number
  status: DownloadQueueItemStatus
  error: string | null
  localPath: string
}

export interface DownloadSnapshot {
  active: boolean
  queueId: string | null
  startedAt: string | null
  overallProgress: number
  items: DownloadQueueItem[]
}
