import type {
  DemoPetEvent,
  DemoPetState,
  PetSpecies,
  PetSupplyStatus,
} from '../domain/demo-pet'
import {
  addDemoPet,
  addDemoPetDailyLog,
  addDemoPetEvent,
  addDemoPetSupply,
  addDemoPetWeight,
  getDemoPetStore,
  removeDemoPetEvent,
  switchDemoPet,
  updateDemoPetEvent,
  updateDemoPetProfile,
  updateDemoPetSupplyStatus,
} from './demo-pet'
import {
  PetGatewayError,
  type PetCollection,
  type PetDailyLogInput,
  type PetEventInput,
  type PetEventMatch,
  type PetGateway,
  type PetProfileInput,
  type PetSupplyInput,
} from './pet-gateway'

function collection(): PetCollection {
  const store = getDemoPetStore()
  return {
    activePetId: store.activePetId,
    pets: store.pets.map((pet) => ({
      profile: { ...pet.profile },
      events: pet.events.map((event) => ({ ...event })),
      supplies: pet.supplies.map((item) => ({ ...item })),
      weights: pet.weights.map((item) => ({ ...item })),
      dailyLogs: pet.dailyLogs.map((item) => ({ ...item })),
    })),
  }
}

function activePet(): DemoPetState {
  const store = collection()
  return store.pets.find((pet) => pet.profile.id === store.activePetId)
    ?? store.pets[0]
    ?? (() => { throw new PetGatewayError('NOT_FOUND', '还没有宠物档案') })()
}

function assertVersion(current: number | undefined, expected: number): void {
  if ((current ?? 1) !== expected) {
    throw new PetGatewayError('VERSION_CONFLICT', '宠物资料已在别处更新，请刷新后再试')
  }
}

export class DemoPetGateway implements PetGateway {
  async list(): Promise<PetCollection> {
    return collection()
  }

  async setActivePet(id: string): Promise<PetCollection> {
    switchDemoPet(id)
    return collection()
  }

  async createPet(input: {
    name: string
    species: PetSpecies
    profile?: Partial<PetProfileInput>
  }): Promise<DemoPetState> {
    return addDemoPet({
      name: input.name,
      species: input.species,
      profile: input.profile
        ? {
            ...input.profile,
            neuteredOn: input.profile.neuteredOn ?? null,
            avatarMediaId: input.profile.avatarMediaId ?? '',
          }
        : undefined,
    })
  }

  async updateProfile(
    petId: string,
    input: PetProfileInput,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    assertVersion(pet.profile.version, currentVersion)
    return updateDemoPetProfile(input)
  }

  async createEvent(petId: string, input: PetEventInput): Promise<DemoPetState> {
    if (activePet().profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    return addDemoPetEvent(input)
  }

  async updateEvent(
    petId: string,
    eventId: string,
    input: PetEventInput,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    const event = pet.events.find((item) => item.id === eventId)
    if (!event) throw new PetGatewayError('EVENT_NOT_FOUND', '宠物事件不存在')
    assertVersion(event.version, currentVersion)
    return updateDemoPetEvent(eventId, input)
  }

  async removeEvent(
    petId: string,
    eventId: string,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    const event = pet.events.find((item) => item.id === eventId)
    if (!event) throw new PetGatewayError('EVENT_NOT_FOUND', '宠物事件不存在')
    assertVersion(event.version, currentVersion)
    return removeDemoPetEvent(eventId)
  }

  async addWeight(petId: string, value: string): Promise<DemoPetState> {
    if (activePet().profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    return addDemoPetWeight(value)
  }

  async addDailyLog(
    petId: string,
    input: PetDailyLogInput,
  ): Promise<DemoPetState> {
    if (activePet().profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    return addDemoPetDailyLog(input)
  }

  async createSupply(
    petId: string,
    input: PetSupplyInput,
  ): Promise<DemoPetState> {
    if (activePet().profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    return addDemoPetSupply(input)
  }

  async setSupplyStatus(
    petId: string,
    supplyId: string,
    status: PetSupplyStatus,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    const supply = pet.supplies.find((item) => item.id === supplyId)
    if (!supply) throw new PetGatewayError('SUPPLY_NOT_FOUND', '宠物用品不存在')
    assertVersion(supply.version, currentVersion)
    return updateDemoPetSupplyStatus(supplyId, status)
  }

  async findEvent(eventId: string): Promise<PetEventMatch | null> {
    const store = collection()
    for (const pet of store.pets) {
      const event = pet.events.find((item) => item.id === eventId)
      if (event) return { pet, event }
    }
    return null
  }
}

export type { DemoPetEvent }
