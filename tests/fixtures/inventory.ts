import type { InventoryItem } from '../../src/domain/inventory'

export function createInventoryItem(
  overrides: Partial<InventoryItem> = {},
): InventoryItem {
  return {
    id: 'item-1',
    spaceId: 'space-demo',
    name: '鲜牛奶',
    category: 'drink',
    quantity: '1',
    unit: '盒',
    location: 'fridge',
    purchasedOn: '2026-08-20',
    openedOn: null,
    expiresOn: '2026-08-27',
    note: '',
    status: 'active',
    version: 1,
    deletedAt: null,
    createdAt: '2026-08-20T08:00:00.000Z',
    updatedAt: '2026-08-20T08:00:00.000Z',
    ...overrides,
  }
}
