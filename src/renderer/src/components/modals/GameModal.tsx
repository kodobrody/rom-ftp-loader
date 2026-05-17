import { faDownload, faImage, faTrashCan, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Chip, Modal } from '@heroui/react'
import { useDeleteConfirmModalStore } from '../../store/modals/deleteConfirmModalStore'
import { useGameModalStore } from '../../store/modals/gameModalStore'
import { formatBytes } from '../../utils/formatting'

export const GameModal = (): React.JSX.Element | null => {
  const {
    activeGameQueueItem,
    cancelDownloadFromModal,
    closeGameModal,
    downloadGameFromModal,
    fetchGameMetadataFromModal,
    gameMetadataLoading,
    modalGame
  } = useGameModalStore()
  const { openDeleteConfirmModal } = useDeleteConfirmModalStore()

  if (!modalGame) {
    return null
  }

  return (
    <Modal.Backdrop isOpen={Boolean(modalGame)} onOpenChange={closeGameModal}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-210">
          <Modal.Header>
            <Modal.Heading>{modalGame.displayName}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className="grid gap-4 md:grid-cols-[260px_1fr]">
              <div className="overflow-hidden rounded-xl">
                {modalGame.coverUrl ? (
                  <img
                    alt={modalGame.displayName}
                    className="aspect-3/4 h-full w-full object-cover"
                    src={modalGame.coverUrl}
                  />
                ) : (
                  <div className="grid aspect-3/4 place-items-center text-sm text-zinc-400">No cover</div>
                )}
              </div>
              <div className="grid content-start gap-3">
                {modalGame.discLabel ? <p className="text-sm text-zinc-300">Edition: {modalGame.discLabel}</p> : null}
                <div className="flex flex-col gap-3 items-start">
                  <Chip className="break-all"><span className='font-bold'>File: </span><span className='font-normal'>{modalGame.name}</span></Chip>
                  <Chip variant="soft">
                    <span className='font-bold'>File size: </span><span className='font-normal'>{formatBytes(modalGame.size)}</span>
                  </Chip>
                  <Chip variant="soft" className='break-all items-start'>
                    <span className='font-bold whitespace-nowrap'>Path: </span><span className='font-normal'>{modalGame.remotePath}</span>
                  </Chip>
                </div>

                {activeGameQueueItem && ['queued', 'downloading'].includes(activeGameQueueItem.status) ? (
                  <>
                    <div className="h-2 w-full max-w-lg overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full bg-linear-to-r from-blue-400 to-cyan-400 transition-all"
                        style={{ width: `${activeGameQueueItem.progress}%` }}
                      />
                    </div>
                    <p className="text-sm text-zinc-300">
                      {activeGameQueueItem.status} {activeGameQueueItem.progress}%
                    </p>
                  </>
                ) : null}
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            {activeGameQueueItem && ['queued', 'downloading'].includes(activeGameQueueItem.status) ? (
              <Button
                onPress={() => {
                  void cancelDownloadFromModal()
                }}
                className="font-semibold cursor-pointer"
                variant="primary"
              >
                Cancel
              </Button>
            ) : !modalGame.downloaded ? (
              <Button
                className="font-semibold cursor-pointer"
                onPress={downloadGameFromModal}
                variant="primary"
                autoFocus
              >
                <FontAwesomeIcon icon={faDownload} />
                Download
              </Button>
            ) : (
              <Button className="font-semibold cursor-pointer" onPress={openDeleteConfirmModal} variant="danger">
                <FontAwesomeIcon icon={faTrashCan} />
                Delete
              </Button>
            )}
            <Button
              className="font-semibold cursor-pointer"
              isDisabled={gameMetadataLoading}
              onPress={fetchGameMetadataFromModal}
              variant="tertiary"
            >
              <FontAwesomeIcon icon={faImage} />
              {gameMetadataLoading ? 'Fetching metadata...' : 'Fetch metadata'}
            </Button>
            <Button className="font-semibold cursor-pointer" onPress={closeGameModal} variant="tertiary">
              <FontAwesomeIcon icon={faXmark} />
              Close
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
