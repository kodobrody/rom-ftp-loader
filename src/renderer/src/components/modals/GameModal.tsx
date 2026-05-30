import { faDownload, faFile, faImage, faTrashCan, faXmark } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Chip, Modal } from '@heroui/react'
import { useDeleteConfirmModalStore } from '../../store/modals/deleteConfirmModalStore'
import { useGameModalStore } from '../../store/modals/gameModalStore'
import { formatBytes } from '../../utils/formatting'

interface ModalFileEntry {
  name: string
  size: number
  remotePath: string
}

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
  ar: 'AR',
  ara: 'AR',
  arabic: 'AR',
  bg: 'BG',
  bul: 'BG',
  bulgarian: 'BG',
  ca: 'CA',
  cat: 'CA',
  catalan: 'CA',
  cs: 'CS',
  cze: 'CS',
  ces: 'CS',
  czech: 'CS',
  da: 'DA',
  dan: 'DA',
  danish: 'DA',
  de: 'DE',
  ger: 'DE',
  deu: 'DE',
  german: 'DE',
  el: 'EL',
  gre: 'EL',
  ell: 'EL',
  greek: 'EL',
  en: 'EN',
  eng: 'EN',
  english: 'EN',
  es: 'ES',
  spa: 'ES',
  spanish: 'ES',
  fi: 'FI',
  fin: 'FI',
  finnish: 'FI',
  fr: 'FR',
  fra: 'FR',
  fre: 'FR',
  french: 'FR',
  he: 'HE',
  heb: 'HE',
  hebrew: 'HE',
  hi: 'HI',
  hin: 'HI',
  hindi: 'HI',
  hr: 'HR',
  hrv: 'HR',
  croatian: 'HR',
  hu: 'HU',
  hun: 'HU',
  hungarian: 'HU',
  id: 'ID',
  ind: 'ID',
  indonesian: 'ID',
  it: 'IT',
  ita: 'IT',
  italian: 'IT',
  ja: 'JA',
  jpn: 'JA',
  japanese: 'JA',
  ko: 'KO',
  kor: 'KO',
  korean: 'KO',
  nl: 'NL',
  dut: 'NL',
  nld: 'NL',
  dutch: 'NL',
  no: 'NO',
  nor: 'NO',
  norwegian: 'NO',
  pl: 'PL',
  pol: 'PL',
  polish: 'PL',
  pt: 'PT',
  por: 'PT',
  portuguese: 'PT',
  ro: 'RO',
  ron: 'RO',
  rum: 'RO',
  romanian: 'RO',
  ru: 'RU',
  rus: 'RU',
  russian: 'RU',
  sk: 'SK',
  slk: 'SK',
  slo: 'SK',
  slovak: 'SK',
  sl: 'SL',
  slv: 'SL',
  slovenian: 'SL',
  sr: 'SR',
  srp: 'SR',
  serbian: 'SR',
  sv: 'SV',
  swe: 'SV',
  swedish: 'SV',
  th: 'TH',
  tha: 'TH',
  thai: 'TH',
  tr: 'TR',
  tur: 'TR',
  turkish: 'TR',
  uk: 'UK',
  ukr: 'UK',
  ukrainian: 'UK',
  vi: 'VI',
  vie: 'VI',
  vietnamese: 'VI',
  zh: 'ZH',
  chi: 'ZH',
  zho: 'ZH',
  chinese: 'ZH',
  cn: 'ZH',
  tw: 'ZH'
}

const normalizeVersion = (rawVersion: string): string => {
  const trimmed = rawVersion.replace(/(?:\.0+)+$/g, '').replace(/\.$/, '')
  return trimmed || rawVersion
}

const extractInfoPills = (fileName: string): string[] => {
  const baseName = fileName.replace(/\.[^.]+$/, '')
  const parts: string[] = []

  for (const match of baseName.matchAll(/\(([^)]+)\)|\[([^\]]+)\]/g)) {
    const tokenGroup = match[1] ?? match[2]
    if (tokenGroup) {
      parts.push(
        ...tokenGroup
          .split(',')
          .map((part) => part.trim())
          .filter(Boolean)
      )
    }
  }

  const normalizedParts = parts.map((part) => part.toLowerCase().replace(/[^a-z0-9]/g, ''))

  const regionToken = normalizedParts.find((token) => REGION_TOKENS.has(token))
  const regionPill = regionToken
    ? `Region: ${regionToken === 'us' ? 'USA' : regionToken.toUpperCase()}`
    : null

  const versionSource = parts.find((part) => /\bv(?:er(?:sion)?)?\s*\d+/i.test(part))
  const versionMatch = versionSource?.match(/\bv(?:er(?:sion)?)?\s*([0-9]+(?:\.[0-9]+)*)/i)
  const versionPill = versionMatch ? `Version: ${normalizeVersion(versionMatch[1])}` : null

  const languages = Array.from(
    new Set(
      normalizedParts
        .map((token) => LANGUAGE_MAP[token])
        .filter((value): value is string => Boolean(value))
    )
  )
  const languagePill = languages.length > 0 ? `Languages: ${languages.join(', ')}` : null

  const hasDemo = parts.some((part) => /\bdemo\b/i.test(part)) || /\bdemo\b/i.test(baseName)
  const demoPill = hasDemo ? 'Demo' : null

  return [regionPill, versionPill, languagePill, demoPill].filter((pill): pill is string =>
    Boolean(pill)
  )
}

export const GameModal = (): React.JSX.Element | null => {
  const {
    activeGameQueueItem,
    cancelDownloadFromModal,
    closeGameModal,
    downloadGameFromModal,
    fetchGameMetadataFromModal,
    gameMetadataLoading,
    modalGame
  } = useGameModalStore()
  const { openDeleteConfirmModal } = useDeleteConfirmModalStore()

  if (!modalGame) {
    return null
  }

  const files: ModalFileEntry[] =
    modalGame.downloadFiles && modalGame.downloadFiles.length > 0
      ? modalGame.downloadFiles.map((file) => ({
          name: file.name,
          size: file.size,
          remotePath: file.remotePath
        }))
      : [{ name: modalGame.name, size: modalGame.size, remotePath: modalGame.remotePath }]

  const infoPills = extractInfoPills(modalGame.name)
  const stackedPills = [`Size: ${formatBytes(modalGame.size)}`, ...infoPills]

  return (
    <Modal.Backdrop isOpen={Boolean(modalGame)} onOpenChange={closeGameModal}>
      <Modal.Container>
        <Modal.Dialog className="w-full max-w-210">
          <Modal.Body>
            <div className="grid gap-4">
              <div className="grid gap-4 md:grid-cols-[260px_1fr]">
                <div className="overflow-hidden rounded-xl">
                  {modalGame.coverUrl ? (
                    <img
                      alt={modalGame.displayName}
                      className="aspect-3/4 h-full w-full object-cover"
                      src={modalGame.coverUrl}
                    />
                  ) : (
                    <div className="grid aspect-3/4 place-items-center text-sm text-zinc-400">
                      No cover
                    </div>
                  )}
                </div>
                <div className="grid content-start gap-3">
                  {modalGame.discLabel ? (
                    <p className="text-sm text-zinc-300">Edition: {modalGame.discLabel}</p>
                  ) : null}
                  {stackedPills.length > 0 ? (
                    <div className="grid justify-items-start gap-2">
                      {stackedPills.map((pill) => (
                        <Chip key={pill} size="md" variant="soft">
                          {pill}
                        </Chip>
                      ))}
                    </div>
                  ) : null}

                  {activeGameQueueItem &&
                  ['queued', 'downloading'].includes(activeGameQueueItem.status) ? (
                    <>
                      <div className="h-2 w-full max-w-lg overflow-hidden rounded-full bg-white/10">
                        <div
                          className="h-full bg-linear-to-r from-blue-400 to-cyan-400 transition-all"
                          style={{ width: `${activeGameQueueItem.progress}%` }}
                        />
                      </div>
                      <p className="text-sm text-zinc-300">
                        {activeGameQueueItem.status} {activeGameQueueItem.progress}%
                      </p>
                    </>
                  ) : null}
                </div>
              </div>

              <h2 className="text-left text-2xl font-semibold text-zinc-100">
                {modalGame.displayName}
              </h2>

              <div className="grid gap-2">
                <p className="text-sm font-semibold text-zinc-200">Files</p>
                <div className="grid gap-2">
                  {files.map((file) => (
                    <div
                      className="grid grid-cols-[20px_1fr_auto] items-center gap-3 rounded-xl bg-white/5 p-3"
                      key={file.remotePath}
                    >
                      <div className="grid place-items-center text-zinc-300">
                        <FontAwesomeIcon icon={faFile} />
                      </div>
                      <div className="grid gap-1">
                        <p className="break-all text-sm font-semibold text-zinc-100">{file.name}</p>
                        <p className="break-all text-xs text-zinc-400">{file.remotePath}</p>
                      </div>
                      <div className="grid place-items-center">
                        <Chip size="sm" variant="soft">
                          {formatBytes(file.size)}
                        </Chip>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>
            {activeGameQueueItem &&
            ['queued', 'downloading'].includes(activeGameQueueItem.status) ? (
              <Button
                onPress={() => {
                  void cancelDownloadFromModal()
                }}
                className="font-semibold cursor-pointer"
                variant="primary"
              >
                Cancel
              </Button>
            ) : !modalGame.downloaded ? (
              <Button
                className="font-semibold cursor-pointer"
                onPress={downloadGameFromModal}
                variant="primary"
                autoFocus
              >
                <FontAwesomeIcon icon={faDownload} />
                Download
              </Button>
            ) : (
              <Button
                className="font-semibold cursor-pointer"
                onPress={openDeleteConfirmModal}
                variant="danger"
              >
                <FontAwesomeIcon icon={faTrashCan} />
                Delete
              </Button>
            )}
            <Button
              className="font-semibold cursor-pointer"
              isDisabled={gameMetadataLoading}
              onPress={fetchGameMetadataFromModal}
              variant="tertiary"
            >
              <FontAwesomeIcon icon={faImage} />
              {gameMetadataLoading ? 'Fetching metadata...' : 'Fetch metadata'}
            </Button>
            <Button
              className="font-semibold cursor-pointer"
              onPress={closeGameModal}
              variant="tertiary"
            >
              <FontAwesomeIcon icon={faXmark} />
              Close
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
