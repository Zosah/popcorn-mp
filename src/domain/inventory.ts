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
  /** 图片状态：pending 生成中 / ready 已有图 / failed 生成失败 */
  imageState?: string
  /** 用户选择的图标 key，空表示按名称自动匹配 */
  iconKey?: string
  status: InventoryLifecycleStatus
  version: number
  events?: InventoryEvent[]
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface InventoryEvent {
  id: string
  kind: 'created' | 'quantity' | 'updated' | 'status' | string
  userName?: string
  summary: string
  detail?: string
  quantityFrom: string
  quantityTo: string
  createdAt: string
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
