import { faTrashCan } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Modal } from '@heroui/react'

interface SetupDeleteConfirmModalProps {
  isOpen: boolean
  title: string
  description: string
  onClose: () => void
  onDelete: () => void
}

export const SetupDeleteConfirmModal = ({
  isOpen,
  title,
  description,
  onClose,
  onDelete
}: SetupDeleteConfirmModalProps): React.JSX.Element => (
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
        <Modal.Header>
          <Modal.Heading>{title}</Modal.Heading>
        </Modal.Header>
        <Modal.Body>
          <p className="text-sm text-zinc-300">{description}</p>
        </Modal.Body>
        <Modal.Footer>
          <Button onPress={onClose} variant="tertiary">
            Cancel
          </Button>
          <Button
            onPress={() => {
              onDelete()
            }}
            variant="danger"
          >
            <FontAwesomeIcon icon={faTrashCan} />
            Delete
          </Button>
        </Modal.Footer>
      </Modal.Dialog>
    </Modal.Container>
  </Modal.Backdrop>
)
