import { describe, expect, it } from 'vitest'

import { getTogetherDays } from '../../src/utils/space-days'

describe('共同生活天数', () => {
  it('按上海自然日计算，并把创建当天记为第 1 天', () => {
    expect(getTogetherDays('2026-11-03T01:20:00Z', '2026-11-03')).toBe(1)
    expect(getTogetherDays('2026-11-02T15:30:00Z', '2026-11-03')).toBe(2)
  })

  it('缺少或无法解析创建时间时不伪造天数', () => {
    expect(getTogetherDays('', '2026-11-03')).toBeNull()
    expect(getTogetherDays('not-a-date', '2026-11-03')).toBeNull()
  })
})
