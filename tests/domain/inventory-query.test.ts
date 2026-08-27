import { describe, expect, it } from 'vitest'

import {
  filterInventoryItems,
  summarizeInventory,
} from '../../src/domain/inventory-query'
import { createInventoryItem } from '../fixtures/inventory'

const today = '2026-08-26'

describe('filterInventoryItems', () => {
  const items = [
    createInventoryItem({ id: 'milk', name: '鲜牛奶' }),
    createInventoryItem({
      id: 'cola',
      name: 'COLA Zero',
      expiresOn: '2026-09-20',
      location: 'living-room',
    }),
    createInventoryItem({
      id: 'egg',
      name: '鸡蛋',
      category: 'food',
      expiresOn: '2026-08-30',
    }),
    createInventoryItem({
      id: 'archived',
      name: '旧面包',
      category: 'food',
      status: 'archived',
    }),
    createInventoryItem({
      id: 'deleted',
      name: '已删除物品',
      deletedAt: '2026-08-25T00:00:00.000Z',
    }),
  ]

  it('默认只返回在库且未删除物品', () => {
    expect(filterInventoryItems(items, {}, today).map((item) => item.id)).toEqual([
      'milk',
      'cola',
      'egg',
    ])
  })

  it('支持中文子串、英文大小写和首尾空格搜索', () => {
    expect(filterInventoryItems(items, { query: '  牛奶 ' }, today)[0]?.id).toBe(
      'milk',
    )
    expect(filterInventoryItems(items, { query: 'cola zero' }, today)[0]?.id).toBe(
      'cola',
    )
  })

  it('同维度使用 OR，不同维度使用 AND', () => {
    const result = filterInventoryItems(
      items,
      {
        categories: ['drink', 'food'],
        locations: ['fridge'],
        expiryStatuses: ['urgent', 'soon'],
      },
      today,
    )
    expect(result.map((item) => item.id)).toEqual(['milk', 'egg'])
  })

  it('空筛选数组不限制结果', () => {
    expect(
      filterInventoryItems(
        items,
        { categories: [], locations: [], expiryStatuses: [] },
        today,
      ),
    ).toHaveLength(3)
  })

  it('显式生命周期筛选时可查看归档物品', () => {
    expect(
      filterInventoryItems(items, { lifecycleStatuses: ['archived'] }, today).map(
        (item) => item.id,
      ),
    ).toEqual(['archived'])
  })

  it('不修改输入数组和物品对象', () => {
    const snapshot = JSON.stringify(items)
    const result = filterInventoryItems(items, {}, today)
    expect(JSON.stringify(items)).toBe(snapshot)
    expect(result[0]).not.toBe(items[0])
  })
})

describe('summarizeInventory', () => {
  it('统计六类到期状态并排除非在库和软删除物品', () => {
    const items = [
      createInventoryItem({ id: 'expired', expiresOn: '2026-08-25' }),
      createInventoryItem({ id: 'today', expiresOn: '2026-08-26' }),
      createInventoryItem({ id: 'urgent', expiresOn: '2026-08-28' }),
      createInventoryItem({ id: 'soon', expiresOn: '2026-09-01' }),
      createInventoryItem({ id: 'normal', expiresOn: '2026-09-10' }),
      createInventoryItem({ id: 'none', expiresOn: null }),
      createInventoryItem({ id: 'used', status: 'consumed' }),
      createInventoryItem({ id: 'deleted', deletedAt: '2026-08-26T00:00:00Z' }),
    ]

    expect(summarizeInventory(items, today)).toEqual({
      total: 6,
      expired: 1,
      today: 1,
      urgent: 1,
      soon: 1,
      normal: 1,
      none: 1,
      dueWithin3Days: 2,
    })
  })

  it('空库存返回全零摘要', () => {
    expect(summarizeInventory([], today)).toEqual({
      total: 0,
      expired: 0,
      today: 0,
      urgent: 0,
      soon: 0,
      normal: 0,
      none: 0,
      dueWithin3Days: 0,
    })
  })
})
