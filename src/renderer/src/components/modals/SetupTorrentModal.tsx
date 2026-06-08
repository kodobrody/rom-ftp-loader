import { faFile, faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Label, ListBox, Modal, Select } from '@heroui/react'
import React, { useState } from 'react'
import type { TorrentUploadMode } from '../../../../shared/types'
import { useAppStateStore } from '../../store/appStateStore'
import { useSetupStore } from '../../store/setupStore'
import { useTorrentStore } from '../../store/torrentStore'

interface SetupTorrentModalProps {
  isOpen: boolean
  onClose: () => void
}

export const SetupTorrentModal = ({
  isOpen,
  onClose
}: SetupTorrentModalProps): React.JSX.Element => {
  const { config, persistConfig, updateConfig } = useSetupStore()
  const { setErrorMessage, setInfoMessage } = useAppStateStore()
  const ensureBrowserState = useTorrentStore((store) => store.ensureBrowserState)
  const refreshBrowserState = useTorrentStore((store) => store.refreshBrowserState)
  const [isPicking, setIsPicking] = useState(false)

  const handlePickTorrentFile = async (): Promise<void> => {
    setIsPicking(true)
    try {
      const pickedFiles = await window.api.pickTorrentFile()

      if (!pickedFiles || pickedFiles.length === 0) {
        return
      }

      const newSources = pickedFiles.map((filePath) => ({
        id: `torrent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: filePath.split(/[/]/).pop() || 'Torrent file',
        sourceType: 'file' as const,
        source: filePath
      }))
      const nextTorrentSources = [...config.torrentSources, ...newSources]

      const savedConfig = await persistConfig({ torrentSources: nextTorrentSources })

      if (savedConfig) {
        void ensureBrowserState()
        void refreshBrowserState()
        setErrorMessage(null)
        setInfoMessage('Torrent source added.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to pick a torrent file.')
    } finally {
      setIsPicking(false)
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

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          onClose()
        }
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-xl">
          <Modal.Body className="p-2">
            <div className="grid gap-5">
              <h2 className="text-2xl font-semibold text-zinc-100">Torrent</h2>

              <div className="grid gap-2">
                <Select
                  className="w-fit"
                  aria-label="Torrent upload mode"
                  selectedKey={config.torrentUploadMode}
                  onSelectionChange={(selection) => {
                    const selected = String(selection) as TorrentUploadMode
                    const mode: TorrentUploadMode =
                      selected === 'always' ? 'always' : 'when_downloading'
                    updateConfig({ torrentUploadMode: mode })
                    void persistConfig({ torrentUploadMode: mode })
                  }}
                >
                  <Label>Uploading</Label>
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
                    </ListBox>
                  </Select.Popover>
                </Select>
              </div>

              <div className="grid gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-semibold text-zinc-200">Sources</span>
                  <Button
                    isDisabled={isPicking}
                    onPress={() => void handlePickTorrentFile()}
                    variant="tertiary"
                  >
                    <FontAwesomeIcon icon={faFile} />
                    {isPicking ? 'Picking...' : 'Add .torrent file'}
                  </Button>
                </div>

                {config.torrentSources.length > 0 ? (
                  <div className="grid gap-2">
                    {config.torrentSources.map((source) => (
                      <div
                        className="grid gap-3 rounded-xl bg-white/5 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                        key={source.id}
                      >
                        <span className="truncate text-sm text-zinc-100">
                          {source.source.split(/[\\/]/).pop() ?? source.label}
                        </span>
                        <Button
                          className="px-3"
                          onPress={() => void handleDeleteTorrentSource(source.id)}
                          variant="danger"
                        >
                          <FontAwesomeIcon icon={faTrashCan} />
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Button
                    className="h-auto w-full items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-6 text-center"
                    isDisabled={isPicking}
                    onPress={() => void handlePickTorrentFile()}
                    variant="tertiary"
                  >
                    <FontAwesomeIcon className="text-zinc-400" icon={faFile} />
                    <span className="text-zinc-400">
                      {isPicking ? 'Picking...' : 'Add .torrent file'}
                    </span>
                  </Button>
                )}
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button onPress={onClose} variant="tertiary">
              Close
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
