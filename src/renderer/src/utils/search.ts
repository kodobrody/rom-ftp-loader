import type { GameEntry, PlatformSummary } from '../../../shared/types'

export type SearchIndexEntry = {
  platform: PlatformSummary
  game: GameEntry
}

const normalizeSearchText = (value: string): string => {
  return value.toLowerCase().trim()
}

export const fuzzyScore = (query: string, candidate: string): number => {
  const q = normalizeSearchText(query)
  const text = normalizeSearchText(candidate)

  if (!q) {
    return 0
  }

  const includesIndex = text.indexOf(q)
  if (includesIndex >= 0) {
    return 1200 - includesIndex * 4 - (text.length - q.length)
  }

  let score = 0
  let queryIndex = 0
  let streak = 0

  for (let textIndex = 0; textIndex < text.length && queryIndex < q.length; textIndex += 1) {
    if (text[textIndex] === q[queryIndex]) {
      queryIndex += 1
      streak += 1
      score += 8 + streak * 3
    } else {
      streak = 0
      score -= 0.2
    }
  }

  if (queryIndex !== q.length) {
    return -1
  }

  return score - (text.length - q.length) * 0.35
}
