import type {
  InventoryItem,
  InventoryItemInput,
  InventoryLifecycleStatus,
} from '../domain/inventory'
import type { InventoryFilters } from '../domain/inventory-query'
import { filterInventoryItems } from '../domain/inventory-query'
import {
  InventoryGatewayError,
  type InventoryGateway,
} from '../services/inventory-gateway'

export interface InventoryStorage {
  get(): InventoryItem[] | null
  set(items: readonly InventoryItem[]): void
}

export interface MockInventoryGatewayOptions {
  initialItems: readonly InventoryItem[]
  storage?: InventoryStorage
  now?: () => number
  idGenerator?: () => string
}

export class MockInventoryGateway implements InventoryGateway {
  private items: InventoryItem[]
  private readonly storage?: InventoryStorage
  private readonly now: () => number
  private readonly idGenerator: () => string

  constructor(options: MockInventoryGatewayOptions) {
    this.storage = options.storage
    this.now = options.now ?? Date.now
    this.idGenerator =
      options.idGenerator ??
      (() => `demo-${this.now()}-${Math.random().toString(36).slice(2, 8)}`)
    const stored = this.storage?.get()
    this.items = this.cloneItems(stored ?? options.initialItems)
    if (stored === null) {
      this.persist()
    }
  }

  async list(filters: InventoryFilters, today: string): Promise<InventoryItem[]> {
    return filterInventoryItems(this.items, filters, today)
  }

  async get(id: string): Promise<InventoryItem | null> {
    const item = this.items.find(
      (candidate) => candidate.id === id && candidate.deletedAt === null,
    )
    return item ? { ...item } : null
  }

  async create(input: InventoryItemInput): Promise<InventoryItem> {
    const timestamp = new Date(this.now()).toISOString()
    const item: InventoryItem = {
      ...input,
      name: input.name.trim(),
      id: this.idGenerator(),
      spaceId: 'space-demo',
      status: 'active',
      version: 1,
      deletedAt: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    this.items.push(item)
    this.persist()
    return { ...item }
  }

  async update(
    id: string,
    input: InventoryItemInput,
    version: number,
  ): Promise<InventoryItem> {
    const item = this.findItem(id)
    this.assertVersion(item, version)
    Object.assign(item, input, {
      name: input.name.trim(),
      version: item.version + 1,
      updatedAt: new Date(this.now()).toISOString(),
    })
    this.persist()
    return { ...item }
  }

  async remove(id: string, version: number): Promise<void> {
    const item = this.findItem(id)
    this.assertVersion(item, version)
    const timestamp = new Date(this.now()).toISOString()
    item.deletedAt = timestamp
    item.updatedAt = timestamp
    item.version += 1
    this.persist()
  }

  async changeStatus(
    id: string,
    status: InventoryLifecycleStatus,
    version: number,
  ): Promise<InventoryItem> {
    const item = this.findItem(id)
    this.assertVersion(item, version)
    item.status = status
    item.version += 1
    item.updatedAt = new Date(this.now()).toISOString()
    this.persist()
    return { ...item }
  }

  private cloneItems(items: readonly InventoryItem[]): InventoryItem[] {
    return items.map((item) => ({ ...item }))
  }

  private persist(): void {
    this.storage?.set(this.cloneItems(this.items))
  }

  private findItem(id: string): InventoryItem {
    const item = this.items.find(
      (candidate) => candidate.id === id && candidate.deletedAt === null,
    )
    if (!item) {
      throw new InventoryGatewayError('NOT_FOUND', '物品不存在')
    }
    return item
  }

  private assertVersion(item: InventoryItem, version: number): void {
    if (item.version !== version) {
      throw new InventoryGatewayError(
        'VERSION_CONFLICT',
        '物品已被更新，请刷新后重试',
      )
    }
  }
}
