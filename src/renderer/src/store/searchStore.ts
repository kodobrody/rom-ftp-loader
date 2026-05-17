import { create } from 'zustand'
import type { SearchIndexEntry } from '../utils/search'
import { useGameModalStore } from './modals/gameModalStore'
import { useKeyboardModalStore } from './modals/keyboardModalStore'

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

interface SearchStore {
  searchQuery: string
  showOnScreenKeyboard: boolean
  searchInputRef: React.RefObject<HTMLInputElement | null>
  onScreenKeyboardRef: React.RefObject<HTMLElement | null>
  keyboardRows: string[][]
  setSearchQuery: (value: string) => void
  prepareSearchSession: () => void
  resetSearchSession: () => void
  openSearchResultInModal: (entry: SearchIndexEntry) => Promise<void>
  hideKeyboard: () => void
  applyKeyboardKey: (key: string) => void
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
  setSearchQuery: (searchQuery) => {
    set({ searchQuery })
  },
  prepareSearchSession: () => {
    set({ searchQuery: '', showOnScreenKeyboard: true })
  },
  resetSearchSession: () => {
    set({ searchQuery: '', showOnScreenKeyboard: false })
  },
  openSearchResultInModal: async (entry) => {
    useGameModalStore.getState().openGameModalFromEntry(entry.game)
    useKeyboardModalStore.getState().setShowOnScreenKeyboard(false)
  },
  hideKeyboard: () => {
    set({ showOnScreenKeyboard: false })
    useKeyboardModalStore.getState().setShowOnScreenKeyboard(false)
  },
  applyKeyboardKey: (key) => {
    const target = get().searchInputRef.current

    if (target && !target.disabled && !target.readOnly) {
      applyKey(target, key)
      return
    }

    useKeyboardModalStore.getState().keyboardKeyPress(key)
  }
}))
