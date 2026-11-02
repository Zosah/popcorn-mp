import { describe, expect, it } from 'vitest'

import {
  formatTravelDateRange,
  formatTravelDuration,
  resolveTravelTripStatus,
  toTravelDateTimeParts,
  toTravelISO,
  travelDuration,
} from '../../src/domain/travel'

describe('travelDuration', () => {
  it('按上海自然日计算几天几夜', () => {
    expect(travelDuration(
      '2026-11-06T01:00:00.000Z',
      '2026-11-08T10:00:00.000Z',
    )).toEqual({ days: 3, nights: 2 })
  })

  it('同一天往返显示当天往返', () => {
    const duration = travelDuration(
      '2026-11-06T01:00:00.000Z',
      '2026-11-06T10:00:00.000Z',
    )
    expect(duration).toEqual({ days: 1, nights: 0 })
    expect(formatTravelDuration(duration.days, duration.nights)).toBe('当天往返')
  })

  it('非法或倒序时间返回待定', () => {
    expect(travelDuration('not-a-date', '2026-11-08T10:00:00.000Z'))
      .toEqual({ days: 0, nights: 0 })
    expect(travelDuration(
      '2026-11-09T10:00:00.000Z',
      '2026-11-08T10:00:00.000Z',
    )).toEqual({ days: 0, nights: 0 })
  })
})

describe('travel date helpers', () => {
  it('在上海时区还原日期和时间', () => {
    expect(toTravelDateTimeParts('2026-11-06T01:05:00.000Z')).toEqual({
      date: '2026-11-06',
      time: '09:05',
    })
  })

  it('日期选择器提交为 +08:00 对应的 UTC 时间', () => {
    expect(toTravelISO('2026-11-06', '09:30')).toBe(
      '2026-11-06T01:30:00.000Z',
    )
  })

  it('格式化跨日行程区间', () => {
    expect(formatTravelDateRange(
      '2026-11-06T01:00:00.000Z',
      '2026-11-08T10:00:00.000Z',
    )).toBe('11月6日 09:00 — 11月8日 18:00')
  })
})

describe('resolveTravelTripStatus', () => {
  const departAt = '2026-11-06T01:00:00.000Z'
  const returnAt = '2026-11-08T10:00:00.000Z'

  it.each([
    ['2026-11-05T00:00:00.000Z', 'upcoming'],
    ['2026-11-06T01:00:00.000Z', 'traveling'],
    ['2026-11-08T10:00:00.000Z', 'traveling'],
    ['2026-11-08T10:00:01.000Z', 'ended'],
  ] as const)('%s 对应 %s', (now, status) => {
    expect(resolveTravelTripStatus(departAt, returnAt, Date.parse(now))).toBe(status)
  })
})
