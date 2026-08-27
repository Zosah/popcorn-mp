import { addCalendarDays, getShanghaiDateOnly } from '../domain/expiry'
import type { InventoryItem } from '../domain/inventory'

export function createDemoInventoryItems(nowMs = Date.now()): InventoryItem[] {
  const today = getShanghaiDateOnly(nowMs)
  const createdAt = new Date(nowMs).toISOString()
  const base = {
    spaceId: 'space-demo',
    purchasedOn: addCalendarDays(today, -5),
    openedOn: null,
    status: 'active' as const,
    version: 1,
    deletedAt: null,
    createdAt,
    updatedAt: createdAt,
  }

  return [
    {
      ...base,
      id: 'demo-milk',
      name: '鲜牛奶',
      category: 'drink',
      quantity: '1',
      unit: '盒',
      location: 'fridge',
      expiresOn: addCalendarDays(today, -1),
      note: '开封后尽快喝完',
    },
    {
      ...base,
      id: 'demo-yogurt',
      name: '原味酸奶',
      category: 'drink',
      quantity: '3',
      unit: '杯',
      location: 'fridge',
      expiresOn: addCalendarDays(today, 2),
      note: '',
    },
    {
      ...base,
      id: 'demo-eggs',
      name: '可生食鸡蛋',
      category: 'food',
      quantity: '8',
      unit: '枚',
      location: 'fridge',
      expiresOn: addCalendarDays(today, 6),
      note: '周末做早餐',
    },
    {
      ...base,
      id: 'demo-dumplings',
      name: '玉米猪肉水饺',
      category: 'frozen',
      quantity: '2',
      unit: '袋',
      location: 'freezer',
      expiresOn: addCalendarDays(today, 48),
      note: '',
    },
    {
      ...base,
      id: 'demo-detergent',
      name: '洗衣凝珠',
      category: 'daily',
      quantity: '24',
      unit: '颗',
      location: 'bathroom',
      expiresOn: null,
      note: '低于 5 颗时补货',
    },
  ]
}
