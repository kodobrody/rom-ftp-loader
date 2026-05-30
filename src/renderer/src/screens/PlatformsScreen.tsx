import { faDownload, faFilter, faMagnifyingGlass, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card } from '@heroui/react'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStateStore } from '../store/appStateStore'
import { useLibraryStore } from '../store/libraryStore'
import { useSearchStore } from '../store/searchStore'

const PLATFORM_MENU_QUERY_KEY = 'menu'
const PLATFORM_MENU_QUERY_VALUE = 'platforms'

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  return [...container.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
  )
}

export const PlatformsScreen = (): React.JSX.Element => {
  const {
    platformMenuRef,
    platformsLoading,
    refreshPlatforms,
    showDownloadedOnly,
    toggleShowDownloadedOnly,
    visiblePlatforms } = useLibraryStore()
  const location = useLocation()
  const navigate = useNavigate()
  const { setErrorMessage, setInfoMessage } = useAppStateStore()
  const { prepareSearchSession } = useSearchStore()
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const platformsGridRef = useRef<HTMLDivElement | null>(null)
  const hasAutoFocusedPlatformsRef = useRef(false)

  const currentSearchParams = new URLSearchParams(location.search)
  const showPlatformMenu =
    currentSearchParams.get(PLATFORM_MENU_QUERY_KEY) === PLATFORM_MENU_QUERY_VALUE

  const openPlatformMenu = (): void => {
    const nextSearchParams = new URLSearchParams(location.search)
    nextSearchParams.set(PLATFORM_MENU_QUERY_KEY, PLATFORM_MENU_QUERY_VALUE)

    navigate(
      {
        pathname: location.pathname,
        search: `?${nextSearchParams.toString()}`
      },
      { replace: false }
    )
  }

  const closePlatformMenu = (): void => {
    const nextSearchParams = new URLSearchParams(location.search)
    nextSearchParams.delete(PLATFORM_MENU_QUERY_KEY)

    const nextSearch = nextSearchParams.toString()

    navigate(
      {
        pathname: location.pathname,
        search: nextSearch ? `?${nextSearch}` : ''
      },
      { replace: true }
    )
  }

  const togglePlatformMenu = (): void => {
    if (showPlatformMenu) {
      closePlatformMenu()
      return
    }

    openPlatformMenu()
  }

  const menuPanelClass =
    'absolute right-0 top-12 z-30 grid min-w-[260px] shadow-2xl backdrop-blur overflow-visible border'

  useEffect(() => {
    const menuElement = platformMenuRef.current

    if (showPlatformMenu && menuElement) {
      const focusableElements = getFocusableElements(menuElement)
        ; (focusableElements[0] ?? menuElement).focus()
      return
    }

    menuTriggerRef.current?.focus()
  }, [platformMenuRef, showPlatformMenu])

  useEffect(() => {
    if (!showPlatformMenu) {
      hasAutoFocusedPlatformsRef.current = false
    }
  }, [showPlatformMenu])

  useEffect(() => {
    if (platformsLoading || showPlatformMenu || visiblePlatforms.length === 0 || hasAutoFocusedPlatformsRef.current) {
      return
    }

    const grid = platformsGridRef.current

    if (!grid) {
      return
    }

    const firstPlatformButton = grid.querySelector<HTMLElement>('button:not([disabled])')

    if (!firstPlatformButton) {
      return
    }

    hasAutoFocusedPlatformsRef.current = true
    window.requestAnimationFrame(() => {
      firstPlatformButton.focus()
    })
  }, [platformsLoading, showPlatformMenu, visiblePlatforms])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      closePlatformMenu()
      return
    }

    if (event.key !== 'Tab') {
      return
    }

    const menuElement = platformMenuRef.current

    if (!menuElement) {
      return
    }

    const focusableElements = getFocusableElements(menuElement)

    if (focusableElements.length === 0) {
      event.preventDefault()
      menuElement.focus()
      return
    }

    const firstElement = focusableElements[0]
    const lastElement = focusableElements[focusableElements.length - 1]
    const activeElement = document.activeElement

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault()
      lastElement.focus()
      return
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault()
      firstElement.focus()
    }
  }

  return (
    <section className="library-layout grid gap-4">
      <Card className='overflow-visible'>
        <Card.Content className="flex flex-row items-start justify-between gap-3 overflow-visible">
          <div className="flex gap-3">
            <Button
              onPress={() => {
                if (visiblePlatforms.length === 0) {
                  setInfoMessage('No platforms available to search yet.')
                  return
                }

                setInfoMessage(null)
                setErrorMessage(null)
                prepareSearchSession()
                navigate('/search')
              }}
              variant="tertiary"
            >
              <FontAwesomeIcon icon={faMagnifyingGlass} />
              Search
            </Button>
            <Button onPress={() => navigate('/downloads')} variant="tertiary">
              <FontAwesomeIcon icon={faDownload} />
              Downloads
            </Button>
          </div>
          <div className="relative overflow-visible">
            <Button
              aria-expanded={showPlatformMenu}
              aria-haspopup="menu"
              onPress={togglePlatformMenu}
              ref={menuTriggerRef}
              variant="tertiary"
            >
              ...
            </Button>
            {showPlatformMenu ? (
              <Card
                className={menuPanelClass}
                onKeyDown={handleMenuKeyDown}
                ref={platformMenuRef}
                role="menu"
                tabIndex={-1}
              >
                <Card.Content className="gap-3">
                  <Button
                    fullWidth
                    onPress={() => {
                      closePlatformMenu()
                      void refreshPlatforms()
                    }}
                    variant="tertiary"
                  >
                    <FontAwesomeIcon icon={faRotateRight} />
                    Refresh platforms
                  </Button>
                  <Button
                    fullWidth
                    onPress={() => {
                      closePlatformMenu()
                      toggleShowDownloadedOnly()
                    }}
                    variant="tertiary"
                  >
                    <FontAwesomeIcon icon={faFilter} />
                    {showDownloadedOnly ? 'Show all games' : 'Show downloaded only'}
                  </Button>
                </Card.Content>
              </Card>
            ) : null}
          </div>
        </Card.Content>
      </Card>

      {platformsLoading ? (
        <Card>
          <Card.Content className="text-center">
            Loading platforms...
          </Card.Content>
        </Card>
      ) : visiblePlatforms.length === 0 ? (
        <Card>
          <Card.Content className="text-center">
            {showDownloadedOnly
              ? 'No platforms with downloaded games were found.'
              : 'No platform folders with files were found at the configured FTP location.'}
          </Card.Content>
        </Card>
      ) : (
        <div
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 3xl:grid-cols-8"
          ref={platformsGridRef}
        >
          {visiblePlatforms.map((platform) => (
            <Button
              className="text-left transition flex flex-col h-40 w-full"
              key={platform.id}
              onClick={() => {
                navigate(`/platform/${encodeURIComponent(platform.id)}`)
              }}
              variant='tertiary'
            >
              <span className="text-xl whitespace-normal text-center font-semibold uppercase tracking-[0.12em] text-zinc-400">
                {platform.name}
              </span>
              <strong className="text-zinc-100">{platform.remoteGameCount} games</strong>
            </Button>
          ))}
        </div>
      )}
    </section>
  )
}
