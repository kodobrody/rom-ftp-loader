import {
  faArrowLeft,
  faFolder,
  faImage,
  faLink,
  faPenToSquare,
  faPlus,
  faServer,
  faTrashCan
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Input, Label, ListBox, Select } from '@heroui/react'
import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { InputKeyboardMode, TorrentUploadMode } from '../../../shared/types'
import { SetupConnectionModal } from '../components/modals/SetupConnectionModal'
import { SetupDeleteConfirmModal } from '../components/modals/SetupDeleteConfirmModal'
import { SetupIgdbModal } from '../components/modals/SetupIgdbModal'
import { useAppStateStore } from '../store/appStateStore'
import { useKeyboardModalStore } from '../store/modals/keyboardModalStore'
import { useSetupStore } from '../store/setupStore'
import { useTorrentStore } from '../store/torrentStore'

interface SetupScreenProps {
  onboardingMode?: boolean
}

export const SetupScreen = ({ onboardingMode = false }: SetupScreenProps): React.JSX.Element => {
  const {
    config,
    configFileLoading,
    directoryPicking,
    loadConfigFromFile,
    pickDirectory,
    persistConfig,
    setupReady,
    updateConfig
  } = useSetupStore()
  const browserSnapshot = useTorrentStore((store) => store.browserSnapshot)
  const ensureBrowserState = useTorrentStore((store) => store.ensureBrowserState)
  const refreshBrowserState = useTorrentStore((store) => store.refreshBrowserState)
  const { setKeyboardTarget, setShowOnScreenKeyboard } = useKeyboardModalStore()
  const { setErrorMessage, setInfoMessage, setOnboardingActive } = useAppStateStore()
  const navigate = useNavigate()
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [showDeleteConnectionModal, setShowDeleteConnectionModal] = useState(false)
  const [showIgdbModal, setShowIgdbModal] = useState(false)
  const [showDeleteIgdbModal, setShowDeleteIgdbModal] = useState(false)
  const [showResetAppDataModal, setShowResetAppDataModal] = useState(false)
  const [magnetInput, setMagnetInput] = useState('')

  useEffect(() => {
    void ensureBrowserState()
  }, [ensureBrowserState])

  const ftpParts = useMemo(() => {
    const isHttpService =
      config.fileServiceType === 'nextcloud' || config.fileServiceType === 'romm'

    if (!config.ftpUrl.trim()) {
      return {
        protocol: isHttpService ? ('https' as const) : ('ftp' as const),
        hostname: '',
        port: isHttpService ? '443' : '21',
        path: '/'
      }
    }

    try {
      const fallbackProtocol = isHttpService ? 'https' : 'ftp'
      const normalizedUrl = config.ftpUrl.includes('://')
        ? config.ftpUrl
        : `${fallbackProtocol}://${config.ftpUrl}`
      const parsedUrl = new URL(normalizedUrl)

      return {
        protocol: parsedUrl.protocol.replace(':', ''),
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (isHttpService ? '443' : '21'),
        path: parsedUrl.pathname || '/'
      }
    } catch {
      return {
        protocol: isHttpService ? ('https' as const) : ('ftp' as const),
        hostname: config.ftpUrl,
        port: isHttpService ? '443' : '21',
        path: '/'
      }
    }
  }, [config.fileServiceType, config.ftpUrl])
  const hasConnection = Boolean(
    config.ftpUrl &&
    (config.fileServiceType === 'romm'
      ? config.rommApiToken
      : config.ftpUsername && config.ftpPassword)
  )
  const hasIgdbConnection = Boolean(config.twitchClientId && config.twitchClientSecret)

  const openConnectionModal = (): void => {
    setShowConnectionModal(true)
  }

  const closeConnectionModal = (): void => {
    setShowConnectionModal(false)
  }

  const openIgdbModal = (): void => {
    setShowIgdbModal(true)
  }

  const handleDeleteConnection = async (): Promise<void> => {
    const savedConfig = await persistConfig(
      {
        fileServiceType: 'ftp',
        ftpUrl: '',
        ftpUsername: '',
        ftpPassword: '',
        rommApiToken: ''
      },
      { refreshLibrary: true }
    )

    if (savedConfig) {
      setErrorMessage(null)
      setInfoMessage(null)
      setShowDeleteConnectionModal(false)
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

  const handleResetAppData = async (): Promise<void> => {
    try {
      await window.api.resetAppData()
      updateConfig({
        romsDirectory: '',
        twitchClientId: '',
        twitchAccessToken: '',
        twitchClientSecret: '',
        fileServiceType: 'ftp',
        ftpUrl: '',
        ftpUsername: '',
        ftpPassword: '',
        rommApiToken: '',
        inputKeyboardMode: 'gamepad',
        torrentUploadMode: 'when_downloading',
        torrentSources: []
      })
      setErrorMessage(null)
      setInfoMessage('App data reset. Configure setup again.')
      setShowResetAppDataModal(false)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to reset app data.')
    }
  }

  const handleTextInputClick = (event: React.MouseEvent<HTMLInputElement>): void => {
    if (config.inputKeyboardMode !== 'always') {
      return
    }

    setKeyboardTarget(event.currentTarget)
    setShowOnScreenKeyboard(true)
  }

  const handleAddTorrentSource = async (
    sourceType: 'magnet' | 'file',
    sourceValue: string,
    label?: string
  ): Promise<void> => {
    const nextSource = sourceValue.trim()

    if (!nextSource) {
      setErrorMessage(
        sourceType === 'magnet' ? 'Paste a magnet link first.' : 'Pick a torrent file first.'
      )
      return
    }

    const nextTorrentSources = [
      ...config.torrentSources,
      {
        id: `torrent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label:
          label?.trim() ||
          (sourceType === 'file'
            ? nextSource.split(/[\\/]/).pop() || 'Torrent file'
            : 'Magnet link'),
        sourceType,
        source: nextSource
      }
    ]

    const savedConfig = await persistConfig({ torrentSources: nextTorrentSources })

    if (savedConfig) {
      void ensureBrowserState()
      void refreshBrowserState()
      setErrorMessage(null)
      setInfoMessage('Torrent source added.')
      setMagnetInput('')
    }
  }

  const handlePickTorrentFile = async (): Promise<void> => {
    try {
      const pickedFile = await window.api.pickTorrentFile()

      if (!pickedFile) {
        return
      }

      await handleAddTorrentSource('file', pickedFile, pickedFile.split(/[\\/]/).pop())
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to pick a torrent file.')
    }
  }

  const handleDeleteTorrentSource = async (torrentId: string): Promise<void> => {
    const savedConfig = await persistConfig({
      torrentSources: config.torrentSources.filter((source) => source.id !== torrentId)
    })

    if (savedConfig) {
      void refreshBrowserState()
      setErrorMessage(null)
      setInfoMessage('Torrent source removed.')
    }
  }

  const handleGetStarted = async (): Promise<void> => {
    const savedConfig = await persistConfig(
      { romsDirectory: config.romsDirectory.trim() },
      { refreshLibrary: true }
    )

    if (savedConfig && setupReady) {
      setOnboardingActive(false)
      navigate('/')
    }
  }

  const settingsContent = (
    <>
      <div className="grid gap-2">
        {onboardingMode && (
          <>
            <span className="text-2xl font-bold text-zinc-100">Setup your library</span>
            <span className="text-zinc-400 mb-4">
              Configure your server and local directory to continue.
            </span>
          </>
        )}
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
              onClick={handleTextInputClick}
              value={config.romsDirectory}
              onChange={(event) => updateConfig({ romsDirectory: event.target.value })}
              onBlur={(event) => {
                const nextPath = event.target.value.trim()

                if (nextPath !== config.romsDirectory) {
                  void persistConfig({ romsDirectory: nextPath }, { refreshLibrary: true })
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
                <strong className="block truncate text-base text-zinc-100">
                  {ftpParts.hostname}
                </strong>
                <span className="block text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">
                  {config.fileServiceType}
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
                <strong className="block truncate text-base text-zinc-100">
                  IGDB (Twitch API)
                </strong>
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

      <Card className="bg-white/5">
        <Card.Content className="grid gap-4 p-4">
          <div className="grid gap-1">
            <strong className="text-zinc-100">Torrent test sources</strong>
            <p className="text-sm text-zinc-400">
              Add a magnet link or a .torrent file. The torrent test screen will inspect
              Minerva_Myrient releases and let you download single files only.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto] md:items-end">
            <label className="grid gap-1">
              <span className="text-sm text-zinc-300">Magnet link</span>
              <Input
                className="rounded-xl bg-black/20 px-3 py-2 text-zinc-100 outline-none transition focus:border-cyan-300/60"
                onChange={(event) => setMagnetInput(event.target.value)}
                onClick={handleTextInputClick}
                placeholder="magnet:?xt=urn:btih:..."
                value={magnetInput}
              />
            </label>
            <Button
              onPress={() => {
                void handleAddTorrentSource('magnet', magnetInput)
              }}
              variant="primary"
            >
              <FontAwesomeIcon icon={faLink} />
              Add magnet
            </Button>
            <Button
              onPress={() => {
                void handlePickTorrentFile()
              }}
              variant="tertiary"
            >
              <FontAwesomeIcon icon={faFolder} />
              Add .torrent file
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-zinc-400">
              {config.torrentSources.length} torrent source
              {config.torrentSources.length === 1 ? '' : 's'} configured
            </span>
            <Button onPress={() => navigate('/torrents')} variant="tertiary">
              Open torrent test screen
            </Button>
          </div>

          {config.torrentSources.length > 0 ? (
            <div className="grid gap-3">
              {config.torrentSources.map((source) => (
                <div
                  className="grid gap-3 rounded-xl bg-black/20 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                  key={source.id}
                >
                  <div className="min-w-0">
                    <strong className="block truncate text-zinc-100">
                      {browserSnapshot.resolvedNames[source.id] ??
                        source.resolvedName ??
                        source.label}
                    </strong>
                    <span className="block truncate text-xs uppercase tracking-[0.18em] text-zinc-400">
                      {source.sourceType}
                    </span>
                    <p className="truncate text-xs text-zinc-500">{source.source}</p>
                  </div>
                  <Button
                    className="px-3"
                    onPress={() => {
                      void handleDeleteTorrentSource(source.id)
                    }}
                    variant="danger"
                  >
                    <FontAwesomeIcon icon={faTrashCan} />
                    Remove
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-zinc-500">No torrent sources added yet.</p>
          )}
        </Card.Content>
      </Card>

      <div className="flex items-center justify-end">
        <div className="grid gap-3 justify-items-end">
          <label className="grid gap-1">
            <ControllerlessKeyboardModeSelect
              value={config.inputKeyboardMode}
              onChange={(mode) => {
                updateConfig({ inputKeyboardMode: mode })
                void persistConfig({ inputKeyboardMode: mode })
              }}
            />
          </label>
          <label className="grid gap-1">
            <TorrentUploadModeSelect
              value={config.torrentUploadMode}
              onChange={(mode) => {
                updateConfig({ torrentUploadMode: mode })
                void persistConfig({ torrentUploadMode: mode })
              }}
            />
          </label>
        </div>
      </div>

      <Card className="bg-red-500/10 border border-red-400/30">
        <Card.Content className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div className="min-w-0">
            <strong className="block text-sm text-red-200">Temporary: Reset App Data</strong>
            <p className="text-xs text-red-100/80">
              Deletes config and cached metadata/library data.
            </p>
          </div>
          <Button
            onPress={() => {
              setShowResetAppDataModal(true)
            }}
            variant="danger"
          >
            Reset all app data
          </Button>
        </Card.Content>
      </Card>
    </>
  )

  return (
    <section className="setup-layout grid gap-4">
      {!onboardingMode ? (
        <div className="grid gap-3">
          <Button
            className="justify-self-start gap-2 px-3 text-zinc-300 hover:text-zinc-100"
            onPress={() => {
              navigate('/')
            }}
            variant="tertiary"
          >
            <FontAwesomeIcon className="shrink-0" icon={faArrowLeft} />
            Back to library
          </Button>
          <h1 className="text-3xl font-semibold text-zinc-100">Setup</h1>
        </div>
      ) : null}

      {onboardingMode ? (
        <div className="grid gap-6 w-full max-w-6xl mx-auto lg:grid-cols-2">
          <Card className="bg-white/5">
            <Card.Content className="grid gap-5 p-6 md:p-8 content-center justify-items-center text-center">
              <div className="grid size-20 place-items-center rounded-full bg-white/10 text-zinc-100">
                <FontAwesomeIcon className="text-4xl" icon={faServer} />
              </div>
              <div className="grid gap-2">
                <h2 className="text-3xl font-semibold text-zinc-100">Welcome to Romloader</h2>
                <p className="text-sm text-zinc-300">
                  Connect to your remote game collection and manage your downloads with ease.
                </p>
              </div>
            </Card.Content>
          </Card>

          <Card className="bg-white/5">
            <Card.Content className="grid gap-4 p-4">
              {settingsContent}
              <div className="flex justify-end">
                <Button
                  isDisabled={!setupReady}
                  onPress={() => {
                    void handleGetStarted()
                  }}
                  variant="primary"
                >
                  Get started
                </Button>
              </div>
            </Card.Content>
          </Card>
        </div>
      ) : (
        <div className="grid gap-4 w-full max-w-5xl mx-auto">{settingsContent}</div>
      )}

      <SetupConnectionModal isOpen={showConnectionModal} onClose={closeConnectionModal} />

      <SetupDeleteConfirmModal
        isOpen={showDeleteConnectionModal}
        title="Delete Connection"
        description="Are you sure you want to delete this connection? This will clear the remote library cache."
        onClose={() => {
          setShowDeleteConnectionModal(false)
        }}
        onDelete={() => {
          void handleDeleteConnection()
        }}
      />

      <SetupIgdbModal
        isOpen={showIgdbModal}
        onClose={() => {
          setShowIgdbModal(false)
        }}
      />

      <SetupDeleteConfirmModal
        isOpen={showDeleteIgdbModal}
        title="Delete Connection"
        description="Are you sure you want to delete this connection?"
        onClose={() => {
          setShowDeleteIgdbModal(false)
        }}
        onDelete={() => {
          void handleDeleteIgdbConnection()
        }}
      />

      <SetupDeleteConfirmModal
        isOpen={showResetAppDataModal}
        title="Reset App Data"
        description="This will delete config and cached metadata/library data. Continue?"
        onClose={() => {
          setShowResetAppDataModal(false)
        }}
        onDelete={() => {
          void handleResetAppData()
        }}
      />
    </section>
  )
}

interface KeyboardModeSelectProps {
  value: InputKeyboardMode
  onChange: (mode: InputKeyboardMode) => void
}

interface TorrentUploadModeSelectProps {
  value: TorrentUploadMode
  onChange: (mode: TorrentUploadMode) => void
}

const ControllerlessKeyboardModeSelect = ({
  value,
  onChange
}: KeyboardModeSelectProps): React.JSX.Element => {
  return (
    <Select
      className="w-fit"
      aria-label="Show keyboard for inputs"
      selectedKey={value}
      onSelectionChange={(selection) => {
        const nextMode = selection === 'always' ? 'always' : 'gamepad'
        onChange(nextMode)
      }}
    >
      <Label>Show keyboard for inputs</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="always" textValue="Always">
            Always
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="gamepad" textValue="When entered with gamepad">
            When entered with gamepad
            <ListBox.ItemIndicator />
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

const TorrentUploadModeSelect = ({
  value,
  onChange
}: TorrentUploadModeSelectProps): React.JSX.Element => {
  return (
    <Select
      className="w-fit"
      aria-label="Torrent upload mode"
      selectedKey={value}
      onSelectionChange={(selection) => {
        const selected = String(selection)

        if (selected === 'always') {
          onChange('always')
          return
        }

        if (selected === 'never') {
          onChange('never')
          return
        }

        onChange('when_downloading')
      }}
    >
      <Label>Torrent uploading</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id="always" textValue="Always">
            Always
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="when_downloading" textValue="When downloading">
            When downloading
            <ListBox.ItemIndicator />
          </ListBox.Item>
          <ListBox.Item id="never" textValue="Never">
            Never
            <ListBox.ItemIndicator />
          </ListBox.Item>
        </ListBox>
      </Select.Popover>
    </Select>
  )
}
