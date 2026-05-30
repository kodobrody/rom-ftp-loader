import { faFloppyDisk, faFolder, faServer } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip, Input, Label, ListBox, Select } from '@heroui/react'
import React, { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSetupStore } from '../store/setupStore'
import { hasRequiredSetup } from '../utils/formatting'

const normalizePathInput = (pathInput: string): string => {
  const trimmed = pathInput.trim()

  if (!trimmed || trimmed === '/') {
    return '/'
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`
}

type ConnectionProtocol = 'ftp' | 'ftps' | 'sftp'

const getDefaultPort = (protocol: ConnectionProtocol): string => {
  if (protocol === 'sftp') {
    return '22'
  }

  if (protocol === 'ftps') {
    return '990'
  }

  return '21'
}

const parseProtocol = (value: string): ConnectionProtocol => {
  const normalized = value.toLowerCase().replace(':', '')

  if (normalized === 'sftp') {
    return 'sftp'
  }

  if (normalized === 'ftps') {
    return 'ftps'
  }

  return 'ftp'
}

const parseFtpParts = (
  ftpUrl: string
): { protocol: ConnectionProtocol; hostname: string; port: string; path: string } => {
  const fallback = { protocol: 'ftp' as const, hostname: '', port: '21', path: '/' }

  if (!ftpUrl.trim()) {
    return fallback
  }

  try {
    const normalizedUrl = ftpUrl.includes('://') ? ftpUrl : `ftp://${ftpUrl}`
    const parsedUrl = new URL(normalizedUrl)
    const protocol = parseProtocol(parsedUrl.protocol)

    return {
      protocol,
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || getDefaultPort(protocol),
      path: normalizePathInput(parsedUrl.pathname)
    }
  } catch {
    const detectedProtocol = ftpUrl.trim().match(/^(ftp|ftps|sftp):\/\//i)?.[1] || 'ftp'
    const protocol = parseProtocol(detectedProtocol)
    const withoutProtocol = ftpUrl.trim().replace(/^(?:ftp|ftps|sftp):\/\//i, '')
    const slashIndex = withoutProtocol.indexOf('/')
    const hostAndPort = slashIndex >= 0 ? withoutProtocol.slice(0, slashIndex) : withoutProtocol
    const path = slashIndex >= 0 ? withoutProtocol.slice(slashIndex) : '/'
    const hostPortMatch = hostAndPort.match(/^(.*?)(?::(\d+))?$/)

    return {
      protocol,
      hostname: (hostPortMatch?.[1] || '').trim(),
      port: hostPortMatch?.[2] || getDefaultPort(protocol),
      path: normalizePathInput(path)
    }
  }
}

const buildFtpUrl = (
  protocolInput: ConnectionProtocol,
  hostnameInput: string,
  portInput: string,
  pathInput: string
): string => {
  const protocol = parseProtocol(protocolInput)
  const hostname = hostnameInput.trim().replace(/^(?:ftp|ftps|sftp):\/\//i, '').replace(/\/.*/, '')

  if (!hostname) {
    return ''
  }

  const parsedPort = Number.parseInt(portInput, 10)
  const defaultPort = getDefaultPort(protocol)
  const normalizedPort =
    Number.isFinite(parsedPort) && parsedPort > 0 ? String(parsedPort) : defaultPort
  const path = normalizePathInput(pathInput)
  const portSegment = normalizedPort === defaultPort ? '' : `:${normalizedPort}`

  return `${protocol}://${hostname}${portSegment}${path}`
}

export const SetupScreen = (): React.JSX.Element => {
  const navigate = useNavigate()
  const {
    config,
    configFileLoading,
    directoryPicking,
    ftpTesting,
    loadConfigFromFile,
    pickDirectory,
    saveConfig,
    saving,
    testFtpConnection,
    updateConfig
  } = useSetupStore()

  const setupReady = useMemo(() => hasRequiredSetup(config), [config])
  const twitchReady = Boolean(config.twitchClientId && config.twitchClientSecret)
  const ftpParts = useMemo(() => parseFtpParts(config.ftpUrl), [config.ftpUrl])

  const handleSaveSubmit = async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    const saved = await saveConfig(event)

    if (saved) {
      navigate('/')
    }
  }

  return (
    <section className="setup-layout grid gap-4 lg:grid-cols-[1.25fr_1fr]">
      <Card>
        <Card.Content className="gap-4 p-5 justify-start">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">First screen</p>
          <h2 className="text-2xl font-semibold text-zinc-100">Point the app at your ROM folder and server source</h2>
          <p className="text-sm text-zinc-300">
            Save the local ROM directory and connection details once. Twitch credentials are
            optional and only used for IGDB names and cover art.
          </p>
          <div className="grid gap-3">
            <div className="grid gap-1 rounded-xl bg-white/5 p-3">
              <strong className="text-sm text-zinc-100">
                {config.romsDirectory ? 'Directory ready' : 'Directory missing'}
              </strong>
              <span className="text-sm text-zinc-400">Local files in the selected folder are marked as downloaded.</span>
            </div>
            <div className="grid gap-1 rounded-xl bg-white/5 p-3">
              <strong className="text-sm text-zinc-100">{config.ftpUrl ? 'Server ready' : 'Server missing'}</strong>
              <span className="text-sm text-zinc-400">
                Use ftp://host/path, ftps://host/path, or sftp://host/path if your ROM root is not the server root.
              </span>
            </div>
            <div className="grid gap-1 rounded-xl bg-white/5 p-3">
              <strong className="text-sm text-zinc-100">{twitchReady ? 'Twitch ready' : 'Twitch optional'}</strong>
              <span className="text-sm text-zinc-400">Provide Client ID and Client Secret to resolve names and cover art.</span>
            </div>
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="grid gap-4 p-5">
          <form className="grid gap-4" onSubmit={(event) => void handleSaveSubmit(event)}>
            <section className="grid gap-3 rounded-xl bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Config loader (Optional)</p>
              <div className="flex flex-wrap gap-3">
                <Button
                  autoFocus
                  isDisabled={configFileLoading}
                  onPress={() => {
                    void loadConfigFromFile()
                  }}
                  variant="tertiary"
                >
                  {configFileLoading ? 'Loading...' : 'Load config from file'}
                </Button>
              </div>
            </section>

            <section className="grid gap-3 rounded-xl bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">ROM directory</p>
              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">ROM directory</span>
                <Input
                  className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                  value={config.romsDirectory}
                  onChange={(event) => updateConfig({ romsDirectory: event.target.value })}
                  placeholder="C:\\Roms"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button
                  isDisabled={directoryPicking}
                  onPress={() => {
                    void pickDirectory()
                  }}
                  variant="tertiary"
                >
                  <FontAwesomeIcon icon={faFolder} />
                  {directoryPicking ? 'Picking...' : 'Pick directory'}
                </Button>
              </div>
            </section>

            <section className="grid gap-3 rounded-xl bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">Server connection</p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1">
                  <Select
                    aria-label="Protocol"
                    className="w-full"
                    selectedKey={ftpParts.protocol}
                    onSelectionChange={(value) => {
                      const nextProtocol = parseProtocol(String(value))
                      updateConfig({
                        ftpUrl: buildFtpUrl(nextProtocol, ftpParts.hostname, ftpParts.port, ftpParts.path)
                      })
                    }}
                  >
                    <Label>Protocol</Label>
                    <Select.Trigger>
                      <Select.Value />
                      <Select.Indicator />
                    </Select.Trigger>
                    <Select.Popover>
                      <ListBox>
                        <ListBox.Item id="ftp" textValue="FTP">
                          FTP
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="ftps" textValue="FTPS">
                          FTPS
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                        <ListBox.Item id="sftp" textValue="SFTP">
                          SFTP
                          <ListBox.ItemIndicator />
                        </ListBox.Item>
                      </ListBox>
                    </Select.Popover>
                  </Select>
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Hostname</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={ftpParts.hostname}
                    onChange={(event) => {
                      const rawHostname = event.target.value
                      const withoutProtocol = rawHostname.trim().replace(/^(?:ftp|ftps|sftp):\/\//i, '')
                      const slashIndex = withoutProtocol.indexOf('/')
                      const hostPortSegment =
                        slashIndex >= 0 ? withoutProtocol.slice(0, slashIndex) : withoutProtocol
                      const pathSegment =
                        slashIndex >= 0 ? withoutProtocol.slice(slashIndex) : ftpParts.path
                      const hostPortMatch = hostPortSegment.match(/^(.*?)(?::(\d+))?$/)
                      const hostname = (hostPortMatch?.[1] || '').trim()
                      const port = hostPortMatch?.[2] || ftpParts.port

                      updateConfig({
                        ftpUrl: buildFtpUrl(ftpParts.protocol, hostname, port, pathSegment)
                      })
                    }}
                    placeholder="example.com"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Port</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={ftpParts.port}
                    onChange={(event) => {
                      const nextPort = event.target.value.replace(/[^\d]/g, '')
                      updateConfig({
                        ftpUrl: buildFtpUrl(
                          ftpParts.protocol,
                          ftpParts.hostname,
                          nextPort || getDefaultPort(ftpParts.protocol),
                          ftpParts.path
                        )
                      })
                    }}
                    placeholder={getDefaultPort(ftpParts.protocol)}
                  />
                </label>

                <label className="grid gap-1 md:col-span-2">
                  <span className="text-sm text-zinc-300">Path</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={ftpParts.path}
                    onChange={(event) => {
                      updateConfig({
                        ftpUrl: buildFtpUrl(
                          ftpParts.protocol,
                          ftpParts.hostname,
                          ftpParts.port,
                          event.target.value
                        )
                      })
                    }}
                    placeholder="/"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">FTP username</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={config.ftpUsername}
                    onChange={(event) => updateConfig({ ftpUsername: event.target.value })}
                    placeholder="Username"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">FTP password</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    type="password"
                    value={config.ftpPassword}
                    onChange={(event) => updateConfig({ ftpPassword: event.target.value })}
                    placeholder="Password"
                  />
                </label>
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  isDisabled={ftpTesting}
                  onPress={() => {
                    void testFtpConnection()
                  }}
                  variant="tertiary"
                >
                  <FontAwesomeIcon icon={faServer} />
                  {ftpTesting ? 'Testing...' : 'Test connection'}
                </Button>
              </div>
            </section>

            <section className="grid gap-3 rounded-xl bg-white/5 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-400">
                Twitch client
                <br />
                (optional, needed for fetching metadata)
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Twitch Client ID</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={config.twitchClientId}
                    onChange={(event) => updateConfig({ twitchClientId: event.target.value })}
                    placeholder="Twitch Client ID"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Twitch Client Secret</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    type="password"
                    value={config.twitchClientSecret}
                    onChange={(event) => updateConfig({ twitchClientSecret: event.target.value })}
                    placeholder="Twitch Client Secret"
                  />
                </label>
              </div>
            </section>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button isDisabled={saving} type="submit" variant="primary">
                <FontAwesomeIcon icon={faFloppyDisk} />
                {saving ? 'Saving...' : 'Save setup'}
              </Button>
              <Chip color={setupReady ? 'success' : 'warning'} size="md" variant="soft">
                {setupReady
                  ? 'All required fields are present.'
                  : 'Fill the ROM and connection fields to continue to the platform grid.'}
              </Chip>
            </div>
          </form>
        </Card.Content>
      </Card>
    </section>
  )
}
