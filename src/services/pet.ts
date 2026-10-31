import { appConfig } from '../config/env'
import { DemoPetGateway } from './demo-pet-gateway'
import { HttpPetGateway } from './http-pet'
import type { PetGateway } from './pet-gateway'

function createPetGateway(): PetGateway {
  return appConfig.demoMode
    ? new DemoPetGateway()
    : new HttpPetGateway()
}

export let petGateway = createPetGateway()

export function refreshPetGateway(): void {
  petGateway = createPetGateway()
}
