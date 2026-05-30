import { faSquare } from '@fortawesome/free-regular-svg-icons'
import {
  faArrowLeft,
  faDownload,
  faFilter,
  faListCheck,
  faSquareCheck,
  faXmark
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip } from '@heroui/react'
import { useLibraryStore } from '@renderer/store/libraryStore'
import { useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { formatBytes } from '../utils/formatting'

const getFocusableElements = (container: HTMLElement): HTMLElement[] => {
  return [
    ...container.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
  ].filter(
    (element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true'
  )
}

export const GamesScreen = (): React.JSX.Element => {
  const {
    platforms,
    openPlatform,
    backToPlatforms,
    gamesLoading,
    visibleGames,
    showDownloadedOnly,
    platformMenuRef,
    showPlatformMenu,
    selectionMode,
    togglePlatformMenu,
    toggleShowDownloadedOnly,
    selectedGames,
    selectedTotalSize,
    selectionKind,
    openBulkDeleteConfirmModal,
    downloadSelectedGames,
    clearSelection,
    gameTileClick,
    downloadSnapshot,
    toggleSelectionMode
  } = useLibraryStore()
  const navigate = useNavigate()
  const { platformId } = useParams()
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const gamesGridRef = useRef<HTMLDivElement | null>(null)
  const hasAutoFocusedGamesRef = useRef(false)

  useEffect(() => {
    if (!platformId) {
      return
    }

    hasAutoFocusedGamesRef.current = false
    const platform = platforms.find((p) => p.id === platformId)

    if (platform) {
      void openPlatform(platform)
    }

    return () => {
      backToPlatforms()
    }
  }, [platformId, platforms, openPlatform, backToPlatforms])

  const menuPanelClass =
    'absolute right-0 top-12 z-30 grid min-w-[260px]  bg-zinc-900/95 shadow-2xl backdrop-blur overflow-visible border'

  useEffect(() => {
    const menuElement = platformMenuRef.current

    if (showPlatformMenu && menuElement) {
      const focusableElements = getFocusableElements(menuElement)
      ;(focusableElements[0] ?? menuElement).focus()
      return
    }

    menuTriggerRef.current?.focus()
  }, [platformMenuRef, selectionMode, showPlatformMenu])

  useEffect(() => {
    if (showPlatformMenu) {
      return
    }

    hasAutoFocusedGamesRef.current = false
  }, [showPlatformMenu])

  useEffect(() => {
    if (
      gamesLoading ||
      showPlatformMenu ||
      visibleGames.length === 0 ||
      hasAutoFocusedGamesRef.current
    ) {
      return
    }

    const grid = gamesGridRef.current

    if (!grid) {
      return
    }

    const firstGameButton = grid.querySelector<HTMLElement>('button:not([disabled])')

    if (!firstGameButton) {
      return
    }

    hasAutoFocusedGamesRef.current = true
    window.requestAnimationFrame(() => {
      firstGameButton.focus()
    })
  }, [gamesLoading, showPlatformMenu, visibleGames])

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      togglePlatformMenu()
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
      <Card className="overflow-visible">
        <Card.Content className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="flex flex-wrap gap-3">
            <Button isDisabled={selectionMode} onPress={() => navigate('/')} variant="tertiary">
              <FontAwesomeIcon icon={faArrowLeft} />
              Back to library
            </Button>
            <Button
              isDisabled={selectionMode}
              onPress={() => navigate('/downloads')}
              variant="tertiary"
            >
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
              <Card className={menuPanelClass} onKeyDown={handleMenuKeyDown}>
                <Card.Content ref={platformMenuRef} role="menu" tabIndex={-1} className="gap-3">
                  <Button
                    fullWidth
                    onPress={() => {
                      togglePlatformMenu()
                      toggleShowDownloadedOnly()
                    }}
                    variant="tertiary"
                  >
                    <FontAwesomeIcon icon={faFilter} />
                    {showDownloadedOnly ? 'Show all games' : 'Show downloaded only'}
                  </Button>
                  <Button
                    fullWidth
                    onPress={() => {
                      togglePlatformMenu()
                      toggleSelectionMode()
                    }}
                    variant="tertiary"
                  >
                    <FontAwesomeIcon icon={selectionMode ? faXmark : faListCheck} />
                    {selectionMode ? 'Exit selection mode' : 'Select games'}
                  </Button>
                </Card.Content>
              </Card>
            ) : null}
          </div>
        </Card.Content>
      </Card>

      <Card>
        <Card.Content className="grid gap-4">
          <div className="flex flex-wrap items-center gap-3">
            {selectionMode ? (
              <Chip className="h-9 rounded-full px-4 text-base" variant="soft">
                <FontAwesomeIcon icon={selectedGames.length ? faSquareCheck : faSquare} />
                {selectedGames.length} selected
                {selectedGames.length > 0 ? ` (${formatBytes(selectedTotalSize)})` : ''}
              </Chip>
            ) : null}
            {selectionMode && selectedGames.length > 0 ? (
              <Button
                isDisabled={selectedGames.length === 0}
                onPress={() => {
                  if (selectionKind === 'downloaded') {
                    openBulkDeleteConfirmModal()
                  } else {
                    void downloadSelectedGames()
                  }
                }}
                variant={selectionKind === 'downloaded' ? 'danger' : 'primary'}
              >
                {selectionKind === 'downloaded'
                  ? `Delete ${selectedGames.length || ''}`
                  : `Download ${selectedGames.length || ''}`}
              </Button>
            ) : null}
            {selectionMode ? (
              <Button
                isDisabled={selectedGames.length === 0}
                onPress={clearSelection}
                variant="tertiary"
              >
                <FontAwesomeIcon icon={faXmark} />
                Clear selection
              </Button>
            ) : null}
            {selectionMode ? (
              <Button onPress={toggleSelectionMode} variant="tertiary">
                Cancel
              </Button>
            ) : null}
          </div>

          {gamesLoading ? (
            <p className="rounded-xl  bg-white/5 p-6 text-center text-zinc-400">Loading games...</p>
          ) : visibleGames.length === 0 ? (
            <p className="rounded-xl  bg-white/5 p-6 text-center text-zinc-400">
              {showDownloadedOnly
                ? 'No downloaded games found for this platform.'
                : 'No ROM files found in this platform folder on the FTP server.'}
            </p>
          ) : (
            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6 3xl:grid-cols-8"
              ref={gamesGridRef}
            >
              {visibleGames.map((game, index) => {
                const queueItem = downloadSnapshot.items.find((item) => item.gameId === game.id)
                const checked = selectedGames.some((selectedGame) => selectedGame.id === game.id)
                const isDownloading = Boolean(
                  queueItem && ['queued', 'downloading'].includes(queueItem.status)
                )
                const isDisabledBySelectionKind =
                  selectionMode &&
                  selectionKind !== null &&
                  (selectionKind === 'downloaded' ? !game.downloaded : game.downloaded)
                const isSelectionDisabled =
                  selectionMode && (isDownloading || isDisabledBySelectionKind)
                const isDownloaded = game.downloaded || queueItem?.status === 'completed'
                const bottomStatusLabel =
                  queueItem && queueItem.status !== 'completed'
                    ? `${queueItem.status} ${queueItem.progress}%`
                    : isDownloaded
                      ? 'Downloaded'
                      : null

                return (
                  <button
                    autoFocus={index === 0 && !showPlatformMenu}
                    className={`group relative flex h-full flex-col gap-2 overflow-hidden rounded-2xl border p-2 text-left transition ${
                      checked
                        ? 'border-white/35 bg-white/15 ring-2 ring-white/35'
                        : isSelectionDisabled
                          ? 'border-white/10 bg-white/5 opacity-45'
                          : 'border-white/10 bg-white/5 hover:bg-white/10'
                    } ${isDownloading ? 'ring-1 ring-sky-300/40' : ''}`}
                    disabled={isSelectionDisabled}
                    data-game-entry-id={game.id}
                    key={game.id}
                    onClick={() => gameTileClick(game)}
                    type="button"
                  >
                    {selectionMode ? (
                      <span className="absolute left-2 top-2 z-10 text-zinc-100">
                        <FontAwesomeIcon icon={checked ? faSquareCheck : faSquare} />
                      </span>
                    ) : null}

                    <span className="absolute right-2 top-2 z-10 rounded-full bg-black/65 px-2 py-0.5 text-xs font-semibold text-zinc-100">
                      {formatBytes(game.size)}
                    </span>

                    <div className="-mx-2 -mt-2 grid aspect-3/4 place-items-center overflow-hidden bg-black/25">
                      {game.coverUrl ? (
                        <img
                          alt={game.displayName}
                          className="h-full w-full object-cover"
                          loading="lazy"
                          src={game.coverUrl}
                        />
                      ) : (
                        <div className="text-xs text-zinc-500">No cover</div>
                      )}
                    </div>

                    <div className="flex min-h-14 flex-1 flex-col items-center justify-center gap-1">
                      <strong className="line-clamp-2 block max-h-8 text-center text-sm leading-4 text-zinc-100">
                        {game.displayName}
                      </strong>
                      {game.discLabel ? (
                        <Chip color="warning" size="md" variant="soft">
                          {game.discLabel}
                        </Chip>
                      ) : null}
                    </div>

                    <div
                      className={`-mx-2 -mb-2 mt-auto flex h-8 items-center justify-center px-3 text-center text-xs font-semibold uppercase tracking-[0.08em] ${bottomStatusLabel ? 'text-white' : 'text-transparent'} ${
                        bottomStatusLabel
                          ? queueItem && queueItem.status !== 'completed'
                            ? 'bg-sky-600'
                            : 'bg-emerald-600'
                          : 'bg-transparent'
                      }`}
                    >
                      {bottomStatusLabel ?? ''}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </Card.Content>
      </Card>
    </section>
  )
}
