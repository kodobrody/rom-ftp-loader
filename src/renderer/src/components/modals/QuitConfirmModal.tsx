import { faRightFromBracket } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { Button, Modal } from '@heroui/react';
import { useQuitConfirmModalStore } from '../../store/modals/quitConfirmModalStore';


export const QuitConfirmModal = (): React.JSX.Element | null => {
  const { closeQuitConfirmModal, confirmQuit, showQuitConfirmModal } = useQuitConfirmModalStore()

  return (
    <Modal.Backdrop isOpen={showQuitConfirmModal} onOpenChange={closeQuitConfirmModal}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-xl">
          <Modal.Header>
            <Modal.Heading>Confirm quit</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <p className="text-sm text-zinc-300">This will close the application.</p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              onPress={() => {
                void confirmQuit()
              }}
              variant="danger"
              autoFocus
            >
              <FontAwesomeIcon icon={faRightFromBracket} />
              Quit app
            </Button>
            <Button onPress={closeQuitConfirmModal} variant="tertiary">
              Cancel
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
