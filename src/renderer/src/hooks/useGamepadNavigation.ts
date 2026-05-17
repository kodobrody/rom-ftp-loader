import { useEffect } from 'react'
import { useKeyboardModalStore } from '../store/modals/keyboardModalStore'

type GamepadDirection = 'up' | 'down' | 'left' | 'right'
type GamepadControl = GamepadDirection | 'activate' | 'back'
const navigationSectionSelector =
  '.platform-grid, .game-grid, .toolbar-actions, .topbar-actions, .library-toolbar, .setup-actions, .setup-grid, .setup-form, .field-row, .pill-row, .game-modal__actions, .download-list'
const focusableSelector =
  'a[href], area[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), [tabindex]:not([tabindex="-1"])'
const INITIAL_DPAD_REPEAT_INTERVAL_MS = 220
const ACCELERATED_DPAD_REPEAT_INTERVAL_MS = 80
const DPAD_ACCELERATION_DELAY_MS = 3000
const FOCUS_SCROLL_PADDING_PX = 72
const focusTrapSelector =
  '[data-gamepad-focus-trap="true"], [role="dialog"], [aria-modal="true"], [role="menu"]'

function isElementVisible(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element)
  const rect = element.getBoundingClientRect()

  return (
    rect.width > 0 &&
    rect.height > 0 &&
    style.display !== 'none' &&
    style.visibility !== 'hidden' &&
    style.opacity !== '0'
  )
}

function hasOpenModalDialogOrMenu(): boolean {
  const overlayElements = Array.from(
    document.querySelectorAll<HTMLElement>('[role="dialog"], [aria-modal="true"], [role="menu"]')
  )

  return overlayElements.some((element) => isElementVisible(element))
}

function dispatchEscapeToFocusedElement(): void {
  const target =
    (document.activeElement as HTMLElement | null) ?? document.body ?? document.documentElement

  const keyDownEvent = new KeyboardEvent('keydown', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true
  })
  const keyUpEvent = new KeyboardEvent('keyup', {
    key: 'Escape',
    code: 'Escape',
    bubbles: true,
    cancelable: true
  })

  target.dispatchEvent(keyDownEvent)
  target.dispatchEvent(keyUpEvent)
}

function hasRouteLevelOverlayInLocation(): boolean {
  const searchParams = new URLSearchParams(window.location.search)
  return searchParams.get('menu') === 'platforms'
}

function getTopVisibleFocusTrap(): HTMLElement | null {
  const traps = Array.from(document.querySelectorAll<HTMLElement>(focusTrapSelector)).filter(
    (element) => isElementVisible(element)
  )

  if (traps.length === 0) {
    return null
  }

  let topTrap = traps[0]
  let topZIndex = Number.parseInt(window.getComputedStyle(topTrap).zIndex, 10)

  for (const trap of traps.slice(1)) {
    const parsedZIndex = Number.parseInt(window.getComputedStyle(trap).zIndex, 10)
    const zIndex = Number.isNaN(parsedZIndex) ? 0 : parsedZIndex
    const currentTopZIndex = Number.isNaN(topZIndex) ? 0 : topZIndex

    if (zIndex >= currentTopZIndex) {
      topTrap = trap
      topZIndex = zIndex
    }
  }

  return topTrap
}

function enforceFocusTrapIfNeeded(): void {
  const trap = getTopVisibleFocusTrap()

  if (!trap) {
    return
  }

  const activeElement = document.activeElement as HTMLElement | null

  if (activeElement && trap.contains(activeElement)) {
    return
  }

  const trapFocusables = getFocusableElements(trap)
  const focusTarget = trapFocusables[0]

  if (focusTarget) {
    focusTarget.focus()
  }
}

function getFocusableElements(root: ParentNode): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(focusableSelector)).filter((element) => {
    const rect = element.getBoundingClientRect()
    const style = window.getComputedStyle(element)

    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      !element.hasAttribute('disabled')
    )
  })
}

function findNearestInDirection(
  current: HTMLElement,
  candidates: HTMLElement[],
  direction: GamepadDirection
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect()
  const currentX = currentRect.left + currentRect.width / 2
  const currentY = currentRect.top + currentRect.height / 2
  let bestCandidate: HTMLElement | null = null
  let bestScore = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (candidate === current) {
      continue
    }

    const candidateRect = candidate.getBoundingClientRect()
    const candidateX = candidateRect.left + candidateRect.width / 2
    const candidateY = candidateRect.top + candidateRect.height / 2
    const dx = candidateX - currentX
    const dy = candidateY - currentY

    if (direction === 'up' && dy >= -6) {
      continue
    }

    if (direction === 'down' && dy <= 6) {
      continue
    }

    if (direction === 'left' && dx >= -6) {
      continue
    }

    if (direction === 'right' && dx <= 6) {
      continue
    }

    const primary = direction === 'up' || direction === 'down' ? Math.abs(dy) : Math.abs(dx)
    const secondary = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy)
    const score = primary * 1.7 + secondary

    if (score < bestScore) {
      bestScore = score
      bestCandidate = candidate
    }
  }

  return bestCandidate
}

function findAxisPreferredInDirection(
  current: HTMLElement,
  candidates: HTMLElement[],
  direction: GamepadDirection
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect()
  const currentX = currentRect.left + currentRect.width / 2
  const currentY = currentRect.top + currentRect.height / 2
  let bestCandidate: HTMLElement | null = null
  let bestSecondary = Number.POSITIVE_INFINITY
  let bestPrimary = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (candidate === current) {
      continue
    }

    const candidateRect = candidate.getBoundingClientRect()
    const candidateX = candidateRect.left + candidateRect.width / 2
    const candidateY = candidateRect.top + candidateRect.height / 2
    const dx = candidateX - currentX
    const dy = candidateY - currentY

    if (direction === 'up' && dy >= -6) {
      continue
    }

    if (direction === 'down' && dy <= 6) {
      continue
    }

    if (direction === 'left' && dx >= -6) {
      continue
    }

    if (direction === 'right' && dx <= 6) {
      continue
    }

    const primary = direction === 'up' || direction === 'down' ? Math.abs(dy) : Math.abs(dx)
    const secondary = direction === 'up' || direction === 'down' ? Math.abs(dx) : Math.abs(dy)

    if (secondary < bestSecondary) {
      bestSecondary = secondary
      bestPrimary = primary
      bestCandidate = candidate
      continue
    }

    if (secondary === bestSecondary && primary < bestPrimary) {
      bestPrimary = primary
      bestCandidate = candidate
    }
  }

  return bestCandidate
}

function findNextGridItemOnRight(current: HTMLElement): HTMLElement | null {
  const grid = current.closest('.platform-grid, .game-grid')

  if (!grid) {
    return null
  }

  const gridItems = getFocusableElements(grid).filter(
    (element) => element.closest('.platform-grid, .game-grid') === grid
  )
  const currentIndex = gridItems.indexOf(current)

  if (currentIndex === -1 || currentIndex >= gridItems.length - 1) {
    return null
  }

  return gridItems[currentIndex + 1]
}

function findPreviousGridItemOnLeft(current: HTMLElement): HTMLElement | null {
  const grid = current.closest('.platform-grid, .game-grid')

  if (!grid) {
    return null
  }

  const gridItems = getFocusableElements(grid).filter(
    (element) => element.closest('.platform-grid, .game-grid') === grid
  )
  const currentIndex = gridItems.indexOf(current)

  if (currentIndex <= 0) {
    return null
  }

  return gridItems[currentIndex - 1]
}

function getNavigationSection(element: HTMLElement): HTMLElement | null {
  return element.closest(navigationSectionSelector)
}

function findSameRowCandidate(
  current: HTMLElement,
  candidates: HTMLElement[],
  direction: 'left' | 'right'
): HTMLElement | null {
  const currentRect = current.getBoundingClientRect()
  const currentCenterY = currentRect.top + currentRect.height / 2
  let bestCandidate: HTMLElement | null = null
  let bestPrimary = Number.POSITIVE_INFINITY
  let bestSecondary = Number.POSITIVE_INFINITY

  for (const candidate of candidates) {
    if (candidate === current) {
      continue
    }

    const candidateRect = candidate.getBoundingClientRect()
    const candidateCenterY = candidateRect.top + candidateRect.height / 2
    const verticalOverlap =
      Math.min(currentRect.bottom, candidateRect.bottom) -
      Math.max(currentRect.top, candidateRect.top)

    if (verticalOverlap <= 0) {
      continue
    }

    const minHeight = Math.min(currentRect.height, candidateRect.height)

    if (verticalOverlap < minHeight * 0.4) {
      continue
    }

    const dx =
      direction === 'right'
        ? candidateRect.left - currentRect.right
        : currentRect.left - candidateRect.right

    if (dx < -6) {
      continue
    }

    const primary = Math.max(0, dx)
    const secondary = Math.abs(candidateCenterY - currentCenterY)

    if (primary < bestPrimary || (primary === bestPrimary && secondary < bestSecondary)) {
      bestPrimary = primary
      bestSecondary = secondary
      bestCandidate = candidate
    }
  }

  return bestCandidate
}

function resolveActivatableElement(element: HTMLElement): HTMLElement {
  const activatable = element.closest(
    'button, [role="button"], a[href], summary, [data-gamepad-activate-target="true"]'
  )

  return (activatable as HTMLElement | null) ?? element
}

function getScrollContainer(element: HTMLElement): HTMLElement | null {
  let current = element.parentElement

  while (current) {
    const style = window.getComputedStyle(current)
    const overflowY = style.overflowY
    const isScrollable =
      (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') &&
      current.scrollHeight > current.clientHeight

    if (isScrollable) {
      return current
    }

    current = current.parentElement
  }

  return null
}

function hasFocusableInVerticalDirection(
  element: HTMLElement,
  focusableElements: HTMLElement[],
  direction: 'up' | 'down'
): boolean {
  const currentRect = element.getBoundingClientRect()
  const currentCenterY = currentRect.top + currentRect.height / 2

  return focusableElements.some((candidate) => {
    if (candidate === element) {
      return false
    }

    const candidateRect = candidate.getBoundingClientRect()
    const candidateCenterY = candidateRect.top + candidateRect.height / 2
    const deltaY = candidateCenterY - currentCenterY

    return direction === 'up' ? deltaY <= -6 : deltaY >= 6
  })
}

function scrollFocusedElementIntoView(
  element: HTMLElement | null,
  scope: ParentNode,
  direction: GamepadDirection | null
): void {
  if (!element || !isElementVisible(element)) {
    return
  }

  const focusableElements = getFocusableElements(scope)
  const scrollContainer = getScrollContainer(element)
  const elementRect = element.getBoundingClientRect()

  if (direction === 'up' || direction === 'down') {
    const isAtVerticalEdge = !hasFocusableInVerticalDirection(element, focusableElements, direction)

    if (scrollContainer) {
      if (isAtVerticalEdge) {
        scrollContainer.scrollTo({
          top: direction === 'up' ? 0 : scrollContainer.scrollHeight - scrollContainer.clientHeight,
          behavior: 'smooth'
        })
        return
      }

      const containerRect = scrollContainer.getBoundingClientRect()
      const minVisibleTop = containerRect.top + FOCUS_SCROLL_PADDING_PX
      const maxVisibleBottom = containerRect.bottom - FOCUS_SCROLL_PADDING_PX

      if (elementRect.top < minVisibleTop) {
        scrollContainer.scrollBy({ top: elementRect.top - minVisibleTop, behavior: 'smooth' })
        return
      }

      if (elementRect.bottom > maxVisibleBottom) {
        scrollContainer.scrollBy({
          top: elementRect.bottom - maxVisibleBottom,
          behavior: 'smooth'
        })
        return
      }
    } else {
      const scrollingElement = document.scrollingElement

      if (!scrollingElement) {
        return
      }

      if (isAtVerticalEdge) {
        scrollingElement.scrollTo({
          top: direction === 'up' ? 0 : scrollingElement.scrollHeight - window.innerHeight,
          behavior: 'smooth'
        })
        return
      }

      const minVisibleTop = FOCUS_SCROLL_PADDING_PX
      const maxVisibleBottom = window.innerHeight - FOCUS_SCROLL_PADDING_PX

      if (elementRect.top < minVisibleTop) {
        window.scrollBy({ top: elementRect.top - minVisibleTop, behavior: 'smooth' })
        return
      }

      if (elementRect.bottom > maxVisibleBottom) {
        window.scrollBy({ top: elementRect.bottom - maxVisibleBottom, behavior: 'smooth' })
        return
      }
    }
  }

  element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}

export const useGamepadNavigation = () => {
  const { setKeyboardTarget, setShowOnScreenKeyboard } = useKeyboardModalStore()

  useEffect(() => {
    let lastFocusDirection: GamepadDirection | null = null
    let lastDocumentScrollTop = 0
    let lastDocumentScrollLeft = 0

    const captureDocumentScrollPosition = (): void => {
      const scrollingElement = document.scrollingElement

      if (!scrollingElement) {
        return
      }

      lastDocumentScrollTop = scrollingElement.scrollTop
      lastDocumentScrollLeft = scrollingElement.scrollLeft
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Tab') {
        captureDocumentScrollPosition()
        lastFocusDirection = event.shiftKey ? 'up' : 'down'
      }
    }

    const handleFocusIn = (event: FocusEvent): void => {
      const target = event.target

      if (!(target instanceof HTMLElement)) {
        return
      }

      const activeTrap = getTopVisibleFocusTrap()

      if (activeTrap && activeTrap.contains(target)) {
        window.requestAnimationFrame(() => {
          const scrollingElement = document.scrollingElement

          if (scrollingElement) {
            scrollingElement.scrollTo({
              top: lastDocumentScrollTop,
              left: lastDocumentScrollLeft,
              behavior: 'instant'
            })
          }

          lastFocusDirection = null
        })
        return
      }

      const direction = lastFocusDirection
      scrollFocusedElementIntoView(target, document, direction)
      window.requestAnimationFrame(() => {
        if (lastFocusDirection === direction) {
          lastFocusDirection = null
        }
      })
    }

    const previousPressed: Record<GamepadControl, boolean> = {
      up: false,
      down: false,
      left: false,
      right: false,
      activate: false,
      back: false
    }

    const pressedSince: Record<GamepadControl, number> = {
      up: 0,
      down: 0,
      left: 0,
      right: 0,
      activate: 0,
      back: 0
    }

    const lastTriggeredAt: Record<GamepadControl, number> = {
      up: 0,
      down: 0,
      left: 0,
      right: 0,
      activate: 0,
      back: 0
    }

    function handleBackAction(): void {
      if (hasRouteLevelOverlayInLocation() && window.history.length > 1) {
        window.history.back()
        return
      }

      if (hasOpenModalDialogOrMenu()) {
        dispatchEscapeToFocusedElement()
        return
      }

      if (window.history.length > 1) {
        window.history.back()
      }
    }

    function isControlPressed(direction: GamepadControl): boolean {
      const gamepads = navigator.getGamepads ? navigator.getGamepads() : []

      for (const gamepad of gamepads) {
        if (!gamepad) {
          continue
        }

        const upByAxis = (gamepad.axes?.[1] ?? 0) <= -0.55
        const downByAxis = (gamepad.axes?.[1] ?? 0) >= 0.55
        const leftByAxis = (gamepad.axes?.[0] ?? 0) <= -0.55
        const rightByAxis = (gamepad.axes?.[0] ?? 0) >= 0.55

        const upPressed = Boolean(gamepad.buttons[12]?.pressed) || upByAxis
        const downPressed = Boolean(gamepad.buttons[13]?.pressed) || downByAxis
        const leftPressed = Boolean(gamepad.buttons[14]?.pressed) || leftByAxis
        const rightPressed = Boolean(gamepad.buttons[15]?.pressed) || rightByAxis
        const activatePressed = Boolean(gamepad.buttons[0]?.pressed)
        const backPressed =
          Boolean(gamepad.buttons[1]?.pressed) || Boolean(gamepad.buttons[8]?.pressed)

        if (
          (direction === 'up' && upPressed) ||
          (direction === 'down' && downPressed) ||
          (direction === 'left' && leftPressed) ||
          (direction === 'right' && rightPressed) ||
          (direction === 'activate' && activatePressed) ||
          (direction === 'back' && backPressed)
        ) {
          return true
        }
      }

      return false
    }

    function findNextKeyboardButtonInRow(
      current: HTMLElement,
      direction: 'left' | 'right',
      allCandidates: HTMLElement[]
    ): HTMLElement | null {
      const keyboardRow = current.closest('.on-screen-keyboard__row')
      if (!keyboardRow) return null

      const rowButtons = allCandidates.filter(
        (btn) => btn.closest('.on-screen-keyboard__row') === keyboardRow
      )
      if (rowButtons.length === 0) return null

      const currentIndex = rowButtons.indexOf(current)
      if (currentIndex === -1) return null

      if (direction === 'left' && currentIndex > 0) {
        return rowButtons[currentIndex - 1]
      } else if (direction === 'right' && currentIndex < rowButtons.length - 1) {
        return rowButtons[currentIndex + 1]
      }

      return null
    }

    function moveFocus(direction: GamepadDirection): void {
      const activeTrap = getTopVisibleFocusTrap()
      const candidates = getFocusableElements(activeTrap ?? document)

      if (candidates.length === 0) {
        return
      }

      const activeElement = document.activeElement as HTMLElement | null
      const current = activeElement && candidates.includes(activeElement) ? activeElement : null

      if (!current) {
        captureDocumentScrollPosition()
        lastFocusDirection = direction
        candidates[0].focus()
        return
      }

      const currentGrid = current.closest('.platform-grid, .game-grid')

      if (currentGrid && direction === 'right') {
        const wrappedNext = findNextGridItemOnRight(current)

        if (wrappedNext) {
          captureDocumentScrollPosition()
          lastFocusDirection = direction
          wrappedNext.focus()
        }
        return
      }

      if (currentGrid && direction === 'left') {
        const wrappedPrevious = findPreviousGridItemOnLeft(current)

        if (wrappedPrevious) {
          captureDocumentScrollPosition()
          lastFocusDirection = direction
          wrappedPrevious.focus()
        }
        return
      }

      if (direction === 'right') {
        const isKeyboardRow = Boolean(current.closest('.on-screen-keyboard__row'))
        const keyboardButton = findNextKeyboardButtonInRow(current, 'right', candidates)
        if (keyboardButton) {
          captureDocumentScrollPosition()
          lastFocusDirection = direction
          keyboardButton.focus()
          return
        }

        if (isKeyboardRow) {
          return
        }

        const currentSection = getNavigationSection(current)

        if (currentSection) {
          const sameSectionCandidates = candidates.filter(
            (element) => getNavigationSection(element) === currentSection
          )
          const nextInSection = findAxisPreferredInDirection(
            current,
            sameSectionCandidates,
            direction
          )

          if (nextInSection) {
            captureDocumentScrollPosition()
            lastFocusDirection = direction
            nextInSection.focus()
            return
          }
        }

        const nextInRow = findSameRowCandidate(current, candidates, 'right')

        if (nextInRow) {
          captureDocumentScrollPosition()
          lastFocusDirection = direction
          nextInRow.focus()
          return
        }
      }

      if (direction === 'left') {
        const isKeyboardRow = Boolean(current.closest('.on-screen-keyboard__row'))
        const keyboardButton = findNextKeyboardButtonInRow(current, 'left', candidates)
        if (keyboardButton) {
          captureDocumentScrollPosition()
          lastFocusDirection = direction
          keyboardButton.focus()
          return
        }

        if (isKeyboardRow) {
          return
        }

        const currentSection = getNavigationSection(current)

        if (currentSection) {
          const sameSectionCandidates = candidates.filter(
            (element) => getNavigationSection(element) === currentSection
          )
          const nextInSection = findAxisPreferredInDirection(
            current,
            sameSectionCandidates,
            direction
          )

          if (nextInSection) {
            captureDocumentScrollPosition()
            lastFocusDirection = direction
            nextInSection.focus()
            return
          }
        }

        const nextInRow = findSameRowCandidate(current, candidates, 'left')

        if (nextInRow) {
          captureDocumentScrollPosition()
          lastFocusDirection = direction
          nextInRow.focus()
          return
        }
      }

      const next = findNearestInDirection(current, candidates, direction)

      if (next) {
        captureDocumentScrollPosition()
        lastFocusDirection = direction
        next.focus()
        return
      }

      if (direction === 'right' || direction === 'left') {
        return
      }
    }

    function activateFocusedElement(): void {
      const activeElement = document.activeElement as HTMLElement | null

      if (!activeElement) {
        return
      }

      if (
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement
      ) {
        if (!activeElement.disabled && !activeElement.readOnly) {
          setKeyboardTarget(activeElement)
          setShowOnScreenKeyboard(true)
        }
        return
      }

      const activatableElement = resolveActivatableElement(activeElement)

      if (typeof activatableElement.click === 'function') {
        activatableElement.click()
      }
    }

    let frameId = 0

    const tick = (): void => {
      const controls: GamepadControl[] = ['up', 'down', 'left', 'right', 'activate', 'back']

      const now = performance.now()

      enforceFocusTrapIfNeeded()

      for (const control of controls) {
        const pressedNow = isControlPressed(control)

        if (pressedNow) {
          if (!previousPressed[control]) {
            pressedSince[control] = now
            if (
              control === 'up' ||
              control === 'down' ||
              control === 'left' ||
              control === 'right'
            ) {
              lastTriggeredAt[control] = now
              moveFocus(control)
            } else if (control === 'activate') {
              activateFocusedElement()
              lastTriggeredAt[control] = now
            } else if (control === 'back') {
              handleBackAction()
              lastTriggeredAt[control] = now
            }
          } else if (
            control === 'up' ||
            control === 'down' ||
            control === 'left' ||
            control === 'right'
          ) {
            const heldDurationMs = now - pressedSince[control]
            const repeatIntervalMs =
              heldDurationMs >= DPAD_ACCELERATION_DELAY_MS
                ? ACCELERATED_DPAD_REPEAT_INTERVAL_MS
                : INITIAL_DPAD_REPEAT_INTERVAL_MS

            if (now - lastTriggeredAt[control] >= repeatIntervalMs) {
              moveFocus(control)
              lastTriggeredAt[control] = now
            }
          }
        } else {
          pressedSince[control] = 0

          if (control === 'up' || control === 'down' || control === 'left' || control === 'right') {
            lastTriggeredAt[control] = 0
          } else {
            lastTriggeredAt[control] = 0
          }
        }

        previousPressed[control] = pressedNow
      }

      frameId = window.requestAnimationFrame(tick)
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('focusin', handleFocusIn)
    frameId = window.requestAnimationFrame(tick)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('focusin', handleFocusIn)
      window.cancelAnimationFrame(frameId)
    }
  }, [setKeyboardTarget, setShowOnScreenKeyboard])
}
