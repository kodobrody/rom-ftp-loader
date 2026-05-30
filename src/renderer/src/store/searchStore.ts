import { create } from 'zustand'
import type { SearchIndexEntry } from '../utils/search'
import { useGameModalStore } from './modals/gameModalStore'
import { useKeyboardModalStore } from './modals/keyboardModalStore'
import { useSetupStore } from './setupStore'

const applyInputEvent = (target: HTMLInputElement | HTMLTextAreaElement): void => {
  target.dispatchEvent(new Event('input', { bubbles: true }))
}

const applyKey = (target: HTMLInputElement | HTMLTextAreaElement, key: string): void => {
  const start = target.selectionStart ?? target.value.length
  const end = target.selectionEnd ?? start

  if (key === '{backspace}') {
    if (start !== end) {
      target.setRangeText('', start, end, 'end')
    } else if (start > 0) {
      target.setRangeText('', start - 1, start, 'end')
    }

    applyInputEvent(target)
    return
  }

  if (key === '{clear}') {
    target.setRangeText('', 0, target.value.length, 'end')
    applyInputEvent(target)
    return
  }

  if (key === '{space}') {
    target.setRangeText(' ', start, end, 'end')
    applyInputEvent(target)
    return
  }

  target.setRangeText(key, start, end, 'end')
  applyInputEvent(target)
}

const keepInputCaretVisible = (target: HTMLInputElement | HTMLTextAreaElement): void => {
  target.focus()
  const caretPosition = target.selectionEnd ?? target.value.length
  target.selectionStart = caretPosition
  target.selectionEnd = caretPosition
}

interface SearchStore {
  searchQuery: string
  showOnScreenKeyboard: boolean
  searchInputRef: React.RefObject<HTMLInputElement | null>
  onScreenKeyboardRef: React.RefObject<HTMLElement | null>
  keyboardRows: string[][]
  setSearchQuery: (value: string) => void
  setShowOnScreenKeyboard: (value: boolean) => void
  prepareSearchSession: (openedByGamepad?: boolean) => void
  resetSearchSession: () => void
  openSearchResultInModal: (entry: SearchIndexEntry) => Promise<void>
  hideKeyboard: () => void
  applyKeyboardKey: (key: string, options?: { keepInputFocus?: boolean }) => void
  setOpenedByGamepad: (value: boolean) => void
  openedByGamepad: boolean
}

export const useSearchStore = create<SearchStore>((set, get) => ({
  searchQuery: '',
  showOnScreenKeyboard: false,
  searchInputRef: { current: null },
  onScreenKeyboardRef: { current: null },
  keyboardRows: [
    ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['z', 'x', 'c', 'v', 'b', 'n', 'm']
  ],
  openedByGamepad: false,
  setOpenedByGamepad: (value) => set({ openedByGamepad: value }),
  setSearchQuery: (searchQuery) => {
    set({ searchQuery })
  },
  setShowOnScreenKeyboard: (showOnScreenKeyboard) => {
    set({ showOnScreenKeyboard })
  },
  prepareSearchSession: (openedByGamepad = false) => {
    const inputKeyboardMode = useSetupStore.getState().config.inputKeyboardMode
    let showOnScreenKeyboard = false
    if (inputKeyboardMode === 'always') {
      showOnScreenKeyboard = true
    } else if (inputKeyboardMode === 'gamepad' && openedByGamepad) {
      showOnScreenKeyboard = true
    } else {
      showOnScreenKeyboard = false
    }
    set({
      searchQuery: '',
      showOnScreenKeyboard,
      openedByGamepad
    })
  },
  resetSearchSession: () => {
    set({ searchQuery: '', showOnScreenKeyboard: false, openedByGamepad: false })
    useKeyboardModalStore.getState().setShowOnScreenKeyboard(false)
  },
  openSearchResultInModal: async (entry) => {
    useGameModalStore.getState().openGameModalFromEntry(entry.game)
    useKeyboardModalStore.getState().setShowOnScreenKeyboard(false)
  },
  hideKeyboard: () => {
    set({ showOnScreenKeyboard: false })
    useKeyboardModalStore.getState().setShowOnScreenKeyboard(false)
  },
  applyKeyboardKey: (key, options) => {
    const target = get().searchInputRef.current
    const keepInputFocus = options?.keepInputFocus ?? true

    if (target && !target.disabled && !target.readOnly) {
      applyKey(target, key)

      if (keepInputFocus) {
        keepInputCaretVisible(target)
      }

      return
    }

    useKeyboardModalStore.getState().keyboardKeyPress(key)
  }
}))
