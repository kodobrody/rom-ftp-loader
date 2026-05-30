import { electronApp, is, optimizer } from '@electron-toolkit/utils'
import { Client, FileType } from 'basic-ftp'
import { spawn } from 'child_process'
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron'
import { existsSync } from 'fs'
import { mkdir, readdir, readFile, stat, unlink, writeFile } from 'fs/promises'
import { dirname, extname, join, posix } from 'path'
import SftpClient from 'ssh2-sftp-client'
import type {
  AppConfig,
  DownloadQueueItem,
  DownloadSnapshot,
  GameEntry,
  GameMetadataUpdate,
  LibraryCacheSnapshot,
  PlatformSummary
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
  TWITCH_TOKEN_URL
} from './constants'

let mainWindow: BrowserWindow | null = null
let currentDownloadSnapshot: DownloadSnapshot = emptySnapshot()
let activeDownloadClient: RemoteClient | null = null
let activeDownloadingGameId: string | null = null
const cancelledGameIds = new Set<string>()

type RemoteProtocol = 'ftp' | 'ftps' | 'sftp'

interface ParsedRemoteLocation {
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

    console.log(`[Twitch] Searching metadata for "${searchName}" (from "${fallbackName}")`)

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
  } catch (error) {
    console.error(`[IGDB] Metadata fetch failed for "${fallbackName}": ${getErrorMessage(error)}`)

    return {
      displayName: titleCasePlatformName(fallbackName),
      coverUrl: null,
      cleanedName: fallbackName,
      status: 'error',
      fetchedAt: new Date().toISOString()
    }
  }
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
  return {
    romsDirectory: config.romsDirectory?.trim() ?? '',
    twitchClientId: config.twitchClientId?.trim() ?? '',
    twitchAccessToken: normalizeTwitchAccessToken(config.twitchAccessToken),
    twitchClientSecret: normalizeTwitchClientSecret(config.twitchClientSecret),
    ftpUrl: config.ftpUrl?.trim() ?? '',
    ftpUsername: config.ftpUsername?.trim() ?? '',
    ftpPassword: config.ftpPassword ?? ''
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
  return Boolean(config.romsDirectory && config.ftpUrl && config.ftpUsername && config.ftpPassword)
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
  const remote = parseRemoteLocation(config.ftpUrl)
  const client =
    remote.protocol === 'sftp'
      ? await connectSftpClient(config, remote)
      : await connectFtpClient(config, remote)

  try {
    return await action(client, remote.basePath)
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
        fetchMissingMetadata && (forceRefetchMetadata || typeof metadata === 'undefined')

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
      console.log(`[IGDB] Fetched ${fetchedCount} metadata entries for ${platformName}`)
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

  if (cachedMetadata && !forceRefetch) {
    return {
      romFileName,
      displayName: cachedMetadata.displayName,
      coverUrl: cachedMetadata.coverUrl,
      cleanedName: cachedMetadata.cleanedName,
      status: cachedMetadata.status
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

const clearMetadataForPlatform = async (platformName: string): Promise<number> => {
  const metadataCache = await readMetadataCache()
  const platformKeyPrefix = `${normalizePlatformKey(platformName)}::`
  let deletedCount = 0

  for (const cacheKey of Object.keys(metadataCache.entries)) {
    if (cacheKey.startsWith(platformKeyPrefix)) {
      delete metadataCache.entries[cacheKey]
      deletedCount += 1
    }
  }

  if (deletedCount > 0) {
    await saveMetadataCache(metadataCache)
  }

  return deletedCount
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

ipcMain.handle('app:save-config', async (_event, config: Partial<AppConfig>) =>
  saveConfigToDisk(config)
)

ipcMain.handle('app:test-ftp-connection', async (_event, config: Partial<AppConfig>) => {
  const sanitizedConfig = sanitizeConfig(config)

  if (!sanitizedConfig.ftpUrl || !sanitizedConfig.ftpUsername || !sanitizedConfig.ftpPassword) {
    throw new Error('Connection URL, username, and password are required for connection testing.')
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
        ftpUrl,
        ftpUsername: parsed.FTP_USERNAME || '',
        ftpPassword: parsed.FTP_PASSWORD || '',
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
        ftpUrl,
        ftpUsername: parsed.ftpUsername || '',
        ftpPassword: parsed.ftpPassword || '',
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
    assertConfigured(config)
    return fetchMetadataForSingleGame(config, platformName, romFileName, Boolean(forceRefetch))
  }
)

ipcMain.handle('metadata:clear-platform', async (_event, platformName: string) => {
  const config = await readConfigFromDisk()
  assertConfigured(config)
  return clearMetadataForPlatform(platformName)
})

ipcMain.handle('downloads:start', async (_event, platformName: string, games: GameEntry[]) => {
  const config = await readConfigFromDisk()
  assertConfigured(config)
  return startDownloadQueue(config, platformName, games)
})

ipcMain.handle('downloads:cancel', async (_event, gameId: string) => cancelDownload(gameId))

ipcMain.handle('downloads:clear-history', async () => clearDownloadQueueHistory())

ipcMain.handle('downloads:get-state', async () => currentDownloadSnapshot)

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    fullscreen: true,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#121a20',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    },
    icon: join(__dirname, '../resources/icon.png')
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
  electronApp.setAppUserModelId('com.electron')

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
