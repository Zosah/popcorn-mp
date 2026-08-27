import { describe, expect, it } from 'vitest'

import { buildHomeSnapshot } from '../../src/domain/home'
import { createInventoryItem } from '../fixtures/inventory'

function shanghaiTime(hour: number, minute = 0): number {
  return Date.UTC(2026, 7, 26, hour - 8, minute)
}

describe('buildHomeSnapshot', () => {
  it.each([
    [0, 'late-night', '夜深了'],
    [4, 'late-night', '夜深了'],
    [5, 'morning', '早上好'],
    [11, 'morning', '早上好'],
    [12, 'afternoon', '下午好'],
    [17, 'afternoon', '下午好'],
    [18, 'evening', '我回来啦'],
    [23, 'evening', '我回来啦'],
  ] as const)('上海时间 %s 点使用正确问候', (hour, period, salutation) => {
    expect(buildHomeSnapshot([], shanghaiTime(hour))).toMatchObject({
      period,
      salutation,
    })
  })

  it('提供稳定的上海自然日文案', () => {
    expect(buildHomeSnapshot([], shanghaiTime(18))).toMatchObject({
      today: '2026-08-26',
      dateLabel: '8月26日',
      weekdayLabel: '星期三',
    })
  })

  it('优先提示已过期物品', () => {
    const snapshot = buildHomeSnapshot(
      [
        createInventoryItem({ id: 'expired', expiresOn: '2026-08-25' }),
        createInventoryItem({ id: 'urgent', expiresOn: '2026-08-28' }),
      ],
      shanghaiTime(18),
    )
    expect(snapshot.inventoryNoticeCount).toBe(2)
    expect(snapshot.inventoryNotice).toBe('冰箱里有 1 件已经过期，先处理一下。')
  })

  it('没有过期物品时提示三天内到期数量', () => {
    const snapshot = buildHomeSnapshot(
      [
        createInventoryItem({ id: 'today', expiresOn: '2026-08-26' }),
        createInventoryItem({ id: 'urgent', expiresOn: '2026-08-28' }),
      ],
      shanghaiTime(9),
    )
    expect(snapshot.inventoryNoticeCount).toBe(2)
    expect(snapshot.inventoryNotice).toBe('有 2 件东西三天内到期。')
  })

  it('库存正常时给出克制的完成状态', () => {
    const snapshot = buildHomeSnapshot(
      [createInventoryItem({ expiresOn: '2026-09-20' })],
      shanghaiTime(9),
    )
    expect(snapshot.inventoryNoticeCount).toBe(0)
    expect(snapshot.inventoryNotice).toBe('家里的库存都还好。')
  })

  it('只统计仍在使用且未删除的在库物品', () => {
    const snapshot = buildHomeSnapshot(
      [
        createInventoryItem({ id: 'active' }),
        createInventoryItem({ id: 'consumed', status: 'consumed' }),
        createInventoryItem({ id: 'deleted', deletedAt: '2026-08-25T10:00:00Z' }),
      ],
      shanghaiTime(18),
    )

    expect(snapshot.inventoryItemCount).toBe(1)
  })
})
