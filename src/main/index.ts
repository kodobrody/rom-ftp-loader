import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import AdmZip from 'adm-zip'
import { Client, FileType } from 'basic-ftp'
import { spawn } from 'child_process'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { createWriteStream, existsSync } from 'fs'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  unlink,
  writeFile
} from 'fs/promises'
import { basename, dirname, extname, join, posix } from 'path'
import SftpClient from 'ssh2-sftp-client'
import type {
  AppConfig,
  DownloadQueueItem,
  DownloadSnapshot,
  GameEntry,
  GameMetadataUpdate,
  IgdbSearchResult,
  LibraryCacheSnapshot,
  PlatformSummary,
  TorrentBrowserSnapshot,
  TorrentDownloadItem,
  TorrentDownloadSnapshot,
  TorrentFileEntry,
  TorrentGameGroup,
  TorrentMatchConfidence,
  TorrentPlatformSummary,
  TorrentSource,
  TorrentUploadMode
} from '../shared/types'
import {
  CONFIG_FILE_NAME,
  emptyConfig,
  emptySnapshot,
  fetchFromMain,
  GENERIC_ROM_EXTENSIONS,
  IGDB_GAMES_URL,
  LIBRARY_CACHE_FILE_NAME,
  METADATA_CACHE_FILE_NAME,
  PLATFORM_DEFINITIONS,
  TORRENT_BROWSER_CACHE_FILE_NAME,
  TORRENT_FILES_DIR_NAME,
  TWITCH_TOKEN_URL
} from './constants'

let mainWindow: BrowserWindow | null = null
let currentDownloadSnapshot: DownloadSnapshot = emptySnapshot()
let currentTorrentBrowserSnapshot: TorrentBrowserSnapshot = {
  files: [],
  resolvedNames: {},
  sourceErrors: []
}
let currentTorrentDownloadSnapshot: TorrentDownloadSnapshot = { active: false, items: [] }
let activeDownloadClient: RemoteClient | null = null
let activeDownloadingGameId: string | null = null
const cancelledGameIds = new Set<string>()
const activeTorrentClients = new Map<string, TorrentClientInstance>()
const torrentFileLookup = new Map<
  string,
  {
    source: TorrentSource
    relativePath: string
    fileName: string
    size: number
    platformName: string
    matchedPlatformName: string
    matchedPlatformSourceName: string
  }
>()
let webTorrentConstructorPromise: Promise<WebTorrentConstructor> | null = null

let torrentBrowserRefreshPromise: Promise<TorrentBrowserSnapshot> | null = null
type RemoteProtocol = 'ftp' | 'ftps' | 'sftp'
type FileServiceType = AppConfig['fileServiceType']

interface ParsedRemoteLocation {
  fileServiceType: FileServiceType
  protocol: RemoteProtocol
  host: string
  port: number
  secure: boolean
  basePath: string
}

interface RemoteEntry {
  name: string
  type: 'file' | 'directory'
  size: number
  modifiedAt: Date | null
}

type DownloadProgressHandler = ((bytes: number) => void) | null

interface RemoteClient {
  close: () => Promise<void> | void
  list: (remotePath: string) => Promise<RemoteEntry[]>
  downloadTo: (localPath: string, remotePath: string) => Promise<void>
  setDownloadProgressHandler: (handler: DownloadProgressHandler) => void
  abortActiveTransfer: () => void
}

interface TorrentReadableStream {
  once: (event: string, listener: (...args: unknown[]) => void) => TorrentReadableStream
  destroy: () => void
  pipe: (destination: ReturnType<typeof createWriteStream>) => ReturnType<typeof createWriteStream>
}

interface TorrentFileHandle {
  path?: string
  name?: string
  length?: number
  downloaded?: number
  select?: () => void
  deselect?: () => void
  createReadStream?: () => TorrentReadableStream
  on?: (event: string, listener: (...args: unknown[]) => void) => void
}

interface TorrentInstance {
  name?: string
  files?: TorrentFileHandle[]
  downloaded?: number
  on: (event: string, listener: (...args: unknown[]) => void) => void
}

interface TorrentClientInstance {
  add: (
    torrentId: string,
    options: {
      destroyStoreOnDestroy: boolean
      uploads?: number | false
      path?: string
      deselect?: boolean
    },
    onTorrent: (torrent: TorrentInstance) => void
  ) => TorrentInstance
  once: (event: 'error', listener: (error: unknown) => void) => void
  off: (event: 'error', listener: (error: unknown) => void) => void
  destroy: (callback: () => void) => void
}

type WebTorrentConstructor = new (options: {
  dht: boolean
  tracker: boolean
  seedOutgoingConnections?: boolean
  uploadLimit?: number
  downloadLimit: number
}) => TorrentClientInstance

interface RommPlatformDto {
  id?: number
  fs_slug?: string
  slug?: string
  name?: string
}

interface RommRomFileDto {
  id?: number
  file_name?: string
  file_size_bytes?: number
}

interface RommRomDto {
  id?: number
  fs_name?: string
  updated_at?: string
  files?: RommRomFileDto[]
}

export interface PlatformDefinition {
  displayName: string
  aliases: string[]
  extensions: string[]
  igdbPlatformIds: number[]
}

interface RomMetadataCacheEntry {
  displayName: string
  coverUrl: string | null
  cleanedName: string
  status: 'found' | 'missing' | 'error'
  fetchedAt: string
}

interface RomMetadataCache {
  entries: Record<string, RomMetadataCacheEntry>
}

const METADATA_MISSING_RETRY_MS = 7 * 24 * 60 * 60 * 1000
const METADATA_ERROR_RETRY_MS = 24 * 60 * 60 * 1000

interface LibraryCacheFile extends LibraryCacheSnapshot {}

interface IgdbTokenCacheEntry {
  clientId: string
  clientSecret: string
  accessToken: string
  expiresAt: number
}

let igdbTokenCache: IgdbTokenCacheEntry | null = null

const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

const normalizePlatformKey = (value: string): string => {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

const titleCasePlatformName = (value: string): string => {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase())
}

const getPlatformDefinition = (platformName: string): PlatformDefinition => {
  const normalizedPlatformName = normalizePlatformKey(platformName)
  const definition = PLATFORM_DEFINITIONS.find((candidate) =>
    candidate.aliases.some((alias) => normalizePlatformKey(alias) === normalizedPlatformName)
  )

  return (
    definition ?? {
      displayName: titleCasePlatformName(platformName),
      aliases: [platformName],
      extensions: GENERIC_ROM_EXTENSIONS,
      igdbPlatformIds: []
    }
  )
}

const getMetadataCachePath = (): string => {
  return join(app.getPath('userData'), METADATA_CACHE_FILE_NAME)
}

const getLibraryCachePath = (): string => {
  return join(app.getPath('userData'), LIBRARY_CACHE_FILE_NAME)
}

const readMetadataCache = async (): Promise<RomMetadataCache> => {
  try {
    const fileContents = await readFile(getMetadataCachePath(), 'utf8')
    const parsed = JSON.parse(fileContents) as Partial<RomMetadataCache>
    return { entries: parsed.entries ?? {} }
  } catch {
    return { entries: {} }
  }
}

const shouldRefreshCachedMetadata = (
  metadata: RomMetadataCacheEntry | undefined,
  forceRefetch: boolean
): boolean => {
  if (forceRefetch || !metadata) {
    return true
  }

  if (metadata.status === 'error') {
    const errorFetchedAtMs = Date.parse(metadata.fetchedAt)

    if (!Number.isFinite(errorFetchedAtMs)) {
      return true
    }

    return Date.now() - errorFetchedAtMs >= METADATA_ERROR_RETRY_MS
  }

  if (metadata.status !== 'missing') {
    return false
  }

  const fetchedAtMs = Date.parse(metadata.fetchedAt)

  if (!Number.isFinite(fetchedAtMs)) {
    return true
  }

  return Date.now() - fetchedAtMs >= METADATA_MISSING_RETRY_MS
}

const saveMetadataCache = async (cache: RomMetadataCache): Promise<void> => {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getMetadataCachePath(), JSON.stringify(cache, null, 2), 'utf8')
}

const readLibraryCache = async (): Promise<LibraryCacheSnapshot> => {
  try {
    const fileContents = await readFile(getLibraryCachePath(), 'utf8')
    const parsed = JSON.parse(fileContents) as Partial<LibraryCacheFile>

    return {
      platforms: parsed.platforms ?? [],
      gamesByPlatform: parsed.gamesByPlatform ?? {}
    }
  } catch {
    return {
      platforms: [],
      gamesByPlatform: {}
    }
  }
}

const saveLibraryCache = async (cache: LibraryCacheSnapshot): Promise<void> => {
  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getLibraryCachePath(), JSON.stringify(cache, null, 2), 'utf8')
}

const normalizeTitle = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const romanToArabic = (value: string): string => {
  return value
    .replace(/\biii\b/g, '3')
    .replace(/\bii\b/g, '2')
    .replace(/\biv\b/g, '4')
    .replace(/\bv\b/g, '5')
}

const stripRomDecorators = (fileName: string): string => {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')

  const normalized = withoutExtension
    .replace(/[._]/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\b(v|ver(?:sion)?)\s*\d+(?:\.\d+)*\b/gi, ' ')
    .replace(/\brev(?:ision)?[\s._-]+[a-z0-9]+(?:\.\d+)*\b/gi, ' ')
    .replace(/\b(usa|eur|europe|euro|japan|jpn|asia|world|global|pal|ntsc|ntsc-u|ntsc-j)\b/gi, ' ')
    .replace(
      /\b(en|eng|english|fr|fra|french|de|ger|german|es|spa|spanish|it|ita|pt|rus|multi\d*)\b/gi,
      ' '
    )
    .replace(/\b(beta|prototype|demo|sample)\b/gi, ' ')
    .replace(/-\s*[a-z0-9]{2,}$/i, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return romanToArabic(normalized)
}

const extractDiscLabel = (fileName: string): string | null => {
  const withoutExtension = fileName.replace(/\.[^.]+$/, '')
  const discPattern =
    /(?:\b(?:disc|disk|cd|dvd)\s*[-_.:]?\s*(\d{1,2})\b)|(?:\b(?:disc|disk|cd|dvd)\b\s*[-_.:]?\s*([ivx]+)\b)/i
  const match = withoutExtension.match(discPattern)

  if (!match) {
    return null
  }

  const arabicPart = match[1]
  const romanPart = match[2]

  if (arabicPart) {
    return `Disc ${arabicPart}`
  }

  if (romanPart) {
    const converted = romanToArabic(romanPart.toLowerCase())
    return `Disc ${converted}`
  }

  return null
}

const discSortOrder = (label: string | null): number => {
  if (!label) {
    return Number.MAX_SAFE_INTEGER
  }

  const match = label.match(/(\d+)/)
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER
}

const scoreIgdbCandidate = (query: string, candidate: string): number => {
  const normalizedQuery = normalizeTitle(romanToArabic(query))
  const normalizedCandidate = normalizeTitle(romanToArabic(candidate))

  if (!normalizedQuery || !normalizedCandidate) {
    return 0
  }

  if (normalizedQuery === normalizedCandidate) {
    return 100
  }

  if (
    normalizedCandidate.startsWith(normalizedQuery) ||
    normalizedQuery.startsWith(normalizedCandidate)
  ) {
    return 92
  }

  if (
    normalizedCandidate.includes(normalizedQuery) ||
    normalizedQuery.includes(normalizedCandidate)
  ) {
    return 78
  }

  const queryTokens = new Set(normalizedQuery.split(' '))
  const candidateTokens = new Set(normalizedCandidate.split(' '))

  let overlap = 0
  for (const token of queryTokens) {
    if (candidateTokens.has(token)) {
      overlap += 1
    }
  }

  return Math.round((overlap / Math.max(queryTokens.size, 1)) * 60)
}

const buildCacheKey = (platformSourceName: string, romFileName: string): string => {
  return `${normalizePlatformKey(platformSourceName)}::${romFileName.toLowerCase()}`
}

const coverToImageUrl = (rawCoverUrl: string | undefined): string | null => {
  if (!rawCoverUrl) {
    return null
  }

  const prefixed = rawCoverUrl.startsWith('//') ? `https:${rawCoverUrl}` : rawCoverUrl
  return prefixed.replace('/t_thumb/', '/t_cover_big/').replace('/t_cover_small/', '/t_cover_big/')
}

const fetchGameMetadataFromIgdb = async (
  config: AppConfig,
  platformDefinition: PlatformDefinition,
  romFileName: string
): Promise<RomMetadataCacheEntry> => {
  const cleanedName = stripRomDecorators(romFileName)
  const fallbackName = cleanedName || romFileName.replace(/\.[^.]+$/, '')
  const searchName = normalizeTitle(romanToArabic(fallbackName)) || fallbackName

  const escapedSearch = searchName.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const platformWhere = platformDefinition.igdbPlatformIds.length
    ? `where platforms = (${platformDefinition.igdbPlatformIds.join(',')});`
    : ''
  const query = `fields name,cover.url; search "${escapedSearch}"; ${platformWhere} limit 12;`

  try {
    const accessToken = await resolveTwitchAccessToken(config)

    if (!fetchFromMain) {
      throw new Error('Fetch API is unavailable in the Electron main process')
    }

    const response = await fetchFromMain(IGDB_GAMES_URL, {
      method: 'POST',
      headers: {
        'Client-ID': config.twitchClientId,
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json'
      },
      body: query
    })

    if (!response.ok) {
      const responseBody = await response.text().catch(() => '')
      const details = responseBody ? ` - ${responseBody.slice(0, 240)}` : ''
      const authHint =
        response.status === 401
          ? ' Ensure IGDB Access Token is a valid Twitch app token and IGDB Client ID matches that app.'
          : ''
      throw new Error(`IGDB request failed (${response.status})${details}${authHint}`)
    }

    const candidates = (await response.json()) as Array<{ name?: string; cover?: { url?: string } }>
    const best = candidates
      .filter((candidate) => typeof candidate.name === 'string' && candidate.name.trim().length > 0)
      .map((candidate) => ({
        candidate,
        score: scoreIgdbCandidate(fallbackName, candidate.name ?? '')
      }))
      .sort((left, right) => right.score - left.score)[0]

    if (!best || best.score < 40) {
      return {
        displayName: titleCasePlatformName(fallbackName),
        coverUrl: null,
        cleanedName: fallbackName,
        status: 'missing',
        fetchedAt: new Date().toISOString()
      }
    }

    return {
      displayName: best.candidate.name ?? titleCasePlatformName(fallbackName),
      coverUrl: coverToImageUrl(best.candidate.cover?.url),
      cleanedName: fallbackName,
      status: 'found',
      fetchedAt: new Date().toISOString()
    }
  } catch {
    return {
      displayName: titleCasePlatformName(fallbackName),
      coverUrl: null,
      cleanedName: fallbackName,
      status: 'error',
      fetchedAt: new Date().toISOString()
    }
  }
}

const searchIgdbGames = async (
  config: AppConfig,
  platformName: string,
  query: string
): Promise<IgdbSearchResult[]> => {
  const trimmedQuery = query.trim()
  if (!trimmedQuery) {
    return []
  }

  const platformDefinition = getPlatformDefinition(platformName)
  const escapedSearch = trimmedQuery.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
  const platformWhere = platformDefinition.igdbPlatformIds.length
    ? `where platforms = (${platformDefinition.igdbPlatformIds.join(',')});`
    : ''
  const igdbQuery = `fields id,name,cover.url; search "${escapedSearch}"; ${platformWhere} limit 20;`

  const accessToken = await resolveTwitchAccessToken(config)

  if (!fetchFromMain) {
    throw new Error('Fetch API is unavailable in the Electron main process')
  }

  const response = await fetchFromMain(IGDB_GAMES_URL, {
    method: 'POST',
    headers: {
      'Client-ID': config.twitchClientId,
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json'
    },
    body: igdbQuery
  })

  if (!response.ok) {
    const responseBody = await response.text().catch(() => '')
    const details = responseBody ? ` - ${responseBody.slice(0, 240)}` : ''
    throw new Error(`IGDB search failed (${response.status})${details}`)
  }

  const candidates = (await response.json()) as Array<{
    id?: number
    name?: string
    cover?: { url?: string }
  }>

  return candidates
    .filter(
      (candidate): candidate is { id: number; name: string; cover?: { url?: string } } =>
        typeof candidate.id === 'number' &&
        typeof candidate.name === 'string' &&
        candidate.name.trim().length > 0
    )
    .map((candidate) => ({
      id: candidate.id,
      name: candidate.name,
      coverUrl: coverToImageUrl(candidate.cover?.url)
    }))
}

const isAllowedRomFile = (fileName: string, extensions: string[]): boolean => {
  const extension = extname(fileName).slice(1).toLowerCase()
  return Boolean(extension) && extensions.includes(extension)
}

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message
  }

  return 'Unknown error'
}

const createRuntimeId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

const normalizeTorrentPath = (value: string): string => {
  return value.replace(/\\/g, '/').replace(/^\/+/, '').trim()
}

const moveExtractedEntry = async (
  sourcePath: string,
  destinationDirectory: string
): Promise<void> => {
  const sourceStats = await stat(sourcePath)
  const destinationPath = join(destinationDirectory, basename(sourcePath))

  if (sourceStats.isDirectory()) {
    await mkdir(destinationPath, { recursive: true })

    const entries = await readdir(sourcePath, { withFileTypes: true })

    for (const entry of entries) {
      await moveExtractedEntry(join(sourcePath, entry.name), destinationPath)
    }

    await rm(sourcePath, { recursive: true, force: true })
    return
  }

  if (existsSync(destinationPath)) {
    await rm(destinationPath, { recursive: true, force: true })
  }

  await rename(sourcePath, destinationPath).catch(async () => {
    await copyFile(sourcePath, destinationPath)
    await unlink(sourcePath)
  })
}

const extractArchiveIfNeeded = async (archivePath: string): Promise<void> => {
  const fileExtension = extname(archivePath).toLowerCase()
  const archiveHeader = await readFile(archivePath)
    .then((buffer) => buffer.subarray(0, 4))
    .catch(() => Buffer.alloc(0))
  const hasZipSignature =
    archiveHeader.length >= 4 &&
    archiveHeader[0] === 0x50 &&
    archiveHeader[1] === 0x4b &&
    (archiveHeader[2] === 0x03 || archiveHeader[2] === 0x05 || archiveHeader[2] === 0x07) &&
    (archiveHeader[3] === 0x04 || archiveHeader[3] === 0x06 || archiveHeader[3] === 0x08)

  if (fileExtension !== '.zip' && !hasZipSignature) {
    return
  }

  const archiveDirectory = dirname(archivePath)
  const extractionRoot = await mkdtemp(join(archiveDirectory, '.games2-extract-'))

  try {
    const archive = new AdmZip(archivePath)
    const entries = archive.getEntries()

    if (entries.length === 0) {
      throw new Error(`Archive ${archivePath} did not contain any files.`)
    }

    try {
      archive.extractAllTo(extractionRoot, true)
    } catch (error) {
      throw new Error(`Failed to extract ${archivePath}: ${getErrorMessage(error)}`)
    }

    const extractedEntries = await readdir(extractionRoot, { withFileTypes: true })

    if (extractedEntries.length === 0) {
      throw new Error(`Archive ${archivePath} did not contain any files.`)
    }

    const normalizedSourceRoot =
      extractedEntries.length === 1 && extractedEntries[0].isDirectory()
        ? join(extractionRoot, extractedEntries[0].name)
        : extractionRoot
    const normalizedEntries = await readdir(normalizedSourceRoot, { withFileTypes: true })

    for (const entry of normalizedEntries) {
      await moveExtractedEntry(join(normalizedSourceRoot, entry.name), archiveDirectory)
    }
  } finally {
    await rm(extractionRoot, { recursive: true, force: true })
  }
}

const getDefaultTorrentLabel = (
  sourceType: TorrentSource['sourceType'],
  source: string
): string => {
  if (sourceType === 'file') {
    const normalizedSource = source.replace(/\\/g, '/')
    return normalizedSource.split('/').pop() || 'Torrent file'
  }

  const magnetMatch = source.match(/[?&]dn=([^&]+)/i)

  if (magnetMatch?.[1]) {
    try {
      return decodeURIComponent(magnetMatch[1])
    } catch {
      return magnetMatch[1]
    }
  }

  return 'Magnet link'
}

const normalizeTorrentSourceValue = (
  sourceType: TorrentSource['sourceType'],
  source: string
): string => {
  const trimmedSource = source.trim()

  if (
    sourceType === 'magnet' &&
    trimmedSource.startsWith('magnet:') &&
    !trimmedSource.startsWith('magnet:?')
  ) {
    const normalized = trimmedSource.replace(/^magnet:/i, 'magnet:?')
    return normalized
  }

  return trimmedSource
}

const sanitizeTorrentSources = (value: unknown): TorrentSource[] => {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null
      }

      const rawEntry = entry as Partial<TorrentSource>
      const sourceType = rawEntry.sourceType === 'file' ? 'file' : 'magnet'
      const source = normalizeTorrentSourceValue(sourceType, String(rawEntry.source ?? ''))

      if (!source) {
        return null
      }

      const label =
        String(rawEntry.label ?? '').trim() || getDefaultTorrentLabel(sourceType, source)
      const resolvedName = String(rawEntry.resolvedName ?? '').trim() || undefined

      const sanitizedSource: TorrentSource = {
        id: String(rawEntry.id ?? '').trim() || createRuntimeId(),
        label,
        sourceType,
        source
      }

      if (resolvedName) {
        sanitizedSource.resolvedName = resolvedName
      }

      return sanitizedSource
    })
    .filter((entry): entry is TorrentSource => entry !== null)
}

const sanitizeTorrentUploadMode = (value: unknown): TorrentUploadMode => {
  const normalizedValue = String(value ?? '')
    .trim()
    .toLowerCase()

  if (normalizedValue === 'always') {
    return 'always'
  }

  return 'when_downloading'
}

const normalizePlatformTokens = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

const resolveTorrentPlatform = (
  platformName: string
): {
  matchedPlatformName: string
  matchedPlatformSourceName: string
  matchConfidence: TorrentMatchConfidence
} => {
  const normalizedInput = normalizePlatformKey(platformName)

  for (const definition of PLATFORM_DEFINITIONS) {
    const exactNames = [definition.displayName, ...definition.aliases]

    if (exactNames.some((candidate) => normalizePlatformKey(candidate) === normalizedInput)) {
      return {
        matchedPlatformName: definition.displayName,
        matchedPlatformSourceName: definition.aliases[0] ?? slugify(definition.displayName),
        matchConfidence: 'exact'
      }
    }
  }

  const inputTokens = new Set(normalizePlatformTokens(platformName))
  const inputDigits = normalizedInput.match(/\d+/g)?.join('') ?? ''
  let bestMatch: { definition: PlatformDefinition; score: number } | null = null

  for (const definition of PLATFORM_DEFINITIONS) {
    const candidateNames = [definition.displayName, ...definition.aliases]
    let bestCandidateScore = 0

    for (const candidateName of candidateNames) {
      const normalizedCandidate = normalizePlatformKey(candidateName)
      const candidateTokens = new Set(normalizePlatformTokens(candidateName))
      const overlapCount = [...inputTokens].filter((token) => candidateTokens.has(token)).length
      const tokenScore =
        candidateTokens.size > 0
          ? overlapCount / Math.max(candidateTokens.size, inputTokens.size, 1)
          : 0
      // Weight forward inclusion by coverage: longer match covering more of the input scores higher
      // (e.g. 'gameboyadvance' beating 'gameboy' when input is 'nintendogameboyadvance')
      const forwardCoverageScore =
        normalizedInput.includes(normalizedCandidate) && normalizedCandidate.length > 0
          ? (normalizedCandidate.length / normalizedInput.length) * 0.9
          : 0
      // Reverse inclusion: input is fully contained in candidate — high confidence broad match
      const reverseCoverageScore = normalizedCandidate.includes(normalizedInput) ? 0.88 : 0
      const inclusionScore = Math.max(forwardCoverageScore, reverseCoverageScore)
      const candidateDigits = normalizedCandidate.match(/\d+/g)?.join('') ?? ''
      const digitBonus = inputDigits && candidateDigits === inputDigits ? 0.12 : 0

      bestCandidateScore = Math.max(
        bestCandidateScore,
        tokenScore + digitBonus,
        inclusionScore + digitBonus
      )
    }

    if (!bestMatch || bestCandidateScore > bestMatch.score) {
      bestMatch = {
        definition,
        score: bestCandidateScore
      }
    }
  }

  if (bestMatch && bestMatch.score >= 0.52) {
    return {
      matchedPlatformName: bestMatch.definition.displayName,
      matchedPlatformSourceName:
        bestMatch.definition.aliases[0] ?? slugify(bestMatch.definition.displayName),
      matchConfidence: 'fuzzy'
    }
  }

  return {
    matchedPlatformName: titleCasePlatformName(platformName),
    matchedPlatformSourceName: slugify(platformName) || 'misc',
    matchConfidence: 'fallback'
  }
}

const extractTorrentFileEntry = (
  source: TorrentSource,
  torrentFile: { path?: string; name?: string; length?: number }
): TorrentFileEntry | null => {
  const relativePath = normalizeTorrentPath(String(torrentFile.path ?? torrentFile.name ?? ''))

  if (!relativePath) {
    return null
  }

  const pathSegments = relativePath.split('/').filter(Boolean)

  if (pathSegments.length < 4 || pathSegments[0].toLowerCase() !== 'minerva_myrient') {
    return null
  }

  const releaseGroupName = pathSegments[1]
  const platformName = pathSegments[2]
  const fileName = pathSegments[pathSegments.length - 1]
  const romName = fileName.replace(/\.[^.]+$/, '')
  const resolvedPlatform = resolveTorrentPlatform(platformName)

  return {
    id: `${source.id}::${relativePath.toLowerCase()}`,
    torrentId: source.id,
    torrentLabel: source.label,
    releaseGroupName,
    platformName,
    matchedPlatformName: resolvedPlatform.matchedPlatformName,
    matchedPlatformSourceName: resolvedPlatform.matchedPlatformSourceName,
    matchConfidence: resolvedPlatform.matchConfidence,
    romName,
    fileName,
    relativePath,
    size: Math.max(0, Number(torrentFile.length ?? 0))
  }
}

const loadWebTorrentConstructor = async (): Promise<WebTorrentConstructor> => {
  if (!webTorrentConstructorPromise) {
    webTorrentConstructorPromise = import('webtorrent').then((module) => module.default)
  }

  return webTorrentConstructorPromise
}

const resolveTorrentUploadPolicy = (
  uploadMode: TorrentUploadMode
): {
  uploadLimit: number
  downloadLimit: number
  seedOutgoingConnections: boolean
  uploads: number | false
  destroyStoreOnDestroy: boolean
  keepClientAfterCompletion: boolean
} => {
  if (uploadMode === 'always') {
    return {
      uploadLimit: -1,
      downloadLimit: -1,
      seedOutgoingConnections: true,
      uploads: 10,
      destroyStoreOnDestroy: false,
      keepClientAfterCompletion: true
    }
  }

  return {
    uploadLimit: -1,
    downloadLimit: -1,
    seedOutgoingConnections: true,
    uploads: 10,
    destroyStoreOnDestroy: true,
    keepClientAfterCompletion: false
  }
}

const createTorrentClient = async (
  uploadMode: TorrentUploadMode,
  options?: { forceNoOutgoing?: boolean }
): Promise<TorrentClientInstance> => {
  const WebTorrent = await loadWebTorrentConstructor()
  const policy = resolveTorrentUploadPolicy(uploadMode)

  return new WebTorrent({
    dht: true,
    tracker: true,
    seedOutgoingConnections: options?.forceNoOutgoing ? false : policy.seedOutgoingConnections,
    uploadLimit: policy.uploadLimit,
    downloadLimit: policy.downloadLimit
  })
}

const addTorrentToClient = async (
  client: TorrentClientInstance,
  source: TorrentSource,
  uploadMode: TorrentUploadMode,
  downloadPath?: string
): Promise<TorrentInstance> => {
  if (source.sourceType === 'file' && !existsSync(source.source)) {
    throw new Error(`Torrent file not found: ${source.source}`)
  }

  const policy = resolveTorrentUploadPolicy(uploadMode)

  return await new Promise((resolve, reject) => {
    let settled = false

    const finish = (callback: () => void): void => {
      callback()
    }

    const onClientError = (error: unknown) => {
      if (settled) {
        return
      }

      settled = true
      finish(() => {
        client.off('error', onClientError)
        reject(error)
      })
    }

    client.once('error', onClientError)

    try {
      client.add(
        source.source,
        {
          destroyStoreOnDestroy: policy.destroyStoreOnDestroy,
          uploads: policy.uploads,
          ...(downloadPath !== undefined ? { path: downloadPath, deselect: true } : {})
        },
        (torrent) => {
          // Called when torrent is ready (metadata available and store initialized)
          if (settled) {
            return
          }

          settled = true
          finish(() => {
            client.off('error', onClientError)
            resolve(torrent)
          })
        }
      )
    } catch (error) {
      if (settled) {
        return
      }

      settled = true
      finish(() => {
        client.off('error', onClientError)
        reject(error)
      })
    }
  })
}

const destroyTorrentClient = async (client: TorrentClientInstance | null): Promise<void> => {
  if (!client) {
    return
  }

  await new Promise<void>((resolve) => {
    try {
      client.destroy(() => resolve())
    } catch {
      resolve()
    }
  })
}

const emitTorrentDownloadSnapshot = (): void => {
  currentTorrentDownloadSnapshot = {
    active: currentTorrentDownloadSnapshot.items.some((item) =>
      ['queued', 'downloading', 'extracting'].includes(item.status)
    ),
    items: currentTorrentDownloadSnapshot.items
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('torrents:progress', currentTorrentDownloadSnapshot)
  }
}

const setTorrentDownloadItems = (items: TorrentDownloadItem[]): void => {
  currentTorrentDownloadSnapshot = {
    active: items.some((item) => ['queued', 'downloading', 'extracting'].includes(item.status)),
    items
  }

  emitTorrentDownloadSnapshot()
}

const updateTorrentDownloadItem = (
  itemId: string,
  updater: (item: TorrentDownloadItem) => TorrentDownloadItem
): void => {
  const itemIndex = currentTorrentDownloadSnapshot.items.findIndex((item) => item.id === itemId)

  if (itemIndex === -1) {
    return
  }

  const nextItems = [...currentTorrentDownloadSnapshot.items]
  nextItems[itemIndex] = updater(nextItems[itemIndex])
  setTorrentDownloadItems(nextItems)
}

const getTorrentBrowserCachePath = (): string => {
  return join(app.getPath('userData'), TORRENT_BROWSER_CACHE_FILE_NAME)
}

const readTorrentBrowserCache = async (): Promise<TorrentBrowserSnapshot | null> => {
  try {
    const fileContents = await readFile(getTorrentBrowserCachePath(), 'utf8')
    const parsed = JSON.parse(fileContents) as Partial<TorrentBrowserSnapshot>
    return {
      files: parsed.files ?? [],
      resolvedNames: parsed.resolvedNames ?? {},
      sourceErrors: parsed.sourceErrors ?? []
    }
  } catch {
    return null
  }
}

const saveTorrentBrowserCache = async (snapshot: TorrentBrowserSnapshot): Promise<void> => {
  try {
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(getTorrentBrowserCachePath(), JSON.stringify(snapshot, null, 2), 'utf8')
  } catch {
    // Non-fatal — cache is a performance optimisation only.
  }
}

const getTorrentPlatforms = (): TorrentPlatformSummary[] => {
  const platforms = new Map<string, TorrentPlatformSummary>()

  for (const file of currentTorrentBrowserSnapshot.files) {
    const key = file.matchedPlatformSourceName
    const existing = platforms.get(key)

    if (existing) {
      existing.fileCount += 1

      if (!existing.releaseGroups.includes(file.releaseGroupName)) {
        existing.releaseGroups.push(file.releaseGroupName)
      }
    } else {
      platforms.set(key, {
        id: key,
        displayName: file.matchedPlatformName,
        sourceName: file.matchedPlatformSourceName,
        fileCount: 1,
        releaseGroups: [file.releaseGroupName]
      })
    }
  }

  return [...platforms.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  )
}

const getTorrentGames = async (
  config: AppConfig,
  platformSourceName: string
): Promise<TorrentGameGroup[]> => {
  const filesForPlatform = currentTorrentBrowserSnapshot.files.filter(
    (file) => file.matchedPlatformSourceName === platformSourceName
  )

  const groups = new Map<string, TorrentGameGroup>()
  const metadataCache = await readMetadataCache()
  const hasTwitchConfig = Boolean(config.twitchClientId && config.twitchClientSecret)

  for (const file of filesForPlatform) {
    const normalizedKey = normalizePlatformKey(stripRomDecorators(file.romName) || file.romName)
    const existing = groups.get(normalizedKey)

    if (existing) {
      if (!existing.files.some((f) => f.entryId === file.id)) {
        existing.files.push({
          entryId: file.id,
          releaseGroupName: file.releaseGroupName,
          torrentLabel: file.torrentLabel,
          fileName: file.fileName,
          size: file.size
        })
      }
    } else {
      const cacheKey = buildCacheKey(platformSourceName, file.fileName)
      const cachedMetadata = metadataCache.entries[cacheKey]

      groups.set(normalizedKey, {
        id: `${platformSourceName}::${normalizedKey}`,
        displayName:
          cachedMetadata?.displayName ??
          titleCasePlatformName(stripRomDecorators(file.romName) || file.romName),
        cleanedName:
          cachedMetadata?.cleanedName ?? (stripRomDecorators(file.romName) || file.romName),
        coverUrl: cachedMetadata?.coverUrl ?? null,
        metadataStatus: cachedMetadata?.status ?? (hasTwitchConfig ? 'missing' : 'pending'),
        needsMetadataFetch: hasTwitchConfig && shouldRefreshCachedMetadata(cachedMetadata, false),
        platformDisplayName: file.matchedPlatformName,
        platformSourceName: file.matchedPlatformSourceName,
        files: [
          {
            entryId: file.id,
            releaseGroupName: file.releaseGroupName,
            torrentLabel: file.torrentLabel,
            fileName: file.fileName,
            size: file.size
          }
        ]
      })
    }
  }

  return [...groups.values()].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  )
}

const refreshTorrentBrowserState = async (config: AppConfig): Promise<TorrentBrowserSnapshot> => {
  if (torrentBrowserRefreshPromise) {
    return torrentBrowserRefreshPromise
  }

  torrentBrowserRefreshPromise = (async () => {
    const files: TorrentFileEntry[] = []
    const sourceErrors: TorrentBrowserSnapshot['sourceErrors'] = []
    const resolvedNames: Record<string, string> = {}

    torrentFileLookup.clear()

    for (const source of config.torrentSources) {
      let client: TorrentClientInstance | null = null

      try {
        client = await createTorrentClient(config.torrentUploadMode)
        const torrentClient = client
        const torrent = await addTorrentToClient(torrentClient, source, 'when_downloading')

        if (torrent.name) {
          resolvedNames[source.id] = torrent.name
        }

        for (const torrentFile of torrent.files ?? []) {
          const entry = extractTorrentFileEntry(source, torrentFile)

          if (!entry) {
            continue
          }

          files.push(entry)
          torrentFileLookup.set(entry.id, {
            source,
            relativePath: entry.relativePath,
            fileName: entry.fileName,
            size: entry.size,
            platformName: entry.platformName,
            matchedPlatformName: entry.matchedPlatformName,
            matchedPlatformSourceName: entry.matchedPlatformSourceName
          })
        }
      } catch (error) {
        sourceErrors.push({
          torrentId: source.id,
          message: getErrorMessage(error)
        })
      } finally {
        await destroyTorrentClient(client)
      }
    }

    currentTorrentBrowserSnapshot = {
      files: files.sort((left, right) => {
        const byPlatform = left.matchedPlatformName.localeCompare(right.matchedPlatformName)

        if (byPlatform !== 0) {
          return byPlatform
        }

        const byName = left.romName.localeCompare(right.romName)

        if (byName !== 0) {
          return byName
        }

        return left.fileName.localeCompare(right.fileName)
      }),
      resolvedNames,
      sourceErrors
    }

    void saveTorrentBrowserCache(currentTorrentBrowserSnapshot)

    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send('torrents:browser-state', currentTorrentBrowserSnapshot)
    }

    return currentTorrentBrowserSnapshot
  })().finally(() => {
    torrentBrowserRefreshPromise = null
  })

  return torrentBrowserRefreshPromise
}

const resolveTorrentFileDescriptor = async (
  config: AppConfig,
  torrentFileId: string
): Promise<{
  source: TorrentSource
  relativePath: string
  fileName: string
  size: number
  platformName: string
  matchedPlatformName: string
  matchedPlatformSourceName: string
}> => {
  const cachedDescriptor = torrentFileLookup.get(torrentFileId)

  if (cachedDescriptor) {
    return cachedDescriptor
  }

  await refreshTorrentBrowserState(config)

  const refreshedDescriptor = torrentFileLookup.get(torrentFileId)

  if (!refreshedDescriptor) {
    throw new Error('The selected torrent file could not be resolved. Refresh the torrent screen.')
  }

  return refreshedDescriptor
}

const runTorrentFileDownload = async (
  config: AppConfig,
  downloadItem: TorrentDownloadItem,
  descriptor: {
    source: TorrentSource
    relativePath: string
    fileName: string
    size: number
    platformName: string
    matchedPlatformName: string
    matchedPlatformSourceName: string
  }
): Promise<void> => {
  let client: TorrentClientInstance | null = null
  let progressInterval: NodeJS.Timeout | null = null
  let archiveAvailable = false
  let keepClientAliveForSeeding = false
  const uploadMode = sanitizeTorrentUploadMode(config.torrentUploadMode)

  try {
    const existingTargetStats = await stat(downloadItem.targetPath).catch(() => null)

    if (
      existingTargetStats &&
      existingTargetStats.isFile() &&
      existingTargetStats.size === descriptor.size
    ) {
      archiveAvailable = true
      updateTorrentDownloadItem(downloadItem.id, (item) => ({
        ...item,
        status: 'extracting',
        error: null
      }))

      await extractArchiveIfNeeded(downloadItem.targetPath)

      updateTorrentDownloadItem(downloadItem.id, (item) => ({
        ...item,
        status: 'completed',
        error: null,
        bytesTransferred: descriptor.size,
        progress: 100
      }))
      return
    }

    client = await createTorrentClient(uploadMode)
    const torrentClient = client

    const existingTorrentClient = activeTorrentClients.get(downloadItem.id)

    if (existingTorrentClient && existingTorrentClient !== torrentClient) {
      await destroyTorrentClient(existingTorrentClient)
    }

    activeTorrentClients.set(downloadItem.id, torrentClient)

    // If the item was cancelled (and removed) while the client was being created, bail out.
    const stillExists = currentTorrentDownloadSnapshot.items.some(
      (item) => item.id === downloadItem.id
    )

    if (!stillExists) {
      activeTorrentClients.delete(downloadItem.id)
      await destroyTorrentClient(torrentClient)
      return
    }

    updateTorrentDownloadItem(downloadItem.id, (item) => ({
      ...item,
      status: 'downloading',
      error: null
    }))

    // Download directly into the target drive — no cross-device rename issues
    const downloadBaseDir = dirname(downloadItem.targetPath)
    await mkdir(downloadBaseDir, { recursive: true })

    const torrent = await addTorrentToClient(
      torrentClient,
      descriptor.source,
      uploadMode,
      downloadBaseDir
    )

    const targetFile = (torrent.files ?? []).find(
      (file) =>
        normalizeTorrentPath(String(file.path ?? file.name ?? '')) === descriptor.relativePath
    )

    if (!targetFile) {
      throw new Error('The selected file was not found in the torrent metadata.')
    }

    // All files start deselected (deselect:true in add opts). Select only the target.
    targetFile.select?.()

    // Track progress and detect cancellation
    let downloadSettled = false
    let downloadResolve: (() => void) | null = null
    let downloadReject: ((err: Error) => void) | null = null

    progressInterval = setInterval(() => {
      if (downloadSettled) return

      const itemStillExists = currentTorrentDownloadSnapshot.items.some(
        (item) => item.id === downloadItem.id
      )

      if (!itemStillExists) {
        downloadSettled = true
        downloadReject?.(new Error('Download was cancelled.'))
        return
      }

      const bytesTransferred = Math.min(
        descriptor.size,
        Math.max(0, Number(targetFile.downloaded ?? 0))
      )

      updateTorrentDownloadItem(downloadItem.id, (item) => ({
        ...item,
        bytesTransferred,
        progress:
          descriptor.size > 0
            ? Math.min(99, Math.round((bytesTransferred / descriptor.size) * 100))
            : 0
      }))

      // Completion check as fallback if events are missed
      if (descriptor.size > 0 && bytesTransferred >= descriptor.size) {
        downloadSettled = true
        downloadResolve?.()
      }
    }, 350)

    await new Promise<void>((resolve, reject) => {
      downloadResolve = resolve
      downloadReject = reject

      targetFile.on?.('done', () => {
        if (downloadSettled) return
        downloadSettled = true
        resolve()
      })

      torrent.on('idle', () => {
        if (downloadSettled) return
        downloadSettled = true
        resolve()
      })

      torrent.on('error', (err: unknown) => {
        if (downloadSettled) return
        downloadSettled = true
        reject(err instanceof Error ? err : new Error(String(err)))
      })
    })

    // File was written to downloadBaseDir/relativePath — move it to the flat targetPath
    const relativeParts = descriptor.relativePath.split('/')
    const downloadedFilePath = join(downloadBaseDir, ...relativeParts)

    if (downloadedFilePath !== downloadItem.targetPath) {
      if (existsSync(downloadItem.targetPath)) {
        await unlink(downloadItem.targetPath).catch((error: unknown) => {
          throw new Error(
            `Could not replace existing file at ${downloadItem.targetPath}: ${getErrorMessage(error)}`
          )
        })
      }

      await rename(downloadedFilePath, downloadItem.targetPath).catch((error: unknown) => {
        throw new Error(
          `Could not move downloaded file to ${downloadItem.targetPath}: ${getErrorMessage(error)}`
        )
      })

      // Clean up the torrent group subdirectory left behind (best-effort)
      if (relativeParts.length > 1) {
        await rm(join(downloadBaseDir, relativeParts[0]), { recursive: true, force: true }).catch(
          () => undefined
        )
      }
    }

    archiveAvailable = true
    await extractArchiveIfNeeded(downloadItem.targetPath)

    keepClientAliveForSeeding = resolveTorrentUploadPolicy(uploadMode).keepClientAfterCompletion

    updateTorrentDownloadItem(downloadItem.id, (item) => ({
      ...item,
      status: 'completed',
      error: null,
      bytesTransferred: descriptor.size,
      progress: 100
    }))
  } catch (error) {
    try {
      if (!archiveAvailable && existsSync(downloadItem.targetPath)) {
        await unlink(downloadItem.targetPath)
      }
    } catch {
      // Ignore best-effort cleanup failures for partial torrent files.
    }

    updateTorrentDownloadItem(downloadItem.id, (item) => ({
      ...item,
      status: 'error',
      error: getErrorMessage(error),
      bytesTransferred: 0,
      progress: 0
    }))
  } finally {
    if (progressInterval) {
      clearInterval(progressInterval)
    }

    if (!keepClientAliveForSeeding) {
      activeTorrentClients.delete(downloadItem.id)
      await destroyTorrentClient(client)
    }
  }
}

const queueTorrentFileDownload = async (
  config: AppConfig,
  torrentFileId: string
): Promise<TorrentDownloadSnapshot> => {
  if (!config.romsDirectory.trim()) {
    throw new Error('Local game path is required before downloading torrents.')
  }

  const descriptor = await resolveTorrentFileDescriptor(config, torrentFileId)
  const targetPath = join(
    config.romsDirectory,
    descriptor.matchedPlatformSourceName,
    descriptor.fileName
  )
  const nextItem: TorrentDownloadItem = {
    id: torrentFileId,
    torrentFileId,
    torrentId: descriptor.source.id,
    torrentLabel: descriptor.source.label,
    fileName: descriptor.fileName,
    platformName: descriptor.matchedPlatformName,
    bytesTransferred: 0,
    totalBytes: descriptor.size,
    progress: 0,
    status: 'queued',
    error: null,
    targetPath
  }

  const existingIndex = currentTorrentDownloadSnapshot.items.findIndex(
    (item) => item.id === nextItem.id
  )
  const nextItems = [...currentTorrentDownloadSnapshot.items]

  if (existingIndex >= 0) {
    nextItems[existingIndex] = nextItem
  } else {
    nextItems.unshift(nextItem)
  }

  setTorrentDownloadItems(nextItems)
  void runTorrentFileDownload(config, nextItem, descriptor)

  return currentTorrentDownloadSnapshot
}

const getConfigPath = (): string => {
  return join(app.getPath('userData'), CONFIG_FILE_NAME)
}

const normalizeTwitchAccessToken = (token: string | undefined): string => {
  if (!token) {
    return ''
  }

  return token.trim().replace(/^Bearer\s+/i, '')
}

const normalizeTwitchClientSecret = (secret: string | undefined): string => {
  return secret?.trim() ?? ''
}

const resolveTwitchAccessToken = async (config: AppConfig): Promise<string> => {
  const clientId = config.twitchClientId.trim()
  const clientSecret = normalizeTwitchClientSecret(config.twitchClientSecret)

  if (!clientId || !clientSecret) {
    throw new Error('Twitch Client ID and Twitch Client Secret are required.')
  }

  const now = Date.now()

  if (
    igdbTokenCache &&
    igdbTokenCache.clientId === clientId &&
    igdbTokenCache.clientSecret === clientSecret &&
    igdbTokenCache.expiresAt > now + 30_000
  ) {
    return igdbTokenCache.accessToken
  }

  if (!fetchFromMain) {
    throw new Error('Fetch API is unavailable in the Electron main process')
  }

  const params = new URLSearchParams()
  params.append('client_id', clientId)
  params.append('client_secret', clientSecret)
  params.append('grant_type', 'client_credentials')

  const tokenResponse = await fetchFromMain(TWITCH_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: params.toString()
  })

  if (!tokenResponse.ok) {
    const responseBody = await tokenResponse.text().catch(() => '')
    const details = responseBody ? ` - ${responseBody.slice(0, 240)}` : ''
    throw new Error(`Failed to get Twitch app token (${tokenResponse.status})${details}`)
  }

  const tokenPayload = (await tokenResponse.json()) as {
    access_token?: string
    expires_in?: number
  }

  const accessToken = normalizeTwitchAccessToken(tokenPayload.access_token)

  if (!accessToken) {
    throw new Error('Twitch token response did not include access_token.')
  }

  const expiresInSeconds = Math.max(0, Number(tokenPayload.expires_in ?? 0))
  const expiresAt = now + Math.max(60, expiresInSeconds - 60) * 1000

  igdbTokenCache = {
    clientId,
    clientSecret,
    accessToken,
    expiresAt
  }

  return accessToken
}

const testTwitchConnection = async (config: AppConfig): Promise<boolean> => {
  await resolveTwitchAccessToken(config)
  return true
}

const sanitizeConfig = (config: Partial<AppConfig>): AppConfig => {
  const rawServiceType = String(config.fileServiceType || 'ftp').toLowerCase()
  const fileServiceType: FileServiceType =
    rawServiceType === 'romm' ||
    rawServiceType === 'nextcloud' ||
    rawServiceType === 'ftps' ||
    rawServiceType === 'sftp'
      ? rawServiceType
      : 'ftp'
  const rawInputKeyboardMode = String(config.inputKeyboardMode || 'gamepad').toLowerCase()
  const inputKeyboardMode = rawInputKeyboardMode === 'always' ? 'always' : 'gamepad'
  const torrentUploadMode = sanitizeTorrentUploadMode(config.torrentUploadMode)

  return {
    romsDirectory: config.romsDirectory?.trim() ?? '',
    twitchClientId: config.twitchClientId?.trim() ?? '',
    twitchAccessToken: normalizeTwitchAccessToken(config.twitchAccessToken),
    twitchClientSecret: normalizeTwitchClientSecret(config.twitchClientSecret),
    fileServiceType,
    ftpUrl: config.ftpUrl?.trim() ?? '',
    ftpUsername: config.ftpUsername?.trim() ?? '',
    ftpPassword: config.ftpPassword ?? '',
    rommApiToken: config.rommApiToken?.trim() ?? '',
    inputKeyboardMode,
    torrentUploadMode,
    torrentSources: sanitizeTorrentSources(config.torrentSources)
  }
}

const readConfigFromDisk = async (): Promise<AppConfig> => {
  try {
    const fileContents = await readFile(getConfigPath(), 'utf8')
    return sanitizeConfig(JSON.parse(fileContents) as Partial<AppConfig>)
  } catch {
    return emptyConfig()
  }
}

const saveConfigToDisk = async (config: Partial<AppConfig>): Promise<AppConfig> => {
  const nextConfig = sanitizeConfig(config)

  if (nextConfig.twitchClientId || nextConfig.twitchClientSecret) {
    await testTwitchConnection(nextConfig)
  }

  await mkdir(app.getPath('userData'), { recursive: true })
  await writeFile(getConfigPath(), JSON.stringify(nextConfig, null, 2), 'utf8')

  return nextConfig
}

const isConfigComplete = (config: AppConfig): boolean => {
  if (!config.romsDirectory || !config.ftpUrl) {
    return false
  }

  if (config.fileServiceType === 'romm') {
    return Boolean(config.rommApiToken)
  }

  return Boolean(config.ftpUsername && config.ftpPassword)
}

const assertConfigured = (config: AppConfig): void => {
  if (!isConfigComplete(config)) {
    throw new Error('Complete setup first.')
  }
}

const getDefaultPort = (protocol: RemoteProtocol): number => {
  if (protocol === 'sftp') {
    return 22
  }

  if (protocol === 'ftps') {
    return 990
  }

  return 21
}

const normalizeRemoteProtocol = (value: string): RemoteProtocol => {
  const normalized = value.toLowerCase().replace(':', '')

  if (normalized === 'sftp') {
    return 'sftp'
  }

  if (normalized === 'ftps') {
    return 'ftps'
  }

  return 'ftp'
}

const normalizeRemotePath = (value: string): string => {
  const trimmed = value.trim()

  if (!trimmed || trimmed === '/') {
    return '/'
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

const buildConnectionUrl = (
  protocolInput: unknown,
  hostnameInput: unknown,
  portInput: unknown,
  pathInput: unknown
): string => {
  const protocol = normalizeRemoteProtocol(String(protocolInput || 'ftp'))
  const hostname = String(hostnameInput || '').trim()

  if (!hostname) {
    return ''
  }

  const rawPort = String(portInput ?? '').trim()
  const parsedPort = Number.parseInt(rawPort, 10)
  const port = Number.isFinite(parsedPort) && parsedPort > 0 ? parsedPort : getDefaultPort(protocol)
  const portSegment = port === getDefaultPort(protocol) ? '' : `:${port}`
  const path = normalizeRemotePath(String(pathInput ?? '/'))

  return `${protocol}://${hostname}${portSegment}${path}`
}

const parseRemoteLocation = (remoteUrl: string): ParsedRemoteLocation => {
  const normalizedUrl = remoteUrl.includes('://') ? remoteUrl : `ftp://${remoteUrl}`
  const parsedUrl = new URL(normalizedUrl)
  const protocolValue = normalizeRemoteProtocol(parsedUrl.protocol)

  return {
    fileServiceType: protocolValue,
    protocol: protocolValue,
    host: parsedUrl.hostname,
    port: parsedUrl.port ? Number(parsedUrl.port) : getDefaultPort(protocolValue),
    secure: protocolValue === 'ftps',
    basePath:
      parsedUrl.pathname && parsedUrl.pathname !== '/'
        ? parsedUrl.pathname.replace(/\/+$/, '')
        : '/'
  }
}

const normalizeRemoteBaseUrl = (config: AppConfig, fallbackProtocol: 'http' | 'https'): string => {
  const rawUrl = config.ftpUrl.trim()

  if (!rawUrl) {
    throw new Error('Connection URL is required.')
  }

  const withProtocol = rawUrl.includes('://') ? rawUrl : `${fallbackProtocol}://${rawUrl}`
  const parsed = new URL(withProtocol)
  const pathname = parsed.pathname.replace(/\/+$/, '')

  return `${parsed.protocol}//${parsed.host}${pathname}`
}

const parseSimpleXmlTagValues = (xml: string, tagName: string): string[] => {
  const matches = xml.match(new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)</${tagName}>`, 'gi'))

  if (!matches) {
    return []
  }

  return matches
    .map((entry) => entry.replace(new RegExp(`^<${tagName}[^>]*>|</${tagName}>$`, 'gi'), ''))
    .map((entry) =>
      entry
        .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim()
    )
}

const parseNextcloudEntries = (xml: string, baseUrl: string): RemoteEntry[] => {
  const responses = xml.match(/<d:response>[\s\S]*?<\/d:response>/gi) ?? []
  const normalizedBase = `${baseUrl.replace(/\/+$/, '')}/`
  const entries: RemoteEntry[] = []

  for (const response of responses) {
    const hrefRaw = parseSimpleXmlTagValues(response, 'd:href')[0]

    if (!hrefRaw) {
      continue
    }

    const hrefDecoded = decodeURIComponent(hrefRaw)
    const normalizedHref = hrefDecoded.startsWith('http')
      ? hrefDecoded
      : new URL(hrefDecoded, normalizedBase).toString()

    if (!normalizedHref.startsWith(normalizedBase)) {
      continue
    }

    const relativePath = normalizedHref.slice(normalizedBase.length).replace(/^\/+/, '')

    if (!relativePath) {
      continue
    }

    const isDirectory = /<d:collection\/?>(?:<\/d:collection>)?/i.test(response)
    const sanitizedRelativePath = relativePath.replace(/\/+$/, '')
    const entryName = sanitizedRelativePath.split('/').pop() || sanitizedRelativePath
    const contentLength = Number.parseInt(
      parseSimpleXmlTagValues(response, 'd:getcontentlength')[0],
      10
    )
    const lastModifiedRaw = parseSimpleXmlTagValues(response, 'd:getlastmodified')[0]

    entries.push({
      name: entryName,
      type: isDirectory ? 'directory' : 'file',
      size: Number.isFinite(contentLength) ? contentLength : 0,
      modifiedAt: lastModifiedRaw ? new Date(lastModifiedRaw) : null
    })
  }

  return entries
}

const buildRommApiUrl = (baseUrl: string, path: string): string => {
  const normalizedBase = baseUrl.replace(/\/+$/, '')
  const normalizedPath = path.startsWith('/') ? path : `/${path}`
  return `${normalizedBase}${normalizedPath}`
}

const rommRequest = async (
  config: AppConfig,
  method: 'GET' | 'POST',
  path: string,
  body?: string
): Promise<Response> => {
  if (!fetchFromMain) {
    throw new Error('Network requests are not available in this runtime.')
  }

  const baseUrl = normalizeRemoteBaseUrl(config, 'http')
  const response = await fetchFromMain(buildRommApiUrl(baseUrl, path), {
    method,
    headers: {
      Authorization: `Bearer ${config.rommApiToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body
  })

  if (!response.ok) {
    const details = await response.text().catch(() => '')
    throw new Error(`RomM request failed (${response.status})${details ? `: ${details}` : ''}`)
  }

  return response
}

const parseRommPlatformsPayload = (payload: unknown): RommPlatformDto[] => {
  if (Array.isArray(payload)) {
    return payload as RommPlatformDto[]
  }

  if (payload && typeof payload === 'object') {
    const objectPayload = payload as Record<string, unknown>

    if (Array.isArray(objectPayload.items)) {
      return objectPayload.items as RommPlatformDto[]
    }

    if (Array.isArray(objectPayload.results)) {
      return objectPayload.results as RommPlatformDto[]
    }

    if (Array.isArray(objectPayload.data)) {
      return objectPayload.data as RommPlatformDto[]
    }
  }

  return []
}

const parseRommRomsPayload = (payload: unknown): RommRomDto[] => {
  if (Array.isArray(payload)) {
    return payload as RommRomDto[]
  }

  if (payload && typeof payload === 'object') {
    const objectPayload = payload as Record<string, unknown>

    if (Array.isArray(objectPayload.items)) {
      return objectPayload.items as RommRomDto[]
    }

    if (Array.isArray(objectPayload.results)) {
      return objectPayload.results as RommRomDto[]
    }

    if (Array.isArray(objectPayload.data)) {
      return objectPayload.data as RommRomDto[]
    }
  }

  return []
}

const rommGetJsonWithFallback = async (
  config: AppConfig,
  candidatePaths: string[]
): Promise<unknown> => {
  let lastError: unknown = null

  for (const candidatePath of candidatePaths) {
    try {
      const response = await rommRequest(config, 'GET', candidatePath)
      return await response.json()
    } catch (error) {
      lastError = error
    }
  }

  if (lastError instanceof Error) {
    throw lastError
  }

  throw new Error('RomM request failed for all candidate endpoints.')
}

const connectNextcloudClient = async (config: AppConfig): Promise<RemoteClient> => {
  if (!fetchFromMain) {
    throw new Error('Network requests are not available in this runtime.')
  }

  const baseUrl = normalizeRemoteBaseUrl(config, 'https')

  const authHeader = `Basic ${Buffer.from(`${config.ftpUsername}:${config.ftpPassword}`, 'utf8').toString('base64')}`

  const list = async (remotePath: string): Promise<RemoteEntry[]> => {
    const normalizedPath = remotePath === '/' ? '' : remotePath.replace(/^\//, '')
    const targetUrl = `${baseUrl}/${normalizedPath}`.replace(/([^:]\/)\/+/g, '$1')
    const response = await fetchFromMain(targetUrl, {
      method: 'PROPFIND',
      headers: {
        Authorization: authHeader,
        Depth: '1'
      }
    })

    if (!response.ok) {
      const details = await response.text().catch(() => '')
      throw new Error(
        `Nextcloud PROPFIND failed (${response.status})${details ? `: ${details}` : ''}`
      )
    }

    const xml = await response.text()
    return parseNextcloudEntries(xml, targetUrl)
  }

  return {
    close: () => undefined,
    list,
    downloadTo: async (localPath: string, remotePath: string) => {
      const normalizedPath = remotePath.replace(/^\//, '')
      const targetUrl = `${baseUrl}/${normalizedPath}`.replace(/([^:]\/)\/+/g, '$1')
      const response = await fetchFromMain(targetUrl, {
        method: 'GET',
        headers: {
          Authorization: authHeader
        }
      })

      if (!response.ok) {
        const details = await response.text().catch(() => '')
        throw new Error(
          `Nextcloud download failed (${response.status})${details ? `: ${details}` : ''}`
        )
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      await writeFile(localPath, buffer)
    },
    setDownloadProgressHandler: () => undefined,
    abortActiveTransfer: () => undefined
  }
}

const connectRommClient = async (config: AppConfig): Promise<RemoteClient> => {
  const list = async (remotePath: string): Promise<RemoteEntry[]> => {
    const trimmed = remotePath.replace(/^\/+|\/+$/g, '')

    if (!trimmed || trimmed === '.') {
      const payload = await rommGetJsonWithFallback(config, [
        '/platforms?limit=1000&offset=0',
        '/platforms'
      ])
      const platforms = parseRommPlatformsPayload(payload)

      const platformEntries = platforms.map((platform) => {
        const name = platform.fs_slug || platform.slug || platform.name || ''

        if (!name) {
          return null
        }

        return {
          name,
          type: 'directory' as const,
          size: 0,
          modifiedAt: null
        }
      })

      return platformEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    }

    const platformPayload = await rommGetJsonWithFallback(config, [
      `/platforms?limit=1000&offset=0&search_term=${encodeURIComponent(trimmed)}`,
      `/platforms?search_term=${encodeURIComponent(trimmed)}`,
      '/platforms'
    ])
    const platforms = parseRommPlatformsPayload(platformPayload)
    const platform = platforms.find(
      (candidate) =>
        candidate.fs_slug?.toLowerCase() === trimmed.toLowerCase() ||
        candidate.slug?.toLowerCase() === trimmed.toLowerCase() ||
        candidate.name?.toLowerCase() === trimmed.toLowerCase()
    )

    if (!platform?.id) {
      return []
    }

    const romPayload = await rommGetJsonWithFallback(config, [
      `/roms?platform_ids=${platform.id}&limit=10000&offset=0`,
      `/roms?platform_ids=${platform.id}`,
      `/roms?platform_id=${platform.id}`,
      `/roms?platform_id=${platform.id}&limit=10000&offset=0`
    ])
    const roms = parseRommRomsPayload(romPayload)

    const romEntries = roms.map((rom) => {
      const primaryFile = rom.files?.[0]
      const name = primaryFile?.file_name || rom.fs_name || ''

      if (!name) {
        return null
      }

      return {
        name,
        type: 'file' as const,
        size: primaryFile?.file_size_bytes ?? 0,
        modifiedAt: rom.updated_at ? new Date(rom.updated_at) : null
      }
    })

    return romEntries.filter((entry): entry is NonNullable<typeof entry> => entry !== null)
  }

  return {
    close: () => undefined,
    list,
    downloadTo: async (localPath: string, remotePath: string) => {
      const [platformSegment, ...fileSegments] = remotePath.replace(/^\/+/, '').split('/')
      const fileName = fileSegments.join('/')

      if (!platformSegment || !fileName) {
        throw new Error('Invalid RomM remote path format.')
      }

      const platformPayload = await rommGetJsonWithFallback(config, [
        `/platforms?limit=1000&offset=0&search_term=${encodeURIComponent(platformSegment)}`,
        `/platforms?search_term=${encodeURIComponent(platformSegment)}`,
        '/platforms'
      ])
      const platforms = parseRommPlatformsPayload(platformPayload)
      const platform = platforms.find(
        (candidate) =>
          candidate.fs_slug?.toLowerCase() === platformSegment.toLowerCase() ||
          candidate.slug?.toLowerCase() === platformSegment.toLowerCase() ||
          candidate.name?.toLowerCase() === platformSegment.toLowerCase()
      )

      if (!platform?.id) {
        throw new Error(`Could not resolve RomM platform '${platformSegment}'.`)
      }

      const searchTerm = encodeURIComponent(fileName.replace(/\.[^.]+$/, ''))
      const romPayload = await rommGetJsonWithFallback(config, [
        `/roms?platform_ids=${platform.id}&limit=10000&offset=0&search_term=${searchTerm}`,
        `/roms?platform_ids=${platform.id}&search_term=${searchTerm}`,
        `/roms?platform_id=${platform.id}&limit=10000&offset=0&search_term=${searchTerm}`,
        `/roms?platform_id=${platform.id}&search_term=${searchTerm}`,
        `/roms?platform_ids=${platform.id}`,
        `/roms?platform_id=${platform.id}`
      ])
      const matchingRom = parseRommRomsPayload(romPayload).find((rom) =>
        (rom.files ?? []).some((file) => file.file_name === fileName)
      )
      const matchingFile = matchingRom?.files?.find((file) => file.file_name === fileName)

      if (!matchingRom?.id || !matchingFile?.file_name) {
        throw new Error(`Could not resolve RomM file '${fileName}'.`)
      }

      const baseUrl = normalizeRemoteBaseUrl(config, 'http')
      const contentUrl = buildRommApiUrl(
        baseUrl,
        `/roms/${matchingRom.id}/content/${encodeURIComponent(matchingFile.file_name)}`
      )

      if (!fetchFromMain) {
        throw new Error('Network requests are not available in this runtime.')
      }

      const response = await fetchFromMain(contentUrl, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.rommApiToken}`
        }
      })

      if (!response.ok) {
        const details = await response.text().catch(() => '')
        throw new Error(`RomM download failed (${response.status})${details ? `: ${details}` : ''}`)
      }

      const buffer = Buffer.from(await response.arrayBuffer())
      await writeFile(localPath, buffer)
    },
    setDownloadProgressHandler: () => undefined,
    abortActiveTransfer: () => undefined
  }
}

const connectFtpClient = async (
  config: AppConfig,
  remote: ParsedRemoteLocation
): Promise<RemoteClient> => {
  const client = new Client(30_000)

  client.ftp.verbose = false

  await client.access({
    host: remote.host,
    port: remote.port,
    user: config.ftpUsername,
    password: config.ftpPassword,
    secure: remote.secure
  })

  return {
    close: () => {
      client.close()
    },
    list: async (remotePath: string) => {
      const entries = await client.list(remotePath)
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.type === FileType.Directory ? 'directory' : 'file',
        size: entry.size,
        modifiedAt: entry.modifiedAt ?? null
      }))
    },
    downloadTo: async (localPath: string, remotePath: string) => {
      await client.downloadTo(localPath, remotePath)
    },
    setDownloadProgressHandler: (handler: DownloadProgressHandler) => {
      client.trackProgress((info) => {
        if (!handler || info.type !== 'download') {
          return
        }

        handler(info.bytes)
      })
    },
    abortActiveTransfer: () => {
      client.close()
    }
  }
}

const connectSftpClient = async (
  config: AppConfig,
  remote: ParsedRemoteLocation
): Promise<RemoteClient> => {
  const client = new SftpClient()
  let downloadProgressHandler: DownloadProgressHandler = null

  await client.connect({
    host: remote.host,
    port: remote.port,
    username: config.ftpUsername,
    password: config.ftpPassword,
    readyTimeout: 30_000
  })

  return {
    close: () => client.end(),
    list: async (remotePath: string) => {
      const entries = await client.list(remotePath)
      return entries.map((entry) => ({
        name: entry.name,
        type: entry.type === 'd' ? 'directory' : 'file',
        size: Number(entry.size) || 0,
        modifiedAt:
          typeof entry.modifyTime === 'number' && entry.modifyTime > 0
            ? new Date(entry.modifyTime)
            : null
      }))
    },
    downloadTo: async (localPath: string, remotePath: string) => {
      await client.fastGet(remotePath, localPath, {
        step: (transferred) => {
          if (downloadProgressHandler) {
            downloadProgressHandler(transferred)
          }
        }
      })
    },
    setDownloadProgressHandler: (handler: DownloadProgressHandler) => {
      downloadProgressHandler = handler
    },
    abortActiveTransfer: () => {
      void client.end()
    }
  }
}

const withRemote = async <T>(
  config: AppConfig,
  action: (client: RemoteClient, basePath: string) => Promise<T>
): Promise<T> => {
  const serviceType = config.fileServiceType
  const remote = parseRemoteLocation(config.ftpUrl)

  let client: RemoteClient
  let basePath = remote.basePath

  if (serviceType === 'romm') {
    client = await connectRommClient(config)
    basePath = '/'
  } else if (serviceType === 'nextcloud') {
    client = await connectNextcloudClient(config)
    basePath = '/'
  } else {
    client =
      serviceType === 'sftp'
        ? await connectSftpClient(config, remote)
        : await connectFtpClient(config, remote)
  }

  try {
    return await action(client, basePath)
  } finally {
    await client.close()
  }
}

const remoteJoin = (...parts: string[]): string => {
  const filteredParts = parts.filter(Boolean)

  if (filteredParts.length === 0) {
    return '/'
  }

  const joinedPath = posix.join(...filteredParts)
  return joinedPath.startsWith('/') ? joinedPath : `/${joinedPath}`
}

const getLocalFileMap = async (directoryPath: string): Promise<Map<string, number>> => {
  try {
    const entries = await readdir(directoryPath, { withFileTypes: true })
    const fileStats = await Promise.all(
      entries
        .filter((entry) => entry.isFile())
        .map(async (entry) => {
          const localPath = join(directoryPath, entry.name)

          try {
            const info = await stat(localPath)
            return [entry.name, info.size] as const
          } catch {
            return null
          }
        })
    )

    return new Map(fileStats.filter((entry): entry is readonly [string, number] => entry !== null))
  } catch {
    return new Map()
  }
}

const listPlatforms = async (config: AppConfig): Promise<PlatformSummary[]> => {
  return withRemote(config, async (client, basePath) => {
    const remoteEntries = await client.list(basePath)
    const platforms: PlatformSummary[] = []

    for (const entry of remoteEntries.filter((item) => item.type === 'directory')) {
      const platformDefinition = getPlatformDefinition(entry.name)
      const platformPath = remoteJoin(basePath, entry.name)
      const gameEntries = (await client.list(platformPath)).filter(
        (item) => item.type === 'file' && isAllowedRomFile(item.name, platformDefinition.extensions)
      )

      if (gameEntries.length === 0) {
        continue
      }

      const localFiles = await getLocalFileMap(join(config.romsDirectory, entry.name))
      const downloadedGameCount = gameEntries.filter(
        (game) => localFiles.get(game.name) === game.size
      ).length

      platforms.push({
        id: slugify(entry.name),
        name: platformDefinition.displayName,
        sourceName: entry.name,
        romExtensions: platformDefinition.extensions,
        remoteGameCount: gameEntries.length,
        downloadedGameCount,
        totalSize: gameEntries.reduce((size, game) => size + game.size, 0),
        localPath: join(config.romsDirectory, entry.name)
      })
    }

    const nextPlatforms = platforms.sort((left, right) => left.name.localeCompare(right.name))
    const libraryCache = await readLibraryCache()

    await saveLibraryCache({
      platforms: nextPlatforms,
      gamesByPlatform: libraryCache.gamesByPlatform
    })

    return nextPlatforms
  })
}

const listGames = async (
  config: AppConfig,
  platformName: string,
  options?: { fetchMissingMetadata?: boolean; forceRefetchMetadata?: boolean }
): Promise<GameEntry[]> => {
  const fetchMissingMetadata = options?.fetchMissingMetadata ?? true
  const forceRefetchMetadata = options?.forceRefetchMetadata ?? false

  return withRemote(config, async (client, basePath) => {
    const platformDefinition = getPlatformDefinition(platformName)
    const metadataCache = await readMetadataCache()
    let cacheDirty = false
    let fetchedCount = 0
    let fetchErrorCount = 0
    const platformRemotePath = remoteJoin(basePath, platformName)
    const localPlatformPath = join(config.romsDirectory, platformName)
    const localFiles = await getLocalFileMap(localPlatformPath)
    const remoteEntries = (await client.list(platformRemotePath)).filter(
      (item) => item.type === 'file' && isAllowedRomFile(item.name, platformDefinition.extensions)
    )
    const groupedRemoteEntries = new Map<string, typeof remoteEntries>()

    for (const entry of remoteEntries) {
      const stem = entry.name.replace(/\.[^.]+$/, '').toLowerCase()
      const currentGroup = groupedRemoteEntries.get(stem)

      if (currentGroup) {
        currentGroup.push(entry)
      } else {
        groupedRemoteEntries.set(stem, [entry])
      }
    }

    const games: GameEntry[] = []

    for (const groupEntries of groupedRemoteEntries.values()) {
      const sortedGroupEntries = [...groupEntries].sort((left, right) => {
        const leftExtension = extname(left.name).toLowerCase()
        const rightExtension = extname(right.name).toLowerCase()

        if (leftExtension === '.cue' && rightExtension !== '.cue') {
          return -1
        }

        if (rightExtension === '.cue' && leftExtension !== '.cue') {
          return 1
        }

        return left.name.localeCompare(right.name)
      })
      const primaryEntry = sortedGroupEntries[0]
      const cacheKey = buildCacheKey(platformName, primaryEntry.name)
      let metadata = metadataCache.entries[cacheKey]

      const shouldFetch =
        fetchMissingMetadata && shouldRefreshCachedMetadata(metadata, forceRefetchMetadata)

      if (shouldFetch) {
        metadata = await fetchGameMetadataFromIgdb(config, platformDefinition, primaryEntry.name)
        metadataCache.entries[cacheKey] = metadata
        cacheDirty = true
        fetchedCount += 1

        if (metadata.status === 'error') {
          fetchErrorCount += 1
        }
      }

      const fallbackTitle = titleCasePlatformName(
        stripRomDecorators(primaryEntry.name) || primaryEntry.name
      )
      const discLabel = extractDiscLabel(primaryEntry.name)
      const downloadFiles = sortedGroupEntries.map((file) => ({
        name: file.name,
        size: file.size,
        localPath: join(localPlatformPath, file.name),
        remotePath: remoteJoin(platformRemotePath, file.name)
      }))
      const totalSize = downloadFiles.reduce((sum, file) => sum + file.size, 0)
      const downloaded = downloadFiles.every((file) => localFiles.get(file.name) === file.size)
      const newestModifiedAt = sortedGroupEntries
        .map((file) => file.modifiedAt?.getTime() ?? 0)
        .reduce((latest, current) => Math.max(latest, current), 0)

      games.push({
        id: `${slugify(platformName)}:${slugify(primaryEntry.name)}`,
        name: primaryEntry.name,
        platformName: platformDefinition.displayName,
        platformSourceName: platformName,
        cleanedName: metadata?.cleanedName ?? stripRomDecorators(primaryEntry.name),
        displayName: metadata?.displayName ?? fallbackTitle,
        discLabel,
        coverUrl: metadata?.coverUrl ?? null,
        metadataStatus: metadata?.status ?? 'missing',
        size: totalSize,
        modifiedAt: newestModifiedAt > 0 ? new Date(newestModifiedAt).toISOString() : null,
        downloaded,
        localPath: join(localPlatformPath, primaryEntry.name),
        remotePath: remoteJoin(platformRemotePath, primaryEntry.name),
        downloadFiles
      })
    }

    if (cacheDirty) {
      await saveMetadataCache(metadataCache)
    }

    const libraryCache = await readLibraryCache()
    libraryCache.gamesByPlatform[platformName] = games
    await saveLibraryCache(libraryCache)

    if (forceRefetchMetadata && fetchedCount > 0 && fetchErrorCount === fetchedCount) {
      throw new Error(
        'IGDB metadata requests failed for all games on this platform. Check IGDB Client ID, Access Token, or API limits.'
      )
    }

    return games.sort((left, right) => {
      const byName = left.displayName.localeCompare(right.displayName)

      if (byName !== 0) {
        return byName
      }

      const byDisc = discSortOrder(left.discLabel) - discSortOrder(right.discLabel)

      if (byDisc !== 0) {
        return byDisc
      }

      return left.name.localeCompare(right.name)
    })
  })
}

const fetchMetadataForSingleGame = async (
  config: AppConfig,
  platformName: string,
  romFileName: string,
  forceRefetch = false
): Promise<GameMetadataUpdate> => {
  const platformDefinition = getPlatformDefinition(platformName)
  const metadataCache = await readMetadataCache()
  const cacheKey = buildCacheKey(platformName, romFileName)

  const cachedMetadata = metadataCache.entries[cacheKey]

  if (!shouldRefreshCachedMetadata(cachedMetadata, forceRefetch)) {
    return {
      romFileName,
      displayName: cachedMetadata?.displayName ?? titleCasePlatformName(romFileName),
      coverUrl: cachedMetadata?.coverUrl ?? null,
      cleanedName: cachedMetadata?.cleanedName ?? stripRomDecorators(romFileName),
      status: cachedMetadata?.status ?? 'missing'
    }
  }

  const nextMetadata = await fetchGameMetadataFromIgdb(config, platformDefinition, romFileName)
  metadataCache.entries[cacheKey] = nextMetadata

  await saveMetadataCache(metadataCache)

  return {
    romFileName,
    displayName: nextMetadata.displayName,
    coverUrl: nextMetadata.coverUrl,
    cleanedName: nextMetadata.cleanedName,
    status: nextMetadata.status
  }
}

const applyManualMetadataMatch = async (
  platformName: string,
  romFileName: string,
  matchedName: string,
  matchedCoverUrl: string | null
): Promise<GameMetadataUpdate> => {
  const metadataCache = await readMetadataCache()
  const cacheKey = buildCacheKey(platformName, romFileName)
  const cleanedName = stripRomDecorators(romFileName) || romFileName.replace(/\.[^.]+$/, '')

  const nextMetadata: RomMetadataCacheEntry = {
    displayName: matchedName,
    coverUrl: matchedCoverUrl,
    cleanedName,
    status: 'found',
    fetchedAt: new Date().toISOString()
  }

  metadataCache.entries[cacheKey] = nextMetadata
  await saveMetadataCache(metadataCache)

  return {
    romFileName,
    displayName: nextMetadata.displayName,
    coverUrl: nextMetadata.coverUrl,
    cleanedName: nextMetadata.cleanedName,
    status: nextMetadata.status
  }
}

const calculateOverallProgress = (items: DownloadQueueItem[]): number => {
  if (items.length === 0) {
    return 0
  }

  const totalBytes = items.reduce((sum, item) => sum + Math.max(item.totalBytes, 0), 0)

  if (totalBytes > 0) {
    const transferred = items.reduce(
      (sum, item) =>
        sum + Math.min(Math.max(item.bytesTransferred, 0), Math.max(item.totalBytes, 0)),
      0
    )

    return Math.min(100, Math.round((transferred / totalBytes) * 100))
  }

  const progressSum = items.reduce((sum, item) => sum + item.progress, 0)
  return Math.round(progressSum / items.length)
}

const updateSnapshot = (nextItems: DownloadQueueItem[], active: boolean): void => {
  currentDownloadSnapshot = {
    ...currentDownloadSnapshot,
    active,
    items: nextItems,
    overallProgress: calculateOverallProgress(nextItems)
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('downloads:progress', currentDownloadSnapshot)
  }
}

const isQueueTerminal = (items: DownloadQueueItem[]): boolean => {
  return items.every((item) => ['completed', 'error'].includes(item.status))
}

const updateItemStatus = (
  gameId: string,
  updater: (item: DownloadQueueItem) => DownloadQueueItem
): void => {
  const itemIndex = currentDownloadSnapshot.items.findIndex((item) => item.gameId === gameId)

  if (itemIndex === -1) {
    return
  }

  const updatedItems = [...currentDownloadSnapshot.items]
  updatedItems[itemIndex] = updater(updatedItems[itemIndex])

  updateSnapshot(updatedItems, currentDownloadSnapshot.active && !isQueueTerminal(updatedItems))
}

const removeItemFromQueue = (gameId: string): void => {
  const nextItems = currentDownloadSnapshot.items.filter((item) => item.gameId !== gameId)
  const hasActiveItems = nextItems.some((item) => ['queued', 'downloading'].includes(item.status))

  currentDownloadSnapshot = {
    ...currentDownloadSnapshot,
    active: hasActiveItems,
    queueId: hasActiveItems ? currentDownloadSnapshot.queueId : null,
    startedAt: hasActiveItems ? currentDownloadSnapshot.startedAt : null,
    overallProgress: calculateOverallProgress(nextItems),
    items: nextItems
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('downloads:progress', currentDownloadSnapshot)
  }
}

const runDownloadQueue = async (
  config: AppConfig,
  platformName: string,
  games: GameEntry[]
): Promise<void> => {
  try {
    for (const game of games) {
      const existing = currentDownloadSnapshot.items.find((item) => item.gameId === game.id)

      if (!existing) {
        continue
      }

      if (cancelledGameIds.has(game.id)) {
        removeItemFromQueue(game.id)
        cancelledGameIds.delete(game.id)
        continue
      }

      updateItemStatus(game.id, (item) => ({
        ...item,
        status: 'downloading',
        error: null,
        progress: 0,
        bytesTransferred: 0,
        totalBytes: game.size
      }))

      const downloadTargets =
        game.downloadFiles && game.downloadFiles.length > 0
          ? game.downloadFiles
          : [
              {
                name: game.name,
                size: game.size,
                localPath: game.localPath,
                remotePath: game.remotePath
              }
            ]
      const targetLocalPaths = downloadTargets.map((target) => target.localPath)

      try {
        await withRemote(config, async (client) => {
          activeDownloadClient = client
          activeDownloadingGameId = game.id
          let downloadedBytesBeforeCurrent = 0
          let activeTargetLocalPath = downloadTargets[0].localPath
          let activeTargetSize = Math.max(downloadTargets[0].size, 0)
          let isPollingLocalProgress = false

          const localProgressInterval = setInterval(() => {
            if (isPollingLocalProgress) {
              return
            }

            isPollingLocalProgress = true
            void stat(activeTargetLocalPath)
              .then((fileStats) => {
                const fileBytes = fileStats.size
                const transferredBytes = Math.min(
                  game.size,
                  downloadedBytesBeforeCurrent + Math.min(fileBytes, activeTargetSize)
                )

                updateItemStatus(game.id, (item) => ({
                  ...item,
                  bytesTransferred: Math.max(item.bytesTransferred, transferredBytes),
                  progress:
                    game.size > 0
                      ? Math.min(
                          99,
                          Math.max(item.progress, Math.round((transferredBytes / game.size) * 100))
                        )
                      : transferredBytes > 0
                        ? Math.max(1, item.progress)
                        : item.progress
                }))
              })
              .catch(() => {
                // Ignore stats errors while file is being created or moved.
              })
              .finally(() => {
                isPollingLocalProgress = false
              })
          }, 350)
          const optimisticProgressInterval = setInterval(() => {
            updateItemStatus(game.id, (item) => {
              if (
                item.status !== 'downloading' ||
                item.progress >= 95 ||
                item.bytesTransferred > 0
              ) {
                return item
              }

              const nextProgress = Math.min(95, item.progress + 1)
              const optimisticBytes =
                item.totalBytes > 0
                  ? Math.min(
                      item.totalBytes,
                      Math.max(
                        item.bytesTransferred,
                        Math.round((item.totalBytes * nextProgress) / 100),
                        1
                      )
                    )
                  : Math.max(item.bytesTransferred, nextProgress * 64 * 1024)

              return {
                ...item,
                progress: nextProgress,
                bytesTransferred: Math.max(item.bytesTransferred, optimisticBytes)
              }
            })
          }, 700)

          client.setDownloadProgressHandler((bytesTransferredForCurrentFile) => {
            const transferredBytes = Math.min(
              game.size,
              downloadedBytesBeforeCurrent +
                Math.min(bytesTransferredForCurrentFile, activeTargetSize)
            )

            updateItemStatus(game.id, (item) => ({
              ...item,
              bytesTransferred: Math.max(item.bytesTransferred, transferredBytes),
              progress:
                game.size > 0
                  ? (() => {
                      const computed = Math.round((transferredBytes / game.size) * 100)

                      if (transferredBytes > 0) {
                        return Math.min(99, Math.max(1, computed))
                      }

                      return Math.max(0, computed)
                    })()
                  : bytesTransferredForCurrentFile > 0
                    ? Math.max(1, item.progress)
                    : item.progress
            }))

            if (cancelledGameIds.has(game.id)) {
              client.abortActiveTransfer()
            }
          })

          if (cancelledGameIds.has(game.id)) {
            client.abortActiveTransfer()
            throw new Error('Download cancelled')
          }

          try {
            for (const target of downloadTargets) {
              if (cancelledGameIds.has(game.id)) {
                client.abortActiveTransfer()
                throw new Error('Download cancelled')
              }

              await mkdir(dirname(target.localPath), { recursive: true })
              activeTargetLocalPath = target.localPath
              activeTargetSize = Math.max(target.size, 0)

              await client.downloadTo(target.localPath, target.remotePath)

              downloadedBytesBeforeCurrent = Math.min(
                game.size,
                downloadedBytesBeforeCurrent + activeTargetSize
              )

              updateItemStatus(game.id, (item) => ({
                ...item,
                bytesTransferred: Math.max(item.bytesTransferred, downloadedBytesBeforeCurrent),
                progress:
                  game.size > 0
                    ? Math.min(99, Math.round((downloadedBytesBeforeCurrent / game.size) * 100))
                    : downloadedBytesBeforeCurrent > 0
                      ? Math.max(1, item.progress)
                      : item.progress
              }))
            }
          } finally {
            client.setDownloadProgressHandler(null)
            clearInterval(localProgressInterval)
            clearInterval(optimisticProgressInterval)
          }
        })

        if (cancelledGameIds.has(game.id)) {
          await cleanupCancelledDownloadTargets(targetLocalPaths)
          removeItemFromQueue(game.id)
        } else {
          updateItemStatus(game.id, (item) => ({
            ...item,
            status: 'completed',
            error: null,
            bytesTransferred: game.size,
            progress: 100
          }))
        }
      } catch (error) {
        if (cancelledGameIds.has(game.id)) {
          await cleanupCancelledDownloadTargets(targetLocalPaths)
          removeItemFromQueue(game.id)
        } else {
          updateItemStatus(game.id, (item) => ({
            ...item,
            status: 'error',
            error: getErrorMessage(error),
            progress: 0
          }))
        }
      } finally {
        activeDownloadClient = null
        activeDownloadingGameId = null
        cancelledGameIds.delete(game.id)
      }
    }
  } finally {
    updateSnapshot(currentDownloadSnapshot.items, false)
  }

  const downloadedGames = await listGames(config, platformName).catch(() => [])
  const nextItems: DownloadQueueItem[] = currentDownloadSnapshot.items.map((item) => {
    const downloadedGame = downloadedGames.find((game) => game.id === item.gameId)

    if (downloadedGame?.downloaded) {
      return {
        ...item,
        status: item.status === 'error' ? item.status : 'completed',
        progress: item.status === 'error' ? item.progress : 100,
        bytesTransferred: item.status === 'error' ? item.bytesTransferred : item.totalBytes
      }
    }

    return item
  })

  currentDownloadSnapshot = {
    ...currentDownloadSnapshot,
    active: false,
    overallProgress: calculateOverallProgress(nextItems),
    items: nextItems
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('downloads:progress', currentDownloadSnapshot)
  }
}

const cancelDownload = (gameId: string): DownloadSnapshot => {
  const queueItem = currentDownloadSnapshot.items.find((item) => item.gameId === gameId)

  if (!queueItem || ['completed', 'error'].includes(queueItem.status)) {
    return currentDownloadSnapshot
  }

  cancelledGameIds.add(gameId)

  removeItemFromQueue(gameId)

  if (
    queueItem.status === 'downloading' &&
    activeDownloadingGameId === gameId &&
    activeDownloadClient
  ) {
    activeDownloadClient.abortActiveTransfer()
  }

  return currentDownloadSnapshot
}

const cleanupCancelledDownloadTargets = async (localPaths: string[]): Promise<void> => {
  await Promise.all(
    localPaths.map(async (localPath) => {
      if (!localPath || !existsSync(localPath)) {
        return
      }

      try {
        await unlink(localPath)
      } catch {
        // Ignore cleanup failures for partial files created by cancelled downloads.
      }
    })
  )
}

const clearDownloadQueueHistory = (): DownloadSnapshot => {
  const activeStatuses: DownloadQueueItem['status'][] = ['queued', 'downloading']
  const keptItems = currentDownloadSnapshot.items.filter((item) =>
    activeStatuses.includes(item.status)
  )
  const hasActiveItems = keptItems.some((item) => activeStatuses.includes(item.status))

  currentDownloadSnapshot = {
    ...currentDownloadSnapshot,
    active: hasActiveItems,
    queueId: hasActiveItems ? currentDownloadSnapshot.queueId : null,
    startedAt: hasActiveItems ? currentDownloadSnapshot.startedAt : null,
    overallProgress: calculateOverallProgress(keptItems),
    items: keptItems
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('downloads:progress', currentDownloadSnapshot)
  }

  return currentDownloadSnapshot
}

const startDownloadQueue = (
  config: AppConfig,
  platformName: string,
  games: GameEntry[]
): DownloadSnapshot => {
  if (currentDownloadSnapshot.active) {
    throw new Error('A download is already running.')
  }

  const queueId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

  currentDownloadSnapshot = {
    active: true,
    queueId,
    startedAt: new Date().toISOString(),
    overallProgress: 0,
    items: games.map((game) => ({
      gameId: game.id,
      gameName: game.name,
      platformId: slugify(platformName),
      platformName: game.platformName,
      bytesTransferred: 0,
      totalBytes: game.size,
      progress: 0,
      status: 'queued',
      error: null,
      localPath: game.localPath
    }))
  }

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send('downloads:progress', currentDownloadSnapshot)
  }

  void runDownloadQueue(config, platformName, games)

  return currentDownloadSnapshot
}

ipcMain.handle('app:get-config', async () => readConfigFromDisk())

ipcMain.handle('app:reset-app-data', async () => {
  const resetTargets = [getConfigPath(), getMetadataCachePath(), getLibraryCachePath()]

  await Promise.all(
    resetTargets.map(async (targetPath) => {
      try {
        if (existsSync(targetPath)) {
          await unlink(targetPath)
        }
      } catch {
        // Ignore individual cleanup failures to keep reset best-effort.
      }
    })
  )

  currentDownloadSnapshot = emptySnapshot()
  currentTorrentBrowserSnapshot = { files: [], resolvedNames: {}, sourceErrors: [] }
  currentTorrentDownloadSnapshot = { active: false, items: [] }
  activeDownloadClient = null
  activeDownloadingGameId = null
  cancelledGameIds.clear()
  await Promise.all(
    [...activeTorrentClients.values()].map(async (client) => {
      await destroyTorrentClient(client)
    })
  )
  activeTorrentClients.clear()
  torrentFileLookup.clear()
  igdbTokenCache = null

  try {
    const cachePath = getTorrentBrowserCachePath()

    if (existsSync(cachePath)) {
      await unlink(cachePath)
    }
  } catch {
    // Non-fatal cache cleanup failure.
  }

  return true
})

ipcMain.handle('app:save-config', async (_event, config: Partial<AppConfig>) =>
  saveConfigToDisk(config)
)

ipcMain.handle('app:test-file-service-connection', async (_event, config: Partial<AppConfig>) => {
  const sanitizedConfig = sanitizeConfig(config)

  if (!sanitizedConfig.ftpUrl) {
    throw new Error('Connection URL is required for connection testing.')
  }

  if (sanitizedConfig.fileServiceType === 'romm') {
    if (!sanitizedConfig.rommApiToken) {
      throw new Error('API token is required for RomM connection testing.')
    }
  } else if (!sanitizedConfig.ftpUsername || !sanitizedConfig.ftpPassword) {
    throw new Error('Username and password are required for connection testing.')
  }

  try {
    await withRemote(sanitizedConfig, async (client, basePath) => {
      await client.list(basePath)
    })
    return true
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Connection test failed: ${error.message}`
        : 'Connection test failed.'
    )
  }
})

ipcMain.handle('app:pick-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const directoryPath = result.filePaths[0]
  const testFilePath = join(directoryPath, `.games2-write-test-${Date.now()}.tmp`)
  const testBuffer = Buffer.alloc(1024)

  try {
    await writeFile(testFilePath, testBuffer)

    const fileContents = await readFile(testFilePath)

    if (fileContents.length !== testBuffer.length) {
      throw new Error('Read verification failed.')
    }

    await unlink(testFilePath)
    return directoryPath
  } catch (error) {
    try {
      if (existsSync(testFilePath)) {
        await unlink(testFilePath)
      }
    } catch {
      // Ignore cleanup failures and surface the original validation error.
    }

    throw new Error(
      error instanceof Error
        ? `Directory access test failed: ${error.message}`
        : 'Directory access test failed.'
    )
  }
})

ipcMain.handle('app:pick-torrent-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [{ name: 'Torrent Files', extensions: ['torrent'] }]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  const torrentFilesDir = join(app.getPath('userData'), TORRENT_FILES_DIR_NAME)
  await mkdir(torrentFilesDir, { recursive: true })

  const destPaths: string[] = []
  for (const sourcePath of result.filePaths) {
    const fileName = basename(sourcePath)
    const destPath = join(torrentFilesDir, fileName)
    await copyFile(sourcePath, destPath)
    destPaths.push(destPath)
  }
  return destPaths
})

ipcMain.handle('app:pick-config-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'JSON Config Files', extensions: ['json'] }]
  })

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
})

ipcMain.handle('app:load-config-from-file', async (_event, filePath: string) => {
  try {
    const fileContents = await readFile(filePath, 'utf8')
    const ext = extname(filePath).toLowerCase()
    if (ext !== '.json') {
      throw new Error('Only .json config files are supported.')
    }
    const parsed = JSON.parse(fileContents)
    // Accept both legacy, camelCase, and UPPER_SNAKE_CASE config structure
    let configData: Partial<AppConfig> = {}
    // Prefer UPPER_SNAKE_CASE if present
    const hasSnake =
      parsed.FTP_HOSTNAME || parsed.FTP_PORT || parsed.FTP_PATH || parsed.ROMS_DIRECTORY
    if (hasSnake) {
      const ftpUrl = buildConnectionUrl(
        parsed.FTP_PROTOCOL || parsed.PROTOCOL,
        parsed.FTP_HOSTNAME,
        parsed.FTP_PORT,
        parsed.FTP_PATH
      )
      configData = {
        fileServiceType: (parsed.FILE_SERVICE_TYPE || '').toLowerCase() || undefined,
        ftpUrl,
        ftpUsername: parsed.FTP_USERNAME || '',
        ftpPassword: parsed.FTP_PASSWORD || '',
        rommApiToken: parsed.ROMM_API_TOKEN || '',
        torrentUploadMode: (parsed.TORRENT_UPLOAD_MODE || '').toLowerCase() || undefined,
        inputKeyboardMode:
          (parsed.INPUT_KEYBOARD_MODE || parsed.SHOW_KEYBOARD_FOR_INPUTS || '')
            .toLowerCase()
            .trim() || undefined,
        romsDirectory: parsed.ROMS_DIRECTORY || '',
        twitchClientId: parsed.TWITCH_CLIENT_ID || '',
        twitchClientSecret: parsed.TWITCH_CLIENT_SECRET || ''
      }
    } else if (parsed.ftpHostname || parsed.ftpPort || parsed.ftpPath) {
      // camelCase structure
      const ftpUrl = buildConnectionUrl(
        parsed.ftpProtocol || parsed.protocol,
        parsed.ftpHostname,
        parsed.ftpPort,
        parsed.ftpPath
      )
      configData = {
        ...parsed,
        fileServiceType: (parsed.fileServiceType || '').toLowerCase() || undefined,
        ftpUrl,
        ftpUsername: parsed.ftpUsername || '',
        ftpPassword: parsed.ftpPassword || '',
        rommApiToken: parsed.rommApiToken || '',
        torrentUploadMode: (parsed.torrentUploadMode || '').toLowerCase() || undefined,
        inputKeyboardMode:
          (parsed.inputKeyboardMode || parsed.showKeyboardForInputs || '').toLowerCase().trim() ||
          undefined,
        romsDirectory: parsed.romsDirectory || '',
        twitchClientId: parsed.twitchClientId || '',
        twitchClientSecret: parsed.twitchClientSecret || ''
      }
    } else {
      // Legacy: expect ftpUrl, etc.
      configData = parsed
    }
    return sanitizeConfig(configData)
  } catch (error) {
    throw new Error(
      `Failed to load config from file: ${error instanceof Error ? error.message : String(error)}`
    )
  }
})

ipcMain.handle('app:quit', async () => {
  app.quit()
})

ipcMain.handle('system:open-onscreen-keyboard', async () => {
  if (process.platform !== 'win32') {
    return false
  }

  try {
    const child = spawn('osk.exe', [], {
      detached: true,
      stdio: 'ignore'
    })
    child.unref()
    return true
  } catch {
    return false
  }
})

ipcMain.handle('app:test-twitch-connection', async (_event, config: AppConfig) => {
  return testTwitchConnection(config)
})

ipcMain.handle('library:list-platforms', async () => {
  const config = await readConfigFromDisk()
  assertConfigured(config)
  return listPlatforms(config)
})

ipcMain.handle('library:get-cache', async () => {
  return readLibraryCache()
})

ipcMain.handle(
  'library:list-games',
  async (
    _event,
    platformName: string,
    options?: { fetchMissingMetadata?: boolean; forceRefetchMetadata?: boolean }
  ) => {
    const config = await readConfigFromDisk()
    assertConfigured(config)
    return listGames(config, platformName, options)
  }
)

ipcMain.handle('library:delete-local-file', async (_event, localPath: string) => {
  if (!localPath) {
    return false
  }

  try {
    if (!existsSync(localPath)) {
      return false
    }

    await unlink(localPath)
    return true
  } catch {
    return false
  }
})

ipcMain.handle(
  'metadata:fetch-game',
  async (_event, platformName: string, romFileName: string, forceRefetch?: boolean) => {
    const config = await readConfigFromDisk()
    return fetchMetadataForSingleGame(config, platformName, romFileName, Boolean(forceRefetch))
  }
)

ipcMain.handle('metadata:search-games', async (_event, platformName: string, query: string) => {
  const config = await readConfigFromDisk()
  assertConfigured(config)
  return searchIgdbGames(config, platformName, query)
})

ipcMain.handle(
  'metadata:manual-match-game',
  async (
    _event,
    platformName: string,
    romFileName: string,
    matchedName: string,
    matchedCoverUrl: string | null
  ) => {
    const config = await readConfigFromDisk()
    assertConfigured(config)

    if (!matchedName.trim()) {
      throw new Error('Matched name is required.')
    }

    return applyManualMetadataMatch(platformName, romFileName, matchedName.trim(), matchedCoverUrl)
  }
)

ipcMain.handle('downloads:start', async (_event, platformName: string, games: GameEntry[]) => {
  const config = await readConfigFromDisk()
  assertConfigured(config)
  return startDownloadQueue(config, platformName, games)
})

ipcMain.handle('downloads:cancel', async (_event, gameId: string) => cancelDownload(gameId))

ipcMain.handle('downloads:clear-history', async () => clearDownloadQueueHistory())

ipcMain.handle('downloads:get-state', async () => currentDownloadSnapshot)

ipcMain.handle('torrents:get-browser-state', async () => {
  const config = await readConfigFromDisk()

  if (currentTorrentBrowserSnapshot.files.length === 0) {
    const cached = await readTorrentBrowserCache()

    if (cached) {
      currentTorrentBrowserSnapshot = cached
      for (const file of cached.files) {
        torrentFileLookup.set(file.id, {
          source: config.torrentSources.find((s) => s.id === file.torrentId) ?? {
            id: file.torrentId,
            label: file.torrentLabel,
            sourceType: 'magnet',
            source: ''
          },
          relativePath: file.relativePath,
          fileName: file.fileName,
          size: file.size,
          platformName: file.platformName,
          matchedPlatformName: file.matchedPlatformName,
          matchedPlatformSourceName: file.matchedPlatformSourceName
        })
      }

      void refreshTorrentBrowserState(config)
      return currentTorrentBrowserSnapshot
    }
  }

  return refreshTorrentBrowserState(config)
})

ipcMain.handle('torrents:get-download-state', async () => currentTorrentDownloadSnapshot)

ipcMain.handle('torrents:download-file', async (_event, torrentFileId: string) => {
  const config = await readConfigFromDisk()
  return queueTorrentFileDownload(config, torrentFileId)
})

ipcMain.handle('torrents:cancel-download', async (_event, torrentFileId: string) => {
  const client = activeTorrentClients.get(torrentFileId)

  if (client) {
    activeTorrentClients.delete(torrentFileId)
    await destroyTorrentClient(client)
  }

  // Mark as cancelled so the in-flight runTorrentFileDownload can detect it and bail out,
  // then immediately remove it from the list.
  updateTorrentDownloadItem(torrentFileId, (item) => ({
    ...item,
    status: 'cancelled',
    error: null
  }))

  const kept = currentTorrentDownloadSnapshot.items.filter(
    (item) => item.torrentFileId !== torrentFileId
  )
  setTorrentDownloadItems(kept)

  return currentTorrentDownloadSnapshot
})

ipcMain.handle('torrents:clear-history', async () => {
  const activeStatuses = ['queued', 'downloading', 'extracting']
  const kept = currentTorrentDownloadSnapshot.items.filter((item) =>
    activeStatuses.includes(item.status)
  )
  setTorrentDownloadItems(kept)
  return currentTorrentDownloadSnapshot
})

ipcMain.handle('torrents:refresh-browser-state', async () => {
  const config = await readConfigFromDisk()
  return refreshTorrentBrowserState(config)
})

ipcMain.handle('torrents:list-platforms', async () => getTorrentPlatforms())

ipcMain.handle('torrents:list-games', async (_event, platformSourceName: string) => {
  const config = await readConfigFromDisk()
  return getTorrentGames(config, platformSourceName)
})

const resolveWindowIconPath = (): string => {
  const developmentIconPath = join(__dirname, '../../resources/icon.png')

  if (existsSync(developmentIconPath)) {
    return developmentIconPath
  }

  return join(process.resourcesPath, 'icon.png')
}

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    fullscreen: false,
    fullscreenable: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#121a20',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    icon: resolveWindowIconPath()
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.romloader.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  ipcMain.on('ping', () => console.log('pong'))

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
