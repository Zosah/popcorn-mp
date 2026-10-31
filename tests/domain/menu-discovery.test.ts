import { describe, expect, it } from 'vitest'

import {
  menuFilterMaxMinutes,
  nextRecommendationIndex,
  recommendationIndexForDate,
} from '../../src/domain/menu-discovery'

describe('菜单发现规则', () => {
  it('同一天推荐保持稳定，并落在有效菜谱范围内', () => {
    const morning = new Date(2026, 10, 1, 8, 0, 0)
    const evening = new Date(2026, 10, 1, 22, 0, 0)

    expect(recommendationIndexForDate(5, morning)).toBe(
      recommendationIndexForDate(5, evening),
    )
    expect(recommendationIndexForDate(5, morning)).toBeGreaterThanOrEqual(0)
    expect(recommendationIndexForDate(5, morning)).toBeLessThan(5)
  })

  it('空菜单和单道菜不会越界', () => {
    expect(recommendationIndexForDate(0)).toBe(0)
    expect(nextRecommendationIndex(0, 0)).toBe(0)
    expect(nextRecommendationIndex(0, 1)).toBe(0)
  })

  it('换一道会在列表内循环，快速筛选固定为 30 分钟', () => {
    expect(nextRecommendationIndex(0, 3)).toBe(1)
    expect(nextRecommendationIndex(2, 3)).toBe(0)
    expect(menuFilterMaxMinutes('fast')).toBe(30)
    expect(menuFilterMaxMinutes('all')).toBeUndefined()
  })
})
