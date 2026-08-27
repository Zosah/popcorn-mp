import { describe, expect, it } from 'vitest'

import {
  addCalendarDays,
  getShanghaiDateOnly,
  resolveExpiry,
} from '../../src/domain/expiry'

describe('resolveExpiry', () => {
  const today = '2026-08-26'

  it.each([
    [null, 'none', null, '未设置有效期'],
    ['2026-08-25', 'expired', -1, '已过期 1 天'],
    ['2026-08-26', 'today', 0, '今日到期'],
    ['2026-08-27', 'urgent', 1, '还剩 1 天'],
    ['2026-08-29', 'urgent', 3, '还剩 3 天'],
    ['2026-08-30', 'soon', 4, '还剩 4 天'],
    ['2026-09-02', 'soon', 7, '还剩 7 天'],
    ['2026-09-03', 'normal', 8, '还剩 8 天'],
  ] as const)('正确识别 %s 的到期状态', (expiresOn, status, days, label) => {
    expect(resolveExpiry(expiresOn, today)).toEqual({
      status,
      daysRemaining: days,
      label,
    })
  })

  it.each(['2026/08/26', '2026-02-30', '', 'not-a-date']) (
    '拒绝非法日期 %s',
    (expiresOn) => {
      expect(() => resolveExpiry(expiresOn, today)).toThrow('无效日期')
    },
  )

  it('正确处理跨年和闰年自然日', () => {
    expect(resolveExpiry('2027-01-02', '2026-12-31').daysRemaining).toBe(2)
    expect(resolveExpiry('2028-03-01', '2028-02-28').daysRemaining).toBe(2)
  })
})

describe('getShanghaiDateOnly', () => {
  it('以上海时区确定自然日边界', () => {
    expect(getShanghaiDateOnly(Date.UTC(2026, 7, 26, 15, 59, 59))).toBe(
      '2026-08-26',
    )
    expect(getShanghaiDateOnly(Date.UTC(2026, 7, 26, 16, 0, 0))).toBe(
      '2026-08-27',
    )
  })
})

describe('addCalendarDays', () => {
  it('支持向前和向后跨月计算', () => {
    expect(addCalendarDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addCalendarDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})
