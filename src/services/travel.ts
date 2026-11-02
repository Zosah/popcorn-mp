import { appConfig } from '../config/env'
import { DemoTravelGateway } from './demo-travel-gateway'
import { HttpTravelGateway } from './http-travel'
import type { TravelGateway } from './travel-gateway'

function createTravelGateway(): TravelGateway {
  return appConfig.demoMode
    ? new DemoTravelGateway()
    : new HttpTravelGateway()
}

export let travelGateway = createTravelGateway()

export function refreshTravelGateway(): void {
  travelGateway = createTravelGateway()
}
