import type {
  DemoPetEvent,
  DemoPetProfile,
  DemoPetState,
  PetDailyLogType,
  PetEventType,
  PetSpecies,
  PetSupplyCategory,
  PetSupplyStatus,
} from '../domain/demo-pet'

export interface PetProfileInput {
  name: string
  species: PetSpecies
  breed: string
  sex: 'female' | 'male'
  birthday: string
  homeOn: string
  neuteredOn: string | null
  status: string
  avatarMediaId: string
}

export interface PetEventInput {
  type: PetEventType
  occurredOn: string
  title: string
  note: string
  provider?: string
  cost?: string
  nextOn?: string | null
  recurrenceDays?: number
}

export interface PetDailyLogInput {
  type: PetDailyLogType
  summary: string
  note?: string
}

export interface PetSupplyInput {
  category: PetSupplyCategory
  name: string
  status: PetSupplyStatus
  note?: string
}

export interface PetCollection {
  activePetId: string
  pets: DemoPetState[]
}

export interface PetEventMatch {
  pet: DemoPetState
  event: DemoPetEvent
}

export interface PetGateway {
  list(): Promise<PetCollection>
  setActivePet(id: string): Promise<PetCollection>
  createPet(input: {
    name: string
    species: PetSpecies
    profile?: Partial<PetProfileInput>
  }): Promise<DemoPetState>
  updateProfile(
    petId: string,
    input: PetProfileInput,
    currentVersion: number,
  ): Promise<DemoPetState>
  remove(petId: string, currentVersion: number): Promise<void>
  createEvent(petId: string, input: PetEventInput): Promise<DemoPetState>
  updateEvent(
    petId: string,
    eventId: string,
    input: PetEventInput,
    currentVersion: number,
  ): Promise<DemoPetState>
  removeEvent(
    petId: string,
    eventId: string,
    currentVersion: number,
  ): Promise<DemoPetState>
  addWeight(petId: string, value: string): Promise<DemoPetState>
  addDailyLog(petId: string, input: PetDailyLogInput): Promise<DemoPetState>
  createSupply(petId: string, input: PetSupplyInput): Promise<DemoPetState>
  setSupplyStatus(
    petId: string,
    supplyId: string,
    status: PetSupplyStatus,
    currentVersion: number,
  ): Promise<DemoPetState>
  findEvent(eventId: string): Promise<PetEventMatch | null>
}

export class PetGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'PetGatewayError'
  }
}

export function isPetVersionConflict(error: unknown): boolean {
  return error instanceof PetGatewayError && error.code === 'VERSION_CONFLICT'
}

export function isPetNotFound(error: unknown): boolean {
  return error instanceof PetGatewayError
    && (error.code === 'NOT_FOUND' || error.code === 'EVENT_NOT_FOUND')
}

export function getPetErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof PetGatewayError)) return fallback
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已失效，请重新登录'
    case 'NO_ACTIVE_SPACE':
      return '还没有可用的共同空间'
    case 'VERSION_CONFLICT':
      return '宠物资料已在别处更新，请刷新后再试'
    case 'NETWORK_ERROR':
      return '网络不太稳定，请稍后再试'
    case 'NOT_FOUND':
    case 'EVENT_NOT_FOUND':
      return '这条宠物记录已经不存在'
    case 'SUPPLY_NOT_FOUND':
      return '这条用品记录已经不存在'
    case 'MEDIA_NOT_FOUND':
      return '这张宠物照片已经失效，请重新上传'
    case 'VALIDATION_FAILED':
    case 'PRECONDITION_REQUIRED':
      return error.message || '宠物资料还需要检查一下'
    default:
      return error.message || fallback
  }
}

export function activePetFrom(collection: PetCollection): DemoPetState | null {
  return collection.pets.find((item) => item.profile.id === collection.activePetId)
    ?? collection.pets[0]
    ?? null
}

export function toPetProfileInput(profile: DemoPetProfile): PetProfileInput {
  return {
    name: profile.name,
    species: profile.species,
    breed: profile.breed,
    sex: profile.sex,
    birthday: profile.birthday,
    homeOn: profile.homeOn,
    neuteredOn: profile.neuteredOn,
    status: profile.status,
    avatarMediaId: profile.avatarMediaId ?? '',
  }
}
