import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip } from '@heroui/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { OnScreenKeyboard } from '../components/OnScreenKeyboard'
import { useLibraryStore } from '../store/libraryStore'
import { useSearchStore } from '../store/searchStore'
import { fuzzyScore, type SearchIndexEntry } from '../utils/search'

const makeSearchEntryKey = (entry: SearchIndexEntry): string => {
  return `${entry.platform.sourceName}:${entry.game.id}`
}

export const SearchScreen = (): React.JSX.Element => {
  const visiblePlatforms = useLibraryStore((store) => store.visiblePlatforms)
  const navigate = useNavigate()
  const {
    applyKeyboardKey,
    hideKeyboard,
    keyboardRows,
    onScreenKeyboardRef,
    openSearchResultInModal,
    resetSearchSession,
    searchInputRef,
    searchQuery,
    showOnScreenKeyboard
  } = useSearchStore()

  const searchIndexQuery = useQuery({
    queryKey: ['search-index', visiblePlatforms.map((platform) => platform.id).join('|')],
    enabled: visiblePlatforms.length > 0,
    queryFn: async () => {
      const allGamesByPlatform = await Promise.all(
        visiblePlatforms.map(async (platform) => {
          const platformGames = await window.api.listGames(platform.sourceName, {
            fetchMissingMetadata: false
          })

          return platformGames.map((game) => ({ platform, game }))
        })
      )

      return allGamesByPlatform.flat()
    }
  })

  const searchResults = useMemo(() => {
    const query = searchQuery.trim()
    if (!query || !searchIndexQuery.data) {
      return [] as SearchIndexEntry[]
    }

    return searchIndexQuery.data
      .map((entry) => {
        const nameScore = fuzzyScore(query, entry.game.displayName || entry.game.name)
        const cleanedScore = fuzzyScore(query, entry.game.cleanedName || entry.game.name)
        const fileScore = fuzzyScore(query, entry.game.name)
        const score = Math.max(nameScore, cleanedScore, fileScore)

        return { entry, score }
      })
      .filter(({ score }) => score >= 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, 5)
      .map(({ entry }) => entry)
  }, [searchIndexQuery.data, searchQuery])

  return (
    <section className="grid gap-3">
      <Button
        className="w-fit gap-2"
        onPress={() => {
          resetSearchSession()
          navigate('/')
        }}
        variant="tertiary"
      >
        <FontAwesomeIcon className="shrink-0" icon={faArrowLeft} />
        Back to library
      </Button>

      <Card className={showOnScreenKeyboard ? 'pb-2' : ''}>
        <Card.Content className="grid gap-3 p-4">
          {searchIndexQuery.isLoading ? (
            <p className="grid min-h-24 place-items-center text-center text-sm text-zinc-400">
              Preparing search index...
            </p>
          ) : searchQuery.trim().length === 0 ? (
            <p className="grid min-h-24 place-items-center text-center text-sm text-zinc-400">
              Type to search across platforms.
            </p>
          ) : searchResults.length === 0 ? (
            <p className="grid min-h-24 place-items-center text-center text-sm text-zinc-400">
              No matching games found.
            </p>
          ) : (
            <div className="grid max-h-[52vh] gap-3 overflow-auto pr-1">
              {searchResults.map((entry) => {
                const resultKey = makeSearchEntryKey(entry)

                return (
                  <button
                    className="flex w-full items-center justify-between gap-3 rounded-xl  bg-white/5 p-3 text-left transition hover:bg-white/10"
                    key={resultKey}
                    onClick={() => {
                      void openSearchResultInModal(entry)
                    }}
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span className="grid h-14 w-11 place-items-center overflow-hidden rounded-md  bg-black/20 text-[10px] text-zinc-400">
                        {entry.game.coverUrl ? (
                          <img
                            alt={entry.game.displayName || entry.game.name}
                            className="h-full w-full object-cover"
                            src={entry.game.coverUrl}
                          />
                        ) : (
                          <span>No cover</span>
                        )}
                      </span>
                      <span className="grid min-w-0 gap-1">
                        <span className="truncate font-medium text-zinc-100">
                          {entry.game.displayName || entry.game.name}
                        </span>
                      </span>
                    </span>
                    <Chip size="md" variant="soft">
                      {entry.platform.name}
                    </Chip>
                  </button>
                )
              })}
            </div>
          )}

          {showOnScreenKeyboard ? (
            <OnScreenKeyboard
              closeLabel="Hide keyboard"
              docked
              onHide={hideKeyboard}
              onKeyPress={applyKeyboardKey}
              ref={onScreenKeyboardRef}
              rows={keyboardRows}
              targetRef={searchInputRef}
            />
          ) : null}
        </Card.Content>
      </Card>
    </section>
  )
}
