export type InventoryCategory =
  | 'food'
  | 'drink'
  | 'frozen'
  | 'seasoning'
  | 'daily'
  | 'medicine'
  | 'pet'
  | 'other'

export type InventoryLocation =
  | 'fridge'
  | 'freezer'
  | 'kitchen'
  | 'living-room'
  | 'bathroom'
  | 'storage'
  | 'other'

export type InventoryLifecycleStatus =
  | 'active'
  | 'consumed'
  | 'discarded'
  | 'archived'

export type ExpiryStatus =
  | 'expired'
  | 'today'
  | 'urgent'
  | 'soon'
  | 'normal'
  | 'none'

export interface InventoryItem {
  id: string
  spaceId: string
  name: string
  category: InventoryCategory
  quantity: string
  unit: string
  location: InventoryLocation
  purchasedOn: string | null
  openedOn: string | null
  expiresOn: string | null
  note: string
  imageMediaId: string
  /** 用户选择的图标 key，空表示按名称自动匹配 */
  iconKey?: string
  status: InventoryLifecycleStatus
  version: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InventoryItemInput {
  name: string
  category: InventoryCategory
  quantity: string
  unit: string
  location: InventoryLocation
  purchasedOn: string | null
  openedOn: string | null
  expiresOn: string | null
  note: string
  imageMediaId: string
  iconKey?: string
}

export interface ExpiryInfo {
  status: ExpiryStatus
  daysRemaining: number | null
  label: string
}
