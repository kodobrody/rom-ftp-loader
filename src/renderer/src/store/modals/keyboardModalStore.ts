import { create } from 'zustand'

interface KeyboardModalStore {
  showOnScreenKeyboard: boolean
  isSearchScreen: boolean
  keyboardPreviewVersion: number
  keyboardRows: string[][]
  keyboardTargetRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
  keyboardRef: React.RefObject<HTMLElement | null>
  setShowOnScreenKeyboard: (show: boolean) => void
  setKeyboardTarget: (target: HTMLInputElement | HTMLTextAreaElement | null) => void
  setIsSearchScreen: (isSearchScreen: boolean) => void
  hideKeyboard: () => void
  keyboardKeyPress: (key: string) => void
}

const applyInputEvent = (target: HTMLInputElement | HTMLTextAreaElement): void => {
  target.dispatchEvent(new Event('input', { bubbles: true }))
}

const keepInputCaretVisible = (target: HTMLInputElement | HTMLTextAreaElement): void => {
  target.focus()
  const caretPosition = target.selectionEnd ?? target.value.length
  target.selectionStart = caretPosition
  target.selectionEnd = caretPosition
}

export const useKeyboardModalStore = create<KeyboardModalStore>((set, get) => ({
  showOnScreenKeyboard: false,
  isSearchScreen: false,
  keyboardPreviewVersion: 0,
  keyboardRows: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ],
  keyboardTargetRef: { current: null },
  keyboardRef: { current: null },
  setShowOnScreenKeyboard: (showOnScreenKeyboard) => {
    set({ showOnScreenKeyboard })
  },
  setKeyboardTarget: (target) => {
    get().keyboardTargetRef.current = target
  },
  setIsSearchScreen: (isSearchScreen) => {
    set({ isSearchScreen })
  },
  hideKeyboard: () => {
    set({ showOnScreenKeyboard: false })
  },
  keyboardKeyPress: (key) => {
    const target = get().keyboardTargetRef.current
    const bumpPreview = () => {
      set((state) => ({ keyboardPreviewVersion: state.keyboardPreviewVersion + 1 }))
    }

    if (!target || target.disabled || target.readOnly) {
      return
    }

    const start = target.selectionStart ?? target.value.length
    const end = target.selectionEnd ?? start

    if (key === '{backspace}') {
      if (start !== end) {
        target.setRangeText('', start, end, 'end')
      } else if (start > 0) {
        target.setRangeText('', start - 1, start, 'end')
      }
      applyInputEvent(target)
      keepInputCaretVisible(target)
      bumpPreview()
      return
    }

    if (key === '{clear}') {
      target.setRangeText('', 0, target.value.length, 'end')
      applyInputEvent(target)
      keepInputCaretVisible(target)
      bumpPreview()
      return
    }

    if (key === '{space}') {
      target.setRangeText(' ', start, end, 'end')
      applyInputEvent(target)
      keepInputCaretVisible(target)
      bumpPreview()
      return
    }

    if (key === '{left}') {
      target.selectionStart = Math.max(0, start - 1)
      target.selectionEnd = target.selectionStart
      keepInputCaretVisible(target)
      bumpPreview()
      return
    }

    if (key === '{right}') {
      target.selectionStart = Math.min(target.value.length, start + 1)
      target.selectionEnd = target.selectionStart
      keepInputCaretVisible(target)
      bumpPreview()
      return
    }

    if (key === '{up}') {
      target.selectionStart = 0
      target.selectionEnd = 0
      keepInputCaretVisible(target)
      bumpPreview()
      return
    }

    if (key === '{down}') {
      target.selectionStart = target.value.length
      target.selectionEnd = target.value.length
      keepInputCaretVisible(target)
      bumpPreview()
      return
    }

    target.setRangeText(key, start, end, 'end')
    applyInputEvent(target)
    keepInputCaretVisible(target)
    bumpPreview()
  }
}))
