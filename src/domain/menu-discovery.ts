export type MenuRecipeFilter = 'all' | 'fast'

const DAY_MILLISECONDS = 24 * 60 * 60 * 1000

/** 同一天首次进入时保持推荐稳定，避免每次刷新都像随机广告位。 */
export function recommendationIndexForDate(count: number, date = new Date()): number {
  if (count <= 0) return 0
  const dayKey = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  const dayNumber = Math.floor(dayKey / DAY_MILLISECONDS)
  return ((dayNumber % count) + count) % count
}

export function nextRecommendationIndex(currentIndex: number, count: number): number {
  if (count <= 1) return 0
  return (Math.max(0, currentIndex) + 1) % count
}

export function menuFilterMaxMinutes(filter: MenuRecipeFilter): number | undefined {
  return filter === 'fast' ? 30 : undefined
}
