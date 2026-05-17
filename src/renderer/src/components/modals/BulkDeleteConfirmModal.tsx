import { Button, Modal } from '@heroui/react'
import { useLibraryStore } from '../../store/libraryStore'
import { useBulkDeleteConfirmModalStore } from '../../store/modals/bulkDeleteConfirmModalStore'
import { formatBytes } from '../../utils/formatting'

export const BulkDeleteConfirmModal = (): React.JSX.Element | null => {
  const { selectedGames, selectedTotalSize } = useLibraryStore()
  const { closeBulkDeleteConfirmModal, deleteSelectedGamesConfirmed, showBulkDeleteConfirmModal } =
    useBulkDeleteConfirmModalStore()

  if (!showBulkDeleteConfirmModal) {
    return null
  }

  return (
    <Modal.Backdrop isOpen={showBulkDeleteConfirmModal} onOpenChange={closeBulkDeleteConfirmModal} inert={undefined}>
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
            <p className="text-sm text-zinc-300">This removes selected downloaded local files.</p>
            <p className="text-sm text-zinc-400">
              {selectedGames.length} selected ({formatBytes(selectedTotalSize)})
            </p>
          </Modal.Body>
          <Modal.Footer>
            <Button
              onPress={deleteSelectedGamesConfirmed}
              className="cursor-pointer"
              variant="danger"
              autoFocus
            >
              Delete selected
            </Button>
            <Button className="cursor-pointer" onPress={closeBulkDeleteConfirmModal} variant="tertiary">
              Cancel
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
