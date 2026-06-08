import {
  faArrowLeft,
  faDownload,
  faFile,
  faImage,
  faMagnifyingGlass,
  faXmark
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Chip, Modal } from '@heroui/react'
import { useTorrentStore } from '@renderer/store/torrentStore'
import { useState } from 'react'
import type { IgdbSearchResult } from '../../../../shared/types'
import { formatBytes } from '../../utils/formatting'

export const TorrentGameModal = (): React.JSX.Element | null => {
  const {
    activeTorrentGame,
    closeTorrentGame,
    downloadSnapshot,
    queueDownload,
    patchGameMetadata
  } = useTorrentStore()

  const [mode, setMode] = useState<'details' | 'manual' | 'pick-release'>('details')
  const [manualQuery, setManualQuery] = useState('')
  const [manualResults, setManualResults] = useState<IgdbSearchResult[]>([])
  const [manualError, setManualError] = useState<string | null>(null)
  const [manualSearching, setManualSearching] = useState(false)
  const [manualApplyingId, setManualApplyingId] = useState<number | null>(null)

  const resetManualState = (): void => {
    setMode('details')
    setManualQuery('')
    setManualResults([])
    setManualError(null)
    setManualSearching(false)
    setManualApplyingId(null)
  }

  const closeModal = (): void => {
    resetManualState()
    closeTorrentGame()
  }

  if (!activeTorrentGame) return null
  const game = activeTorrentGame

  const getFileDownloadItem = (entryId: string) =>
    downloadSnapshot.items.find((i) => i.torrentFileId === entryId) ?? null

  const hasMultipleReleases = game.files.length > 1
  const representativeFileName = game.files[0]?.fileName ?? ''

  const REGION_TOKENS = new Set([
    'usa',
    'us',
    'eur',
    'europe',
    'jpn',
    'japan',
    'jp',
    'world',
    'global',
    'pal',
    'ntsc',
    'ntscu',
    'ntscj',
    'asia'
  ])
  const LANGUAGE_MAP: Record<string, string> = {
    de: 'DE',
    ger: 'DE',
    deu: 'DE',
    german: 'DE',
    en: 'EN',
    eng: 'EN',
    english: 'EN',
    es: 'ES',
    spa: 'ES',
    spanish: 'ES',
    fr: 'FR',
    fra: 'FR',
    fre: 'FR',
    french: 'FR',
    it: 'IT',
    ita: 'IT',
    italian: 'IT',
    ja: 'JA',
    jpn: 'JA',
    japanese: 'JA',
    ko: 'KO',
    kor: 'KO',
    korean: 'KO',
    pl: 'PL',
    pol: 'PL',
    polish: 'PL',
    pt: 'PT',
    por: 'PT',
    portuguese: 'PT',
    ru: 'RU',
    rus: 'RU',
    russian: 'RU',
    zh: 'ZH',
    chi: 'ZH',
    zho: 'ZH',
    chinese: 'ZH',
    cn: 'ZH',
    tw: 'ZH'
  }

  const extractInfoPills = (fileName: string): string[] => {
    const baseName = fileName.replace(/\.[^.]+$/, '')
    const parts: string[] = []
    for (const match of baseName.matchAll(/\(([^)]+)\)|\[([^\]]+)\]/g)) {
      const group = match[1] ?? match[2]
      if (group)
        parts.push(
          ...group
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean)
        )
    }
    const normalized = parts.map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, ''))
    const regionToken = normalized.find((t) => REGION_TOKENS.has(t))
    const regionPill = regionToken
      ? `Region: ${regionToken === 'us' ? 'USA' : regionToken.toUpperCase()}`
      : null
    const versionSource = parts.find((p) => /\bv(?:er(?:sion)?)?\s*\d+/i.test(p))
    const versionMatch = versionSource?.match(/\bv(?:er(?:sion)?)?\s*([0-9]+(?:\.[0-9]+)*)/i)
    const versionPill = versionMatch
      ? `Version: ${versionMatch[1].replace(/(?:\.0+)+$/g, '').replace(/\.$/, '') || versionMatch[1]}`
      : null
    const languages = Array.from(
      new Set(normalized.map((t) => LANGUAGE_MAP[t]).filter((v): v is string => Boolean(v)))
    )
    const languagePill = languages.length > 0 ? `Languages: ${languages.join(', ')}` : null
    const demoPill =
      parts.some((p) => /\bdemo\b/i.test(p)) || /\bdemo\b/i.test(baseName) ? 'Demo' : null
    return [regionPill, versionPill, languagePill, demoPill].filter((p): p is string => Boolean(p))
  }

  const infoPills = extractInfoPills(representativeFileName)
  const fileSizes = game.files.map((f) => f.size)
  const minSize = Math.min(...fileSizes)
  const maxSize = Math.max(...fileSizes)
  const sizeLabel =
    hasMultipleReleases && minSize !== maxSize
      ? `Size: ${formatBytes(minSize)} – ${formatBytes(maxSize)}`
      : `Size: ${formatBytes(minSize)}`
  const stackedPills = [sizeLabel, ...infoPills]

  const isAnyBusy = game.files.some((f) => {
    const d = getFileDownloadItem(f.entryId)
    return d?.status === 'queued' || d?.status === 'downloading' || d?.status === 'extracting'
  })
  const isAllCompleted =
    game.files.length > 0 &&
    game.files.every((f) => getFileDownloadItem(f.entryId)?.status === 'completed')
  const activeDownloadItem =
    game.files
      .map((f) => getFileDownloadItem(f.entryId))
      .find((d) => d && (d.status === 'downloading' || d.status === 'queued')) ?? null

  const executeManualSearch = async (queryOverride?: string): Promise<void> => {
    const q = (queryOverride ?? manualQuery).trim()
    if (!q) {
      setManualResults([])
      setManualError(null)
      return
    }
    setManualSearching(true)
    setManualError(null)
    try {
      const results = await window.api.searchIgdbGames(game.platformSourceName, q)
      setManualResults(results)
    } catch (error) {
      setManualError(error instanceof Error ? error.message : 'Failed to search IGDB.')
      setManualResults([])
    } finally {
      setManualSearching(false)
    }
  }

  const selectManualMatch = async (result: IgdbSearchResult): Promise<void> => {
    setManualApplyingId(result.id)
    setManualError(null)
    try {
      const metadata = await window.api.manualMatchGameMetadata(
        game.platformSourceName,
        representativeFileName,
        result.name,
        result.coverUrl
      )
      patchGameMetadata(game.id, metadata)
      resetManualState()
    } catch (error) {
      setManualError(error instanceof Error ? error.message : 'Failed to apply manual metadata.')
    } finally {
      setManualApplyingId(null)
    }
  }

  return (
    <Modal.Backdrop
      isOpen
      onOpenChange={(open) => {
        if (!open) closeModal()
      }}
    >
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-210">
          <Modal.Body className="p-2">
            {/* ── Manual match view ── */}
            {mode === 'manual' ? (
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <Button onPress={resetManualState} variant="tertiary">
                    <FontAwesomeIcon icon={faArrowLeft} />
                    Back to details
                  </Button>
                </div>
                <h2 className="text-left text-2xl font-semibold text-zinc-100">Manual Match</h2>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
                  <input
                    className="h-10 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-zinc-100 outline-none"
                    onChange={(e) => setManualQuery(e.target.value)}
                    placeholder="Search IGDB"
                    type="text"
                    value={manualQuery}
                  />
                  <Button
                    isDisabled={!manualQuery.trim() || manualSearching}
                    onPress={() => void executeManualSearch()}
                    variant="primary"
                  >
                    <FontAwesomeIcon icon={faMagnifyingGlass} />
                    {manualSearching ? 'Searching...' : 'Search'}
                  </Button>
                </div>
                {manualError ? <p className="text-sm text-red-300">{manualError}</p> : null}
                {manualResults.length > 0 ? (
                  <div
                    className={`grid gap-2 pr-1 ${manualResults.length >= 8 ? 'max-h-96 overflow-auto' : ''}`}
                  >
                    {manualResults.map((result) => (
                      <div
                        className="grid w-full grid-cols-[56px_1fr_auto] items-center gap-3 rounded-xl bg-white/5 px-3 py-3"
                        key={result.id}
                      >
                        <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/10">
                          {result.coverUrl ? (
                            <img
                              alt={result.name}
                              className="h-full w-full object-cover"
                              src={result.coverUrl}
                            />
                          ) : (
                            <FontAwesomeIcon icon={faImage} />
                          )}
                        </span>
                        <span className="truncate text-left text-base">{result.name}</span>
                        <Button
                          isDisabled={manualApplyingId !== null}
                          onPress={() => void selectManualMatch(result)}
                          size="sm"
                          variant="primary"
                        >
                          Update match
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : manualSearching ? null : (
                  <p className="text-sm text-zinc-400">No IGDB matches yet. Search to begin.</p>
                )}
              </div>
            ) : /* ── Pick release view ── */
            mode === 'pick-release' ? (
              <div className="grid gap-4">
                <div className="flex items-center gap-3">
                  <Button onPress={() => setMode('details')} variant="tertiary">
                    <FontAwesomeIcon icon={faArrowLeft} />
                    Back to details
                  </Button>
                </div>
                <h2 className="text-left text-2xl font-semibold text-zinc-100">Choose a release</h2>
                <div className="grid gap-3">
                  {game.files.map((file) => {
                    const downloadItem = getFileDownloadItem(file.entryId)
                    const isBusy =
                      downloadItem?.status === 'queued' ||
                      downloadItem?.status === 'downloading' ||
                      downloadItem?.status === 'extracting'
                    const isCompleted = downloadItem?.status === 'completed'
                    const hasError = downloadItem?.status === 'error'
                    return (
                      <div
                        className="grid gap-3 rounded-xl bg-white/5 p-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                        key={file.entryId}
                      >
                        <div className="min-w-0">
                          <strong className="block text-sm text-zinc-100">
                            {file.releaseGroupName}
                          </strong>
                          <span className="block truncate text-xs text-zinc-400">
                            {file.fileName}
                          </span>
                          <span className="block text-xs text-zinc-500">
                            {formatBytes(file.size)}
                          </span>
                          {downloadItem && !isCompleted && !hasError ? (
                            <div className="mt-2 grid gap-1">
                              <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                                <div
                                  className="h-full bg-linear-to-r from-blue-400 to-cyan-400 transition-all"
                                  style={{
                                    width:
                                      downloadItem.status === 'extracting'
                                        ? '100%'
                                        : `${downloadItem.progress}%`
                                  }}
                                />
                              </div>
                              <span className="text-xs text-cyan-400">
                                {downloadItem.status === 'extracting'
                                  ? 'Extracting...'
                                  : downloadItem.status === 'downloading'
                                    ? `${formatBytes(downloadItem.bytesTransferred)} / ${formatBytes(downloadItem.totalBytes)} (${downloadItem.progress}%)`
                                    : 'Queued'}
                              </span>
                            </div>
                          ) : null}
                          {hasError && downloadItem?.error ? (
                            <p className="mt-1 text-xs text-rose-300">{downloadItem.error}</p>
                          ) : null}
                        </div>
                        <Button
                          isDisabled={isBusy || isCompleted}
                          onPress={() => void queueDownload(file.entryId)}
                          variant={isCompleted ? 'secondary' : 'primary'}
                        >
                          {isCompleted ? (
                            'Downloaded'
                          ) : isBusy ? (
                            'Downloading...'
                          ) : (
                            <>
                              <FontAwesomeIcon icon={faDownload} /> Download
                            </>
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* ── Details view ── */
              <div className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                  <div className="overflow-hidden rounded-xl">
                    {game.coverUrl ? (
                      <img
                        alt={game.displayName}
                        className="aspect-3/4 h-full w-full object-cover"
                        src={game.coverUrl}
                      />
                    ) : (
                      <div className="grid aspect-3/4 place-items-center text-sm text-zinc-400">
                        No cover
                      </div>
                    )}
                  </div>
                  <div className="grid content-start gap-3">
                    {stackedPills.length > 0 ? (
                      <div className="grid justify-items-start gap-2">
                        {stackedPills.map((pill) => (
                          <Chip key={pill} size="md" variant="soft">
                            {pill}
                          </Chip>
                        ))}
                      </div>
                    ) : null}
                    {isAnyBusy && activeDownloadItem ? (
                      <>
                        <div className="h-2 w-full max-w-lg overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full bg-linear-to-r from-blue-400 to-cyan-400 transition-all"
                            style={{ width: `${activeDownloadItem.progress}%` }}
                          />
                        </div>
                        <p className="text-sm text-zinc-300">
                          {activeDownloadItem.status} {activeDownloadItem.progress}%
                        </p>
                      </>
                    ) : null}
                  </div>
                </div>

                <h2 className="text-left text-2xl font-semibold text-zinc-100">
                  {game.displayName}
                </h2>

                <div className="grid gap-2">
                  <p className="text-sm font-semibold text-zinc-200">
                    {hasMultipleReleases ? `${game.files.length} releases` : 'File'}
                  </p>
                  <div className="grid gap-2">
                    {game.files.map((file) => (
                      <div
                        className="grid grid-cols-[20px_1fr_auto] items-center gap-3 rounded-xl bg-white/5 p-3"
                        key={file.entryId}
                      >
                        <div className="grid place-items-center text-zinc-300">
                          <FontAwesomeIcon icon={faFile} />
                        </div>
                        <div className="grid gap-1">
                          {hasMultipleReleases ? (
                            <p className="text-xs font-semibold text-zinc-300">
                              {file.releaseGroupName}
                            </p>
                          ) : null}
                          <p className="break-all text-sm font-semibold text-zinc-100">
                            {file.fileName}
                          </p>
                        </div>
                        <Chip size="sm" variant="soft">
                          {formatBytes(file.size)}
                        </Chip>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </Modal.Body>
          <Modal.Footer>
            {mode !== 'details' ? null : isAllCompleted ? (
              <Chip color="success" size="md" variant="soft">
                Downloaded
              </Chip>
            ) : (
              <Button
                autoFocus
                isDisabled={isAnyBusy}
                onPress={() => {
                  if (!hasMultipleReleases) {
                    void queueDownload(game.files[0].entryId)
                    closeModal()
                  } else {
                    setMode('pick-release')
                  }
                }}
                variant="primary"
              >
                <FontAwesomeIcon icon={faDownload} />
                {isAnyBusy ? 'Downloading...' : 'Download'}
              </Button>
            )}
            {mode === 'details' ? (
              <Button
                onPress={() => {
                  const q =
                    game.cleanedName.trim() ||
                    game.displayName.trim() ||
                    representativeFileName.replace(/\.[^.]+$/, '').trim()
                  setMode('manual')
                  setManualError(null)
                  setManualResults([])
                  setManualQuery(q)
                  void executeManualSearch(q)
                }}
                variant="tertiary"
              >
                <FontAwesomeIcon icon={faMagnifyingGlass} />
                Manual Match
              </Button>
            ) : null}
            <Button onPress={closeModal} variant="tertiary">
              <FontAwesomeIcon icon={faXmark} />
              Close
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
