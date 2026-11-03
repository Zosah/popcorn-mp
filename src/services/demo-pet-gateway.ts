import type {
  DemoPetEvent,
  DemoPetState,
  PetSpecies,
  PetSupplyPreference,
} from '../domain/demo-pet'
import {
  addDemoPet,
  addDemoPetDailyLog,
  addDemoPetEvent,
  addDemoPetSupply,
  addDemoPetWeight,
  createDemoPetStatusNote,
  getDemoPetStore,
  removeDemoPet,
  removeDemoPetDailyLog,
  removeDemoPetEvent,
  removeDemoPetStatusNote,
  removeDemoPetWeight,
  switchDemoPet,
  updateDemoPetEvent,
  updateDemoPetProfile,
  updateDemoPetSupply,
  updateDemoPetSupplyStatus,
  updateDemoPetStatusNote,
  updateDemoPetWeight,
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
      events: pet.events.map((event) => ({ ...event })),
      supplies: pet.supplies.map((item) => ({ ...item })),
      weights: pet.weights.map((item) => ({ ...item })),
      dailyLogs: pet.dailyLogs.map((item) => ({ ...item })),
      profile: { ...pet.profile, statusNotes: pet.profile.statusNotes.map((item) => ({ ...item })) },
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
    const backgroundChanged = (pet.profile.backgroundMediaId ?? '') !== input.backgroundMediaId
    if (!backgroundChanged) return updateDemoPetProfile(input)
    const history = input.backgroundMediaId
      ? [
          {
            mediaId: input.backgroundMediaId,
            usedAt: new Date().toISOString(),
            url: input.backgroundUrl ?? '',
          },
          ...(pet.profile.backgroundHistory ?? []).filter(
            (item) => item.mediaId !== input.backgroundMediaId,
          ),
        ].slice(0, 12)
      : pet.profile.backgroundHistory ?? []
    return updateDemoPetProfile({
      ...input,
      backgroundUrl: input.backgroundUrl ?? '',
      backgroundHistory: history,
    })
  }

  async remove(petId: string, currentVersion: number): Promise<void> {
    const pet = collection().pets.find((item) => item.profile.id === petId)
    if (!pet) throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    assertVersion(pet.profile.version, currentVersion)
    removeDemoPet(petId)
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

  async addWeight(
    petId: string,
    input: { value: string; recordedOn: string },
  ): Promise<DemoPetState> {
    if (activePet().profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    return addDemoPetWeight(input)
  }

  async updateWeight(
    petId: string,
    weightId: string,
    input: { value: string; recordedOn: string },
  ): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    if (!pet.weights.some((item) => item.id === weightId)) {
      throw new PetGatewayError('WEIGHT_NOT_FOUND', '体重记录不存在')
    }
    return updateDemoPetWeight(weightId, input)
  }

  async removeWeight(petId: string, weightId: string): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    if (!pet.weights.some((item) => item.id === weightId)) {
      throw new PetGatewayError('WEIGHT_NOT_FOUND', '体重记录不存在')
    }
    return removeDemoPetWeight(weightId)
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

  async removeDailyLog(petId: string, logId: string): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    if (!pet.dailyLogs.some((item) => item.id === logId && !item.deletedAt)) {
      throw new PetGatewayError('DAILY_LOG_NOT_FOUND', '日常记录不存在')
    }
    return removeDemoPetDailyLog(logId)
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

  async updateSupply(
    petId: string,
    supplyId: string,
    input: PetSupplyInput,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    const supply = pet.supplies.find((item) => item.id === supplyId)
    if (!supply) throw new PetGatewayError('SUPPLY_NOT_FOUND', '宠物用品不存在')
    assertVersion(supply.version, currentVersion)
    return updateDemoPetSupply(supplyId, input)
  }

  async setSupplyStatus(
    petId: string,
    supplyId: string,
    preference: PetSupplyPreference,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    const supply = pet.supplies.find((item) => item.id === supplyId)
    if (!supply) throw new PetGatewayError('SUPPLY_NOT_FOUND', '宠物用品不存在')
    assertVersion(supply.version, currentVersion)
    return updateDemoPetSupplyStatus(supplyId, preference)
  }

  async createStatusNote(petId: string, content: string): Promise<DemoPetState> {
    if (activePet().profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    if (activePet().profile.statusNotes.length >= 2) {
      throw new PetGatewayError('STATUS_LIMIT', '最近状态最多保留 2 条')
    }
    return createDemoPetStatusNote(content)
  }

  async updateStatusNote(
    petId: string,
    noteId: string,
    content: string,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    const note = pet.profile.statusNotes.find((item) => item.id === noteId)
    if (!note) throw new PetGatewayError('STATUS_NOT_FOUND', '最近状态不存在')
    assertVersion(note.version, currentVersion)
    return updateDemoPetStatusNote(noteId, content)
  }

  async removeStatusNote(
    petId: string,
    noteId: string,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const pet = activePet()
    if (pet.profile.id !== petId) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    const note = pet.profile.statusNotes.find((item) => item.id === noteId)
    if (!note) throw new PetGatewayError('STATUS_NOT_FOUND', '最近状态不存在')
    assertVersion(note.version, currentVersion)
    return removeDemoPetStatusNote(noteId)
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
