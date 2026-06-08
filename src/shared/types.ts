export type FileServiceType = 'ftp' | 'ftps' | 'sftp' | 'nextcloud' | 'romm'
export type InputKeyboardMode = 'always' | 'gamepad'
export type TorrentUploadMode = 'always' | 'when_downloading' | 'never'
export type TorrentSourceType = 'magnet' | 'file'
export type TorrentMatchConfidence = 'exact' | 'fuzzy' | 'fallback'
export type TorrentDownloadStatus =
  | 'queued'
  | 'downloading'
  | 'extracting'
  | 'completed'
  | 'error'
  | 'cancelled'

export interface TorrentSource {
  id: string
  label: string
  sourceType: TorrentSourceType
  source: string
  resolvedName?: string
}

export interface TorrentFileEntry {
  id: string
  torrentId: string
  torrentLabel: string
  releaseGroupName: string
  platformName: string
  matchedPlatformName: string
  matchedPlatformSourceName: string
  matchConfidence: TorrentMatchConfidence
  romName: string
  fileName: string
  relativePath: string
  size: number
}

export interface TorrentBrowserSnapshot {
  files: TorrentFileEntry[]
  resolvedNames: Record<string, string>
  sourceErrors: Array<{
    torrentId: string
    message: string
  }>
}

export interface TorrentPlatformSummary {
  id: string
  displayName: string
  sourceName: string
  fileCount: number
  releaseGroups: string[]
}

export interface TorrentGameFile {
  entryId: string
  releaseGroupName: string
  torrentLabel: string
  fileName: string
  size: number
}

export interface TorrentGameGroup {
  id: string
  displayName: string
  cleanedName: string
  coverUrl: string | null
  metadataStatus: 'found' | 'missing' | 'error' | 'pending'
  platformDisplayName: string
  platformSourceName: string
  files: TorrentGameFile[]
}

export interface TorrentDownloadItem {
  id: string
  torrentFileId: string
  torrentId: string
  torrentLabel: string
  fileName: string
  platformName: string
  bytesTransferred: number
  totalBytes: number
  progress: number
  status: TorrentDownloadStatus
  error: string | null
  targetPath: string
}

export interface TorrentDownloadSnapshot {
  active: boolean
  items: TorrentDownloadItem[]
}

export interface AppConfig {
  romsDirectory: string
  twitchClientId: string
  twitchAccessToken: string
  twitchClientSecret: string
  fileServiceType: FileServiceType
  ftpUrl: string
  ftpUsername: string
  ftpPassword: string
  rommApiToken: string
  inputKeyboardMode: InputKeyboardMode
  torrentUploadMode: TorrentUploadMode
  torrentSources: TorrentSource[]
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
