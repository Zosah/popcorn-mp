import type { InventoryItem } from '../domain/inventory'
import { createDemoInventoryItems } from '../mocks/inventory-fixtures'
import {
  MockInventoryGateway,
  type InventoryStorage,
} from '../mocks/mock-inventory-gateway'

const STORAGE_KEY = 'popcorn_demo_inventory_v1'

class WechatInventoryStorage implements InventoryStorage {
  get(): InventoryItem[] | null {
    const value = wx.getStorageSync<InventoryItem[] | ''>(STORAGE_KEY)
    return Array.isArray(value) ? value : null
  }

  set(items: readonly InventoryItem[]): void {
    wx.setStorageSync(STORAGE_KEY, items)
  }
}

const storage = new WechatInventoryStorage()

function createGateway(): MockInventoryGateway {
  return new MockInventoryGateway({
    initialItems: createDemoInventoryItems(),
    storage,
  })
}

export let inventoryGateway = createGateway()

export function resetDemoInventory(): void {
  wx.removeStorageSync(STORAGE_KEY)
  inventoryGateway = createGateway()
}
