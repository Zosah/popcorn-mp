import type {
  ExpiryStatus,
  InventoryCategory,
  InventoryItem,
  InventoryLifecycleStatus,
  InventoryLocation,
} from './inventory'
import { resolveExpiry } from './expiry'

export interface InventoryFilters {
  query?: string
  categories?: InventoryCategory[]
  locations?: InventoryLocation[]
  expiryStatuses?: ExpiryStatus[]
  lifecycleStatuses?: InventoryLifecycleStatus[]
}

export interface InventorySummary {
  total: number
  expired: number
  today: number
  urgent: number
  soon: number
  normal: number
  none: number
  dueWithin3Days: number
}

export function filterInventoryItems(
  items: readonly InventoryItem[],
  filters: InventoryFilters,
  today: string,
): InventoryItem[] {
  const query = filters.query?.trim().toLocaleLowerCase() ?? ''
  const lifecycleStatuses =
    filters.lifecycleStatuses && filters.lifecycleStatuses.length > 0
      ? filters.lifecycleStatuses
      : ['active']

  return items
    .filter((item) => item.deletedAt === null)
    .filter((item) => lifecycleStatuses.includes(item.status))
    .filter(
      (item) =>
        query.length === 0 || item.name.toLocaleLowerCase().includes(query),
    )
    .filter(
      (item) =>
        !filters.categories?.length || filters.categories.includes(item.category),
    )
    .filter(
      (item) =>
        !filters.locations?.length || filters.locations.includes(item.location),
    )
    .filter(
      (item) =>
        !filters.expiryStatuses?.length ||
        filters.expiryStatuses.includes(resolveExpiry(item.expiresOn, today).status),
    )
    .map((item) => ({ ...item }))
}

export function summarizeInventory(
  items: readonly InventoryItem[],
  today: string,
): InventorySummary {
  const summary: InventorySummary = {
    total: 0,
    expired: 0,
    today: 0,
    urgent: 0,
    soon: 0,
    normal: 0,
    none: 0,
    dueWithin3Days: 0,
  }

  for (const item of items) {
    if (item.deletedAt !== null || item.status !== 'active') {
      continue
    }

    const expiry = resolveExpiry(item.expiresOn, today)
    summary.total += 1
    summary[expiry.status] += 1
    if (expiry.status === 'today' || expiry.status === 'urgent') {
      summary.dueWithin3Days += 1
    }
  }

  return summary
}
