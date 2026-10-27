import type {
  InventoryItem,
  InventoryItemInput,
  InventoryLifecycleStatus,
} from '../domain/inventory'
import type {
  InventoryFilters,
  InventorySummary,
} from '../domain/inventory-query'
import { readApiToken, readStoredApiSession } from '../stores/session'
import type {
  ApiInventoryItem,
  ApiInventoryItemInput,
  ApiInventoryItemList,
  ApiInventorySummary,
} from '../types/api'
import { requestApi } from './http'
import {
  InventoryGatewayError,
  type InventoryGateway,
} from './inventory-gateway'
import { TransportError } from './transport'

const PAGE_LIMIT = 100
const MAX_PAGE_COUNT = 20
const STATUS_ACTIONS: Record<InventoryLifecycleStatus, string> = {
  active: 'restore',
  consumed: 'consume',
  discarded: 'discard',
  archived: 'archive',
}

interface InventoryContext {
  token: string
  spaceId: string
}

export class HttpInventoryGateway implements InventoryGateway {
  async list(filters: InventoryFilters, _today: string): Promise<InventoryItem[]> {
    const context = inventoryContext()
    const items: ApiInventoryItem[] = []
    let cursor = ''

    try {
      for (let pageIndex = 0; pageIndex < MAX_PAGE_COUNT; pageIndex += 1) {
        const page = await retryNetwork(() => requestApi<ApiInventoryItemList>(
          inventoryListPath(context.spaceId, filters, cursor),
          { token: context.token },
        ))
        items.push(...page.items)
        if (!page.nextCursor) return items.map(toInventoryItem)
        cursor = page.nextCursor
      }
      throw new InventoryGatewayError(
        'TOO_MANY_PAGES',
        '库存数据过多，请增加筛选条件后重试',
      )
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async summary(_today: string): Promise<InventorySummary> {
    const context = inventoryContext()
    try {
      const summary = await retryNetwork(() => requestApi<ApiInventorySummary>(
        `/spaces/${encodeURIComponent(context.spaceId)}/inventory/summary`,
        { token: context.token },
      ))
      return { ...summary }
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async get(id: string): Promise<InventoryItem | null> {
    const context = inventoryContext()
    try {
      const item = await retryNetwork(() => requestApi<ApiInventoryItem>(
        inventoryItemPath(context.spaceId, id),
        { token: context.token },
      ))
      return toInventoryItem(item)
    } catch (error) {
      if (error instanceof TransportError && error.code === 'NOT_FOUND') return null
      throw toGatewayError(error)
    }
  }

  async create(input: InventoryItemInput): Promise<InventoryItem> {
    const context = inventoryContext()
    const key = createIdempotencyKey('create')
    try {
      const item = await retryNetwork(() => requestApi<ApiInventoryItem>(
        `/spaces/${encodeURIComponent(context.spaceId)}/inventory/items`,
        {
          method: 'POST',
          token: context.token,
          body: toApiInput(input),
          headers: { 'Idempotency-Key': key },
        },
      ))
      return toInventoryItem(item)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async update(
    id: string,
    input: InventoryItemInput,
    version: number,
  ): Promise<InventoryItem> {
    const context = inventoryContext()
    const key = createIdempotencyKey('update')
    try {
      const item = await retryNetwork(() => requestApi<ApiInventoryItem>(
        inventoryItemPath(context.spaceId, id),
        {
          method: 'PUT',
          token: context.token,
          body: toApiInput(input),
          headers: {
            'If-Match': versionETag(version),
            'Idempotency-Key': key,
          },
        },
      ))
      return toInventoryItem(item)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async remove(id: string, version: number): Promise<void> {
    const context = inventoryContext()
    const key = createIdempotencyKey('delete')
    try {
      await retryNetwork(() => requestApi<void>(
        inventoryItemPath(context.spaceId, id),
        {
          method: 'DELETE',
          token: context.token,
          headers: {
            'If-Match': versionETag(version),
            'Idempotency-Key': key,
          },
        },
      ))
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async changeStatus(
    id: string,
    status: InventoryLifecycleStatus,
    version: number,
  ): Promise<InventoryItem> {
    const context = inventoryContext()
    const key = createIdempotencyKey(status)
    const action = STATUS_ACTIONS[status]
    try {
      const item = await retryNetwork(() => requestApi<ApiInventoryItem>(
        `${inventoryItemPath(context.spaceId, id)}/${action}`,
        {
          method: 'POST',
          token: context.token,
          headers: {
            'If-Match': versionETag(version),
            'Idempotency-Key': key,
          },
        },
      ))
      return toInventoryItem(item)
    } catch (error) {
      throw toGatewayError(error)
    }
  }
}

function inventoryContext(): InventoryContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new InventoryGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new InventoryGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
  }
}

function inventoryListPath(
  spaceId: string,
  filters: InventoryFilters,
  cursor: string,
): string {
  const params: string[] = []
  const add = (name: string, value: string) => {
    params.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
  }
  const query = filters.query?.trim()
  if (query) add('query', query)
  for (const category of filters.categories ?? []) add('category', category)
  for (const location of filters.locations ?? []) add('location', location)
  for (const expiryStatus of filters.expiryStatuses ?? []) {
    add('expiryStatus', expiryStatus)
  }
  for (const status of filters.lifecycleStatuses ?? []) add('status', status)
  if (cursor) add('cursor', cursor)
  add('limit', String(PAGE_LIMIT))
  return `/spaces/${encodeURIComponent(spaceId)}/inventory/items?${params.join('&')}`
}

function inventoryItemPath(spaceId: string, itemId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/inventory/items/${encodeURIComponent(itemId)}`
}

function toInventoryItem(item: ApiInventoryItem): InventoryItem {
  return { ...item }
}

function toApiInput(input: InventoryItemInput): ApiInventoryItemInput {
  return { ...input }
}

function versionETag(version: number): string {
  return `"${version}"`
}

function createIdempotencyKey(action: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `inventory_${action}_${timestamp}_${random}`.slice(0, 64)
}

async function retryNetwork<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof TransportError) || error.code !== 'NETWORK_ERROR') {
      throw error
    }
    return operation()
  }
}

function toGatewayError(error: unknown): InventoryGatewayError {
  if (error instanceof InventoryGatewayError) return error
  if (error instanceof TransportError) {
    return new InventoryGatewayError(error.code, error.message)
  }
  return new InventoryGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '库存操作没有完成',
  )
}
