import type { AppConfig, DownloadSnapshot } from '../../../shared/types'

export const emptyConfig: AppConfig = {
  romsDirectory: '',
  twitchClientId: '',
  twitchAccessToken: '',
  twitchClientSecret: '',
  fileServiceType: 'ftp',
  ftpUrl: '',
  ftpUsername: '',
  ftpPassword: '',
  rommApiToken: '',
  inputKeyboardMode: 'gamepad'
}

export const emptySnapshot: DownloadSnapshot = {
  active: false,
  queueId: null,
  startedAt: null,
  overallProgress: 0,
  items: []
}

export const hasRequiredSetup = (config: AppConfig): boolean => {
  if (!config.romsDirectory || !config.ftpUrl) {
    return false
  }

  if (config.fileServiceType === 'romm') {
    return Boolean(config.rommApiToken)
  }

  return Boolean(config.ftpUsername && config.ftpPassword)
}

export const formatBytes = (value: number): string => {
  if (!value) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1)
  const normalizedValue = value / 1024 ** unitIndex

  return `${normalizedValue.toFixed(normalizedValue >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}
