import { PlatformDefinition } from '.'
import { AppConfig, DownloadSnapshot } from '../shared/types'

export const GENERIC_ROM_EXTENSIONS = [
  '7z',
  'bin',
  'cdi',
  'chd',
  'cue',
  'cso',
  'gb',
  'gba',
  'gbc',
  'gcm',
  'gen',
  'img',
  'iso',
  'md',
  'n64',
  'nds',
  'nes',
  'nrg',
  'pbp',
  'pkg',
  'rom',
  'sfc',
  'smc',
  'v64',
  'vpk',
  'wbfs',
  'wua',
  'wud',
  'wux',
  'xci',
  'zip',
  'z64'
]

export const PLATFORM_DEFINITIONS: PlatformDefinition[] = [
  {
    displayName: 'PlayStation',
    aliases: ['ps1', 'psx', 'playstation', 'sonyplaystation'],
    extensions: ['bin', 'chd', 'cue', 'img', 'iso', 'mdf', 'pbp'],
    igdbPlatformIds: [7]
  },
  {
    displayName: 'PlayStation 2',
    aliases: ['ps2', 'playstation2', 'sonyplaystation2'],
    extensions: ['bin', 'chd', 'cue', 'img', 'iso', 'mdf', 'nrg'],
    igdbPlatformIds: [8]
  },
  {
    displayName: 'PlayStation 3',
    aliases: ['ps3', 'playstation3', 'sonyplaystation3'],
    extensions: ['iso', 'pkg'],
    igdbPlatformIds: [9]
  },
  {
    displayName: 'PlayStation 4',
    aliases: ['ps4', 'playstation4', 'sonyplaystation4'],
    extensions: ['iso', 'pkg'],
    igdbPlatformIds: [48]
  },
  {
    displayName: 'PlayStation 5',
    aliases: ['ps5', 'playstation5', 'sonyplaystation5'],
    extensions: ['iso', 'pkg'],
    igdbPlatformIds: [167]
  },
  {
    displayName: 'PSP',
    aliases: ['psp', 'playstationportable'],
    extensions: ['cso', 'iso', 'pbp'],
    igdbPlatformIds: [38]
  },
  {
    displayName: 'PS Vita',
    aliases: ['psvita', 'vita', 'playstationvita'],
    extensions: ['vpk'],
    igdbPlatformIds: [46]
  },
  {
    displayName: 'Nintendo Entertainment System',
    aliases: ['nes', 'nintendoentertainmentsystem'],
    extensions: ['fds', 'nes', 'zip'],
    igdbPlatformIds: [18]
  },
  {
    displayName: 'Super Nintendo',
    aliases: ['snes', 'supernintendo', 'superfamicom'],
    extensions: ['fig', 'sfc', 'smc', 'zip'],
    igdbPlatformIds: [19]
  },
  {
    displayName: 'Nintendo 64',
    aliases: ['n64', 'nintendo64'],
    extensions: ['n64', 'v64', 'z64'],
    igdbPlatformIds: [4]
  },
  {
    displayName: 'Game Boy',
    aliases: ['gb', 'gameboy'],
    extensions: ['gb', 'zip'],
    igdbPlatformIds: [33]
  },
  {
    displayName: 'Game Boy Color',
    aliases: ['gbc', 'gameboycolor'],
    extensions: ['gbc', 'zip'],
    igdbPlatformIds: [22]
  },
  {
    displayName: 'Game Boy Advance',
    aliases: ['gba', 'gameboyadvance'],
    extensions: ['gba', 'zip'],
    igdbPlatformIds: [24]
  },
  {
    displayName: 'Nintendo DS',
    aliases: ['ds', 'nds', 'nintendods'],
    extensions: ['nds', 'zip'],
    igdbPlatformIds: [20]
  },
  {
    displayName: 'Nintendo 3DS',
    aliases: ['3ds', 'n3ds', 'nintendo3ds'],
    extensions: ['3ds', 'cci', 'cxi'],
    igdbPlatformIds: [37]
  },
  {
    displayName: 'Nintendo GameCube',
    aliases: ['gamecube', 'gc', 'ngc'],
    extensions: ['gcm', 'iso'],
    igdbPlatformIds: [21]
  },
  {
    displayName: 'Nintendo Wii',
    aliases: ['wii'],
    extensions: ['ciso', 'iso', 'wbfs'],
    igdbPlatformIds: [5]
  },
  {
    displayName: 'Nintendo Wii U',
    aliases: ['wiiu', 'nintendowiiu'],
    extensions: ['app', 'wua', 'wud', 'wux'],
    igdbPlatformIds: [41]
  },
  {
    displayName: 'Nintendo Switch',
    aliases: ['switch', 'nintendoswitch', 'nsw'],
    extensions: ['nsp', 'nsz', 'xci'],
    igdbPlatformIds: [130]
  },
  {
    displayName: 'Sega Genesis',
    aliases: ['genesis', 'megadrive', 'segagenesis', 'segamegadrive', 'md'],
    extensions: ['bin', 'gen', 'md', 'smd', 'zip'],
    igdbPlatformIds: [29]
  },
  {
    displayName: 'Sega CD',
    aliases: ['segacd', 'megacd'],
    extensions: ['bin', 'chd', 'cue', 'iso'],
    igdbPlatformIds: [78]
  },
  {
    displayName: 'Sega Saturn',
    aliases: ['saturn', 'segasaturn'],
    extensions: ['bin', 'chd', 'cue', 'iso'],
    igdbPlatformIds: [32]
  },
  {
    displayName: 'Dreamcast',
    aliases: ['dreamcast', 'segadreamcast', 'dc'],
    extensions: ['cdi', 'chd', 'gdi'],
    igdbPlatformIds: [23]
  }
]

export const CONFIG_FILE_NAME = 'launcher-config.json'
export const METADATA_CACHE_FILE_NAME = 'igdb-rom-cache.json'
export const IGDB_GAMES_URL = 'https://api.igdb.com/v4/games'
export const TWITCH_TOKEN_URL = 'https://id.twitch.tv/oauth2/token'
export const fetchFromMain = globalThis.fetch?.bind(globalThis)

export const emptyConfig = (): AppConfig => ({
  romsDirectory: '',
  twitchClientId: '',
  twitchAccessToken: '',
  twitchClientSecret: '',
  ftpUrl: '',
  ftpUsername: '',
  ftpPassword: ''
})

export const emptySnapshot = (): DownloadSnapshot => ({
  active: false,
  queueId: null,
  startedAt: null,
  overallProgress: 0,
  items: []
})
