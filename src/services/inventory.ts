import { appConfig } from '../config/env'
import { createDemoInventoryGateway } from './demo-inventory'
import { HttpInventoryGateway } from './http-inventory'
import type { InventoryGateway } from './inventory-gateway'

function createInventoryGateway(): InventoryGateway {
  return appConfig.demoMode
    ? createDemoInventoryGateway()
    : new HttpInventoryGateway()
}

export let inventoryGateway = createInventoryGateway()

export function refreshInventoryGateway(): void {
  inventoryGateway = createInventoryGateway()
}
