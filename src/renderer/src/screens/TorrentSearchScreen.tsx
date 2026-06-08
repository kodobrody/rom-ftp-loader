import { faArrowLeft } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { Button, Card, Chip, Input } from '@heroui/react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { TorrentGameGroup } from '../../../shared/types'
import { TorrentGameModal } from '../components/modals/TorrentGameModal'
import { useTorrentStore } from '../store/torrentStore'
import { fuzzyScore } from '../utils/search'

type TorrentSearchEntry = {
  platformDisplayName: string
  platformSourceName: string
  game: TorrentGameGroup
}

export const TorrentSearchScreen = (): React.JSX.Element => {
  const navigate = useNavigate()
  const { platforms, openTorrentGame } = useTorrentStore()
  const [query, setQuery] = useState('')

  const searchIndexQuery = useQuery({
    queryKey: ['torrent-search-index', platforms.map((p) => p.id).join('|')],
    enabled: platforms.length > 0,
    queryFn: async () => {
      const allGamesByPlatform = await Promise.all(
        platforms.map(async (platform) => {
          const games = await window.api.listTorrentGames(platform.sourceName)
          return games.map<TorrentSearchEntry>((game) => ({
            platformDisplayName: platform.displayName,
            platformSourceName: platform.sourceName,
            game
          }))
        })
      )
      return allGamesByPlatform.flat()
    }
  })

  const results = useMemo(() => {
    const q = query.trim()
    if (!q || !searchIndexQuery.data) return [] as TorrentSearchEntry[]

    return searchIndexQuery.data
      .map((entry) => {
        const score = Math.max(
          fuzzyScore(q, entry.game.displayName),
          fuzzyScore(q, entry.game.cleanedName)
        )
        return { entry, score }
      })
      .filter(({ score }) => score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20)
      .map(({ entry }) => entry)
  }, [searchIndexQuery.data, query])

  return (
    <section className="grid gap-3">
      <Button className="w-fit gap-2" onPress={() => navigate('/torrents')} variant="tertiary">
        <FontAwesomeIcon className="shrink-0" icon={faArrowLeft} />
        Back to STOREnt
      </Button>

      <Card>
        <Card.Content className="grid gap-3 p-4">
          <Input
            autoFocus
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search torrent games..."
            value={query}
          />

          {searchIndexQuery.isLoading ? (
            <p className="grid min-h-24 place-items-center text-center text-sm text-zinc-400">
              Building search index...
            </p>
          ) : query.trim().length === 0 ? (
            <p className="grid min-h-24 place-items-center text-center text-sm text-zinc-400">
              Type to search across all torrent platforms.
            </p>
          ) : results.length === 0 ? (
            <p className="grid min-h-24 place-items-center text-center text-sm text-zinc-400">
              No matching games found.
            </p>
          ) : (
            <div className="grid max-h-[52vh] gap-3 overflow-auto p-1">
              {results.map((entry) => (
                <button
                  className="flex w-full items-center justify-between gap-3 rounded-xl bg-white/5 p-3 text-left transition hover:bg-white/10"
                  key={`${entry.platformSourceName}:${entry.game.id}`}
                  onClick={() => openTorrentGame(entry.game)}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="grid h-14 w-11 shrink-0 place-items-center overflow-hidden rounded-md bg-black/20 text-[10px] text-zinc-400">
                      {entry.game.coverUrl ? (
                        <img
                          alt={entry.game.displayName}
                          className="h-full w-full object-cover"
                          src={entry.game.coverUrl}
                        />
                      ) : (
                        <span>No cover</span>
                      )}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-zinc-100">
                        {entry.game.displayName}
                      </span>
                    </span>
                  </span>
                  <Chip size="md" variant="soft">
                    {entry.platformDisplayName}
                  </Chip>
                </button>
              ))}
            </div>
          )}
        </Card.Content>
      </Card>

      <TorrentGameModal />
    </section>
  )
}
