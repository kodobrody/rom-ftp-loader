import { faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Modal } from '@heroui/react'
import { useDeleteConfirmModalStore } from '../../store/modals/deleteConfirmModalStore'
import { useGameModalStore } from '../../store/modals/gameModalStore'

export const DeleteConfirmModal = (): React.JSX.Element | null => {
  const { closeDeleteConfirmModal, showDeleteConfirmModal } = useDeleteConfirmModalStore()
  const { deleteDownloadedGameFromModal, modalGame } = useGameModalStore()

  if (!showDeleteConfirmModal || !modalGame) {
    return null
  }

  return (
    <Modal.Backdrop isOpen={showDeleteConfirmModal} onOpenChange={closeDeleteConfirmModal} inert={undefined}>
      <Modal.Container>
        <Modal.Dialog
          className="w-full max-w-xl"
          onMouseDown={(event) => {
            event.stopPropagation()
          }}
        >
          <Modal.Header>
            <Modal.Heading>Confirm delete</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p className="text-sm text-zinc-300">This removes the downloaded local file.</p>
            <p className="break-all text-sm text-zinc-400">{modalGame.name}</p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              onPress={() => {
                void deleteDownloadedGameFromModal()
              }}
              className="cursor-pointer"
              variant="danger"
              autoFocus
            >
              <FontAwesomeIcon icon={faTrashCan} />
              Delete file
            </Button>
            <Button className="cursor-pointer" onPress={closeDeleteConfirmModal} variant="tertiary">
              Cancel
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
