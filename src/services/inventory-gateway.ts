import type {
  InventoryItem,
  InventoryItemInput,
  InventoryLifecycleStatus,
} from '../domain/inventory'
import type { InventoryFilters } from '../domain/inventory-query'

export type InventoryGatewayErrorCode = 'NOT_FOUND' | 'VERSION_CONFLICT'

export class InventoryGatewayError extends Error {
  constructor(
    public readonly code: InventoryGatewayErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'InventoryGatewayError'
  }
}

export interface InventoryGateway {
  list(filters: InventoryFilters, today: string): Promise<InventoryItem[]>
  get(id: string): Promise<InventoryItem | null>
  create(input: InventoryItemInput): Promise<InventoryItem>
  update(
    id: string,
    input: InventoryItemInput,
    version: number,
  ): Promise<InventoryItem>
  remove(id: string, version: number): Promise<void>
  changeStatus(
    id: string,
    status: InventoryLifecycleStatus,
    version: number,
  ): Promise<InventoryItem>
}
