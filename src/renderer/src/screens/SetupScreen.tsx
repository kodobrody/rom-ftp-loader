import {
  faArrowLeft,
  faFolder,
  faImage,
  faPenToSquare,
  faPlus,
  faServer,
  faTrashCan
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Input } from '@heroui/react'
import React, { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SetupConnectionModal } from '../components/modals/SetupConnectionModal'
import { SetupDeleteConfirmModal } from '../components/modals/SetupDeleteConfirmModal'
import { SetupIgdbModal } from '../components/modals/SetupIgdbModal'
import { useAppStateStore } from '../store/appStateStore'
import { useSetupStore } from '../store/setupStore'

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
  const navigate = useNavigate()
  const [showConnectionModal, setShowConnectionModal] = useState(false)
  const [showDeleteConnectionModal, setShowDeleteConnectionModal] = useState(false)
  const [showIgdbModal, setShowIgdbModal] = useState(false)
  const [showDeleteIgdbModal, setShowDeleteIgdbModal] = useState(false)

  const ftpParts = useMemo(() => {
    if (!config.ftpUrl.trim()) {
      return { protocol: 'ftp' as const, hostname: '', port: '21', path: '/' }
    }

    try {
      const normalizedUrl = config.ftpUrl.includes('://') ? config.ftpUrl : `ftp://${config.ftpUrl}`
      const parsedUrl = new URL(normalizedUrl)

      return {
        protocol: parsedUrl.protocol.replace(':', '') as 'ftp' | 'ftps' | 'sftp',
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || '21',
        path: parsedUrl.pathname || '/'
      }
    } catch {
      return { protocol: 'ftp' as const, hostname: config.ftpUrl, port: '21', path: '/' }
    }
  }, [config.ftpUrl])
  const hasConnection = Boolean(config.ftpUrl && config.ftpUsername && config.ftpPassword)
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
        ftpUrl: '',
        ftpUsername: '',
        ftpPassword: ''
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

  return (
    <section className="setup-layout grid gap-4">
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

      <Card>
        <Card.Content className="flex flex-col items-center gap-4 p-5 max-w-5xl mx-auto w-full">
          <div className="grid gap-4 w-full">
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
          </div>
        </Card.Content>
      </Card>

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
    </section>
  )
}
