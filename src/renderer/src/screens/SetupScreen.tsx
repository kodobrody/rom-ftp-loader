import { faFolder, faImage, faPenToSquare, faPlus, faServer, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Input, Label, ListBox, Modal, Select } from '@heroui/react'
import React, { useMemo, useState } from 'react'
import type { AppConfig } from '../../../shared/types'
import { useAppStateStore } from '../store/appStateStore'
import { useSetupStore } from '../store/setupStore'

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

interface ConnectionDraft {
  protocol: ConnectionProtocol
  hostname: string
  port: string
  path: string
  username: string
  password: string
}

const createConnectionDraft = (config: AppConfig): ConnectionDraft => {
  const ftpParts = parseFtpParts(config.ftpUrl)

  return {
    ...ftpParts,
    username: config.ftpUsername,
    password: config.ftpPassword
  }
}

interface IgdbDraft {
  clientId: string
  clientSecret: string
}

const createIgdbDraft = (config: AppConfig): IgdbDraft => ({
  clientId: config.twitchClientId,
  clientSecret: config.twitchClientSecret
})

export const SetupScreen = (): React.JSX.Element => {
  const {
    config,
    configFileLoading,
    directoryPicking,
    loadConfigFromFile,
    pickDirectory,
    persistConfig,
    updateConfig
  } = useSetupStore()
  const { setErrorMessage, setInfoMessage } = useAppStateStore()
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [showDeleteConnectionModal, setShowDeleteConnectionModal] = useState(false)
  const [connectionDraft, setConnectionDraft] = useState<ConnectionDraft>(() =>
    createConnectionDraft(config)
  )
  const [connectionModalError, setConnectionModalError] = useState<string | null>(null)
  const [connectionSaving, setConnectionSaving] = useState(false)
  const [showIgdbModal, setShowIgdbModal] = useState(false)
  const [showDeleteIgdbModal, setShowDeleteIgdbModal] = useState(false)
  const [igdbDraft, setIgdbDraft] = useState<IgdbDraft>(() => createIgdbDraft(config))
  const [igdbModalError, setIgdbModalError] = useState<string | null>(null)
  const [igdbSaving, setIgdbSaving] = useState(false)

  const twitchReady = Boolean(config.twitchClientId && config.twitchClientSecret)
  const ftpParts = useMemo(() => parseFtpParts(config.ftpUrl), [config.ftpUrl])
  const hasConnection = Boolean(config.ftpUrl && config.ftpUsername && config.ftpPassword)
  const hasIgdbConnection = Boolean(config.twitchClientId && config.twitchClientSecret)
  const igdbDraftReady = Boolean(igdbDraft.clientId.trim() && igdbDraft.clientSecret.trim())

  const openConnectionModal = (): void => {
    setConnectionDraft(createConnectionDraft(config))
    setConnectionModalError(null)
    setShowConnectionModal(true)
  }

  const closeConnectionModal = (): void => {
    if (connectionSaving) {
      return
    }

    setConnectionModalError(null)
    setShowConnectionModal(false)
  }

  const handleSaveConnection = async (): Promise<void> => {
    const nextConfig = {
      ...config,
      ftpUrl: buildFtpUrl(
        connectionDraft.protocol,
        connectionDraft.hostname,
        connectionDraft.port,
        connectionDraft.path
      ),
      ftpUsername: connectionDraft.username.trim(),
      ftpPassword: connectionDraft.password
    }

    if (!nextConfig.ftpUrl || !nextConfig.ftpUsername || !nextConfig.ftpPassword) {
      setConnectionModalError('Fill in hostname, username, and password to connect.')
      return
    }

    setConnectionSaving(true)
    setConnectionModalError(null)
    setErrorMessage(null)
    setInfoMessage(null)

    try {
      await window.api.testFtpConnection(nextConfig)
      const savedConfig = await persistConfig({
        ftpUrl: nextConfig.ftpUrl,
        ftpUsername: nextConfig.ftpUsername,
        ftpPassword: nextConfig.ftpPassword
      }, { refreshLibrary: true })

      if (savedConfig) {
        setShowConnectionModal(false)
      }
    } catch (error) {
      setConnectionModalError(
        error instanceof Error ? error.message : 'Failed to connect to the selected service.'
      )
    } finally {
      setConnectionSaving(false)
    }
  }

  const handleDeleteConnection = async (): Promise<void> => {
    const savedConfig = await persistConfig({
      ftpUrl: '',
      ftpUsername: '',
      ftpPassword: ''
    }, { refreshLibrary: true })

    if (savedConfig) {
      setErrorMessage(null)
      setInfoMessage(null)
      setShowDeleteConnectionModal(false)
    }
  }

  const openIgdbModal = (): void => {
    setIgdbDraft(createIgdbDraft(config))
    setIgdbModalError(null)
    setShowIgdbModal(true)
  }

  const closeIgdbModal = (): void => {
    if (igdbSaving) {
      return
    }

    setIgdbModalError(null)
    setShowIgdbModal(false)
  }

  const handleSaveIgdbConnection = async (): Promise<void> => {
    const nextConfig = {
      ...config,
      twitchClientId: igdbDraft.clientId.trim(),
      twitchClientSecret: igdbDraft.clientSecret.trim(),
      twitchAccessToken: ''
    }

    if (!nextConfig.twitchClientId || !nextConfig.twitchClientSecret) {
      setIgdbModalError('Fill in Client ID and Client Secret to connect.')
      return
    }

    setIgdbSaving(true)
    setIgdbModalError(null)
    setErrorMessage(null)
    setInfoMessage(null)

    try {
      const savedConfig = await persistConfig({
        twitchClientId: nextConfig.twitchClientId,
        twitchClientSecret: nextConfig.twitchClientSecret,
        twitchAccessToken: ''
      })

      if (savedConfig) {
        setShowIgdbModal(false)
      }
    } catch (error) {
      setIgdbModalError(
        error instanceof Error ? error.message : 'Failed to connect to IGDB via Twitch API.'
      )
    } finally {
      setIgdbSaving(false)
    }
  }

  const handleDeleteIgdbConnection = async (): Promise<void> => {
    const savedConfig = await persistConfig({
      twitchClientId: '',
      twitchClientSecret: '',
      twitchAccessToken: ''
    })

    if (savedConfig) {
      setErrorMessage(null)
      setInfoMessage(null)
      setShowDeleteIgdbModal(false)
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
          <div className="grid gap-4">
            <div className="grid gap-2">
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                <span className="text-sm text-zinc-300">Config loader (optional)</span>
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
            </div>

            <div className="grid gap-2">
              <label className="grid gap-1">
                <span className="text-sm text-zinc-300">Local game path</span>
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={config.romsDirectory}
                    onChange={(event) => updateConfig({ romsDirectory: event.target.value })}
                    onBlur={(event) => {
                      const nextPath = event.target.value.trim()

                      if (nextPath !== config.romsDirectory) {
                        void persistConfig(
                          { romsDirectory: nextPath },
                          { refreshLibrary: true }
                        )
                      }
                    }}
                    placeholder="C:\\Roms"
                  />
                  <Button
                    isDisabled={directoryPicking}
                    onPress={() => {
                      void pickDirectory()
                    }}
                    variant="primary"
                  >
                    <FontAwesomeIcon icon={faFolder} />
                    {directoryPicking ? 'Picking...' : 'Pick directory'}
                  </Button>
                </div>
              </label>
            </div>

            {!hasConnection ? (
              <Button
                className="h-auto w-full items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-6 text-center"
                onPress={openConnectionModal}
                variant="tertiary"
              >
                <FontAwesomeIcon className="text-zinc-400" icon={faPlus} />
                <span className="text-zinc-400">Add File Service Connection</span>
              </Button>
            ) : (
              <Card className="bg-white/5">
                <Card.Content className="grid gap-3 p-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 text-zinc-100">
                      <FontAwesomeIcon icon={faServer} />
                    </div>
                    <div className="min-w-0">
                      <strong className="block truncate text-base text-zinc-100">{ftpParts.hostname}</strong>
                      <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                        {ftpParts.protocol}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      aria-label="Edit connection"
                      className="px-3"
                      onPress={openConnectionModal}
                      variant="tertiary"
                    >
                      <FontAwesomeIcon icon={faPenToSquare} />
                      Edit
                    </Button>
                    <Button
                      aria-label="Delete connection"
                      className="px-3"
                      onPress={() => {
                        setShowDeleteConnectionModal(true)
                      }}
                      variant="danger"
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                      Delete
                    </Button>
                  </div>
                </Card.Content>
              </Card>
            )}

            {!hasIgdbConnection ? (
              <Button
                className="h-auto w-full items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-6 text-center"
                onPress={openIgdbModal}
                variant="tertiary"
              >
                <FontAwesomeIcon className="text-zinc-400" icon={faPlus} />
                <span className="text-zinc-400">Add IGDB Connection</span>
              </Button>
            ) : (
              <Card className="bg-white/5">
                <Card.Content className="grid gap-3 p-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid size-12 shrink-0 place-items-center rounded-xl bg-white/10 text-zinc-100">
                      <FontAwesomeIcon icon={faImage} />
                    </div>
                    <div className="min-w-0">
                      <strong className="block truncate text-base text-zinc-100">IGDB (Twitch API)</strong>
                    </div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button
                      aria-label="Edit IGDB connection"
                      className="px-3"
                      onPress={openIgdbModal}
                      variant="tertiary"
                    >
                      <FontAwesomeIcon icon={faPenToSquare} />
                      Edit
                    </Button>
                    <Button
                      aria-label="Delete IGDB connection"
                      className="px-3"
                      onPress={() => {
                        setShowDeleteIgdbModal(true)
                      }}
                      variant="danger"
                    >
                      <FontAwesomeIcon icon={faTrashCan} />
                      Delete
                    </Button>
                  </div>
                </Card.Content>
              </Card>
            )}

          </div>
        </Card.Content>
      </Card>

      <Modal.Backdrop
        isOpen={showConnectionModal}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeConnectionModal()
            return
          }

          setShowConnectionModal(true)
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-xl">
            <Modal.Header>
              <Modal.Heading>Connection Details</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="p-2">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1">
                  <Select
                    aria-label="Service Type"
                    className="w-full"
                    selectedKey={connectionDraft.protocol}
                    onSelectionChange={(value) => {
                      const nextProtocol = parseProtocol(String(value))
                      setConnectionDraft((currentDraft) => ({
                        ...currentDraft,
                        protocol: nextProtocol,
                        port:
                          !currentDraft.port ||
                            currentDraft.port === getDefaultPort(currentDraft.protocol)
                            ? getDefaultPort(nextProtocol)
                            : currentDraft.port
                      }))
                    }}
                  >
                    <Label>Service Type</Label>
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
                    value={connectionDraft.hostname}
                    onChange={(event) => {
                      setConnectionDraft((currentDraft) => ({
                        ...currentDraft,
                        hostname: event.target.value
                      }))
                    }}
                    placeholder="example.com"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Port</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={connectionDraft.port}
                    onChange={(event) => {
                      const nextPort = event.target.value.replace(/[^\d]/g, '')
                      setConnectionDraft((currentDraft) => ({
                        ...currentDraft,
                        port: nextPort || getDefaultPort(currentDraft.protocol)
                      }))
                    }}
                    placeholder={getDefaultPort(connectionDraft.protocol)}
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Remote Path</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={connectionDraft.path}
                    onChange={(event) => {
                      setConnectionDraft((currentDraft) => ({
                        ...currentDraft,
                        path: event.target.value
                      }))
                    }}
                    placeholder="/"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Username</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={connectionDraft.username}
                    onChange={(event) => {
                      setConnectionDraft((currentDraft) => ({
                        ...currentDraft,
                        username: event.target.value
                      }))
                    }}
                    placeholder="Username"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Password</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    type="password"
                    value={connectionDraft.password}
                    onChange={(event) => {
                      setConnectionDraft((currentDraft) => ({
                        ...currentDraft,
                        password: event.target.value
                      }))
                    }}
                    placeholder="Password"
                  />
                </label>
              </div>
              {connectionModalError ? (
                <div className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {connectionModalError}
                </div>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={closeConnectionModal} variant="tertiary">
                Cancel
              </Button>
              <Button
                isDisabled={connectionSaving}
                onPress={() => {
                  void handleSaveConnection()
                }}
                variant="primary"
              >
                {connectionSaving ? 'Connecting...' : 'Save & Connect'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop
        isOpen={showDeleteConnectionModal}
        onOpenChange={(isOpen) => {
          setShowDeleteConnectionModal(isOpen)
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-xl">
            <Modal.Header>
              <Modal.Heading>Delete Connection</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-zinc-300">
                Are you sure you want to delete this connection? This will clear the remote library cache.
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                onPress={() => {
                  setShowDeleteConnectionModal(false)
                }}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button onPress={() => {
                void handleDeleteConnection()
              }} variant="danger">
                <FontAwesomeIcon icon={faTrashCan} />
                Delete
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop
        isOpen={showIgdbModal}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            closeIgdbModal()
            return
          }

          setShowIgdbModal(true)
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-xl">
            <Modal.Header>
              <Modal.Heading>IGDB (Twitch API) Details</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="p-2">
              <div className="grid gap-3 md:grid-cols-2">
                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Client ID</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    value={igdbDraft.clientId}
                    onChange={(event) => {
                      setIgdbDraft((currentDraft) => ({
                        ...currentDraft,
                        clientId: event.target.value
                      }))
                    }}
                    placeholder="Twitch Client ID"
                  />
                </label>

                <label className="grid gap-1">
                  <span className="text-sm text-zinc-300">Client Secret</span>
                  <Input
                    className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                    type="password"
                    value={igdbDraft.clientSecret}
                    onChange={(event) => {
                      setIgdbDraft((currentDraft) => ({
                        ...currentDraft,
                        clientSecret: event.target.value
                      }))
                    }}
                    placeholder="Twitch Client Secret"
                  />
                </label>
              </div>
              {igdbModalError ? (
                <div className="mt-2 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                  {igdbModalError}
                </div>
              ) : null}
            </Modal.Body>
            <Modal.Footer>
              <Button onPress={closeIgdbModal} variant="tertiary">
                Cancel
              </Button>
              <Button
                isDisabled={igdbSaving || !igdbDraftReady}
                onPress={() => {
                  void handleSaveIgdbConnection()
                }}
                variant="primary"
              >
                {igdbSaving ? 'Connecting...' : 'Save & Connect'}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      <Modal.Backdrop
        isOpen={showDeleteIgdbModal}
        onOpenChange={(isOpen) => {
          setShowDeleteIgdbModal(isOpen)
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="w-full max-w-xl">
            <Modal.Header>
              <Modal.Heading>Delete Connection</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="text-sm text-zinc-300">
                Are you sure you want to delete this connection?
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                onPress={() => {
                  setShowDeleteIgdbModal(false)
                }}
                variant="tertiary"
              >
                Cancel
              </Button>
              <Button onPress={() => {
                void handleDeleteIgdbConnection()
              }} variant="danger">
                <FontAwesomeIcon icon={faTrashCan} />
                Delete
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </section>
  )
}
