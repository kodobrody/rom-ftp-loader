import { Modal } from '@heroui/react'
import { useKeyboardModalStore } from '../../store/modals/keyboardModalStore'
import { OnScreenKeyboard } from '../OnScreenKeyboard'

export const KeyboardModal = (): React.JSX.Element | null => {
  const {
    hideKeyboard,
    isSearchScreen,
    keyboardKeyPress,
    keyboardPreviewVersion,
    keyboardRef,
    keyboardRows,
    keyboardTargetRef,
    showOnScreenKeyboard,
    setShowOnScreenKeyboard
  } = useKeyboardModalStore()

  return (
    <Modal.Backdrop onOpenChange={setShowOnScreenKeyboard} isOpen={showOnScreenKeyboard && !isSearchScreen}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-4xl">
          <Modal.Header>
            <Modal.Heading>On-screen keyboard</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <OnScreenKeyboard
              closeLabel="Close"
              docked
              onHide={hideKeyboard}
              onKeyPress={keyboardKeyPress}
              previewVersion={keyboardPreviewVersion}
              ref={keyboardRef}
              rows={keyboardRows}
              targetRef={keyboardTargetRef}
            />
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
