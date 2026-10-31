import { addCalendarDays, getShanghaiDateOnly } from '../domain/expiry'
import type {
  DemoPetDailyLog,
  DemoPetEvent,
  DemoPetProfile,
  DemoPetState,
  DemoPetSupply,
  DemoPetWeight,
  PetDailyLogType,
  PetEventType,
  PetSpecies,
  PetSupplyCategory,
  PetSupplyStatus,
} from '../domain/demo-pet'
import { readStoredApiSession } from '../stores/session'
import type {
  ApiPet,
  ApiPetDailyLogWriteRequest,
  ApiPetEventWriteRequest,
  ApiPetProfileWriteRequest,
  ApiPetSupplyWriteRequest,
  ApiPetWeightWriteRequest,
} from '../types/api'
import { requestApiResponse } from './http'
import { mediaGateway } from './media'
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
import { TransportError } from './transport'

const ACTIVE_PET_STORAGE_KEY = 'popcorn_active_pet_id'
const DEFAULT_SPECIES_LABEL: Record<PetSpecies, string> = {
  cat: '猫咪',
  dog: '狗狗',
  other: '其他伙伴',
}

interface PetContext {
  token: string
  spaceId: string
}

export class HttpPetGateway implements PetGateway {
  async list(): Promise<PetCollection> {
    const context = petContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<{ items: ApiPet[] }>(
        petListPath(context.spaceId),
        { token: context.token },
      ))
      const pets = await Promise.all(response.data.items.map(toPetState))
      return withActivePet(pets)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async setActivePet(id: string): Promise<PetCollection> {
    const current = await this.list()
    if (!current.pets.some((pet) => pet.profile.id === id)) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    wx.setStorageSync(ACTIVE_PET_STORAGE_KEY, id)
    return { ...current, activePetId: id }
  }

  async createPet(input: {
    name: string
    species: PetSpecies
    profile?: Partial<PetProfileInput>
  }): Promise<DemoPetState> {
    const today = getShanghaiDateOnly(Date.now())
    const profile = input.profile ?? {}
    return this.createRequest('create', {
      name: input.name.trim(),
      species: input.species,
      breed: profile.breed ?? DEFAULT_SPECIES_LABEL[input.species],
      sex: profile.sex ?? 'female',
      birthday: profile.birthday ?? addCalendarDays(today, -365),
      homeOn: profile.homeOn ?? today,
      neuteredOn: profile.neuteredOn ?? '',
      status: profile.status ?? '刚刚加入这个家',
      avatarMediaId: profile.avatarMediaId ?? '',
    })
  }

  async updateProfile(
    petId: string,
    input: PetProfileInput,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const context = petContext()
    const key = createIdempotencyKey('profile')
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiPet>(
        petPath(context.spaceId, petId),
        {
          method: 'PUT',
          token: context.token,
          body: toProfileRequest(input),
          headers: {
            'If-Match': ifMatch(currentVersion),
            'Idempotency-Key': key,
          },
        },
      ))
      return toPetState(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async remove(petId: string, currentVersion: number): Promise<void> {
    const context = petContext()
    try {
      await retryNetwork(() => requestApiResponse<void>(
        petPath(context.spaceId, petId),
        {
          method: 'DELETE',
          token: context.token,
          headers: {
            'If-Match': ifMatch(currentVersion),
            'Idempotency-Key': createIdempotencyKey('pet-delete'),
          },
        },
      ))
      if (String(wx.getStorageSync(ACTIVE_PET_STORAGE_KEY) || '') === petId) {
        wx.removeStorageSync(ACTIVE_PET_STORAGE_KEY)
      }
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async createEvent(petId: string, input: PetEventInput): Promise<DemoPetState> {
    return this.writePet('event-create', `${petPath(petContext().spaceId, petId)}/events`, 'POST', toEventRequest(input))
  }

  async updateEvent(
    petId: string,
    eventId: string,
    input: PetEventInput,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const context = petContext()
    return this.writePet(
      'event-update',
      `${petPath(context.spaceId, petId)}/events/${encodeURIComponent(eventId)}`,
      'PUT',
      toEventRequest(input),
      currentVersion,
    )
  }

  async removeEvent(
    petId: string,
    eventId: string,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const context = petContext()
    return this.writePet(
      'event-delete',
      `${petPath(context.spaceId, petId)}/events/${encodeURIComponent(eventId)}`,
      'DELETE',
      undefined,
      currentVersion,
    )
  }

  async addWeight(petId: string, value: string): Promise<DemoPetState> {
    const context = petContext()
    const body: ApiPetWeightWriteRequest = {
      value,
      recordedOn: getShanghaiDateOnly(Date.now()),
    }
    return this.writePet('weight', `${petPath(context.spaceId, petId)}/weights`, 'POST', body)
  }

  async addDailyLog(
    petId: string,
    input: PetDailyLogInput,
  ): Promise<DemoPetState> {
    const context = petContext()
    const body: ApiPetDailyLogWriteRequest = {
      type: input.type,
      summary: input.summary.trim(),
      note: input.note?.trim() ?? '',
      recordedAt: new Date().toISOString(),
    }
    return this.writePet('daily', `${petPath(context.spaceId, petId)}/daily-logs`, 'POST', body)
  }

  async createSupply(
    petId: string,
    input: PetSupplyInput,
  ): Promise<DemoPetState> {
    const context = petContext()
    const body: ApiPetSupplyWriteRequest = {
      category: input.category,
      name: input.name.trim(),
      status: input.status,
      note: input.note?.trim() ?? '',
      recordedOn: getShanghaiDateOnly(Date.now()),
    }
    return this.writePet('supply-create', `${petPath(context.spaceId, petId)}/supplies`, 'POST', body)
  }

  async setSupplyStatus(
    petId: string,
    supplyId: string,
    status: PetSupplyStatus,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const context = petContext()
    return this.writePet(
      'supply-status',
      `${petPath(context.spaceId, petId)}/supplies/${encodeURIComponent(supplyId)}/status`,
      'PUT',
      { status },
      currentVersion,
    )
  }

  async findEvent(eventId: string): Promise<PetEventMatch | null> {
    const collection = await this.list()
    for (const pet of collection.pets) {
      const event = pet.events.find((item) => item.id === eventId)
      if (event) return { pet, event }
    }
    return null
  }

  private async createRequest(
    action: string,
    body: ApiPetProfileWriteRequest,
  ): Promise<DemoPetState> {
    const context = petContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiPet>(
        petListPath(context.spaceId),
        {
          method: 'POST',
          token: context.token,
          body,
          headers: { 'Idempotency-Key': createIdempotencyKey(action) },
        },
      ))
      wx.setStorageSync(ACTIVE_PET_STORAGE_KEY, response.data.id)
      return toPetState(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  private async writePet(
    action: string,
    path: string,
    method: 'POST' | 'PUT' | 'DELETE',
    body?: WechatMiniprogram.IAnyObject,
    currentVersion?: number,
  ): Promise<DemoPetState> {
    const context = petContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiPet>(
        path,
        {
          method,
          token: context.token,
          ...(body ? { body } : {}),
          headers: {
            'Idempotency-Key': createIdempotencyKey(action),
            ...(currentVersion !== undefined
              ? { 'If-Match': ifMatch(currentVersion) }
              : {}),
          },
        },
      ))
      return toPetState(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }
}

function petContext(): PetContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new PetGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new PetGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
  }
}

function petListPath(spaceId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/pets`
}

function petPath(spaceId: string, petId: string): string {
  return `${petListPath(spaceId)}/${encodeURIComponent(petId)}`
}

function withActivePet(pets: DemoPetState[]): PetCollection {
  const saved = String(wx.getStorageSync(ACTIVE_PET_STORAGE_KEY) || '')
  const active = pets.find((pet) => pet.profile.id === saved) ?? pets[0]
  if (active && active.profile.id !== saved) {
    wx.setStorageSync(ACTIVE_PET_STORAGE_KEY, active.profile.id)
  }
  return {
    activePetId: active?.profile.id ?? '',
    pets,
  }
}

async function toPetState(item: ApiPet): Promise<DemoPetState> {
  const avatarUrl = await resolveAvatar(item.avatarMediaId)
  const profile: DemoPetProfile = {
    id: item.id,
    name: item.name,
    species: toSpecies(item.species),
    breed: item.breed,
    sex: item.sex === 'male' ? 'male' : 'female',
    birthday: item.birthday,
    homeOn: item.homeOn,
    neuteredOn: item.neuteredOn || null,
    status: item.status,
    version: item.version,
    avatarMediaId: item.avatarMediaId || '',
    avatarUrl: avatarUrl ?? '',
  }
  return {
    profile,
    events: item.events.map((event): DemoPetEvent => ({
      id: event.id,
      type: toEventType(event.type),
      occurredOn: event.occurredOn,
      title: event.title,
      note: event.note,
      provider: event.provider,
      cost: event.cost,
      nextOn: event.nextOn || null,
      recurrenceDays: event.recurrenceDays || 0,
      createdAt: event.createdAt,
      version: event.version,
    })),
    supplies: item.supplies.map((supply): DemoPetSupply => ({
      id: supply.id,
      category: toSupplyCategory(supply.category),
      name: supply.name,
      status: toSupplyStatus(supply.status),
      note: supply.note,
      recordedOn: supply.recordedOn,
      version: supply.version,
    })),
    weights: item.weights.map((weight): DemoPetWeight => ({
      id: weight.id,
      value: weight.value,
      recordedOn: weight.recordedOn,
    })),
    dailyLogs: item.dailyLogs.map((log): DemoPetDailyLog => ({
      id: log.id,
      type: toDailyLogType(log.type),
      summary: log.summary,
      note: log.note,
      recordedAt: log.recordedAt,
    })),
  }
}

async function resolveAvatar(mediaId: string): Promise<string | undefined> {
  if (!mediaId) return undefined
  try {
    const asset = await mediaGateway.get(mediaId)
    return asset.thumb.url || asset.display.url
  } catch {
    // 图片签名失败不阻塞宠物档案与照护操作，页面会回退到插画头像。
    return undefined
  }
}

function toProfileRequest(input: PetProfileInput): ApiPetProfileWriteRequest {
  return {
    name: input.name.trim(),
    species: input.species,
    breed: input.breed.trim(),
    sex: input.sex,
    birthday: input.birthday,
    homeOn: input.homeOn,
    neuteredOn: input.neuteredOn ?? '',
    status: input.status.trim(),
    avatarMediaId: input.avatarMediaId.trim(),
  }
}

function toEventRequest(input: PetEventInput): ApiPetEventWriteRequest {
  return {
    type: input.type,
    occurredOn: input.occurredOn,
    title: input.title.trim(),
    note: input.note.trim(),
    provider: input.provider?.trim() ?? '',
    cost: input.cost?.trim() ?? '',
    nextOn: input.nextOn ?? null,
    recurrenceDays: input.recurrenceDays ?? 0,
  }
}

function toSpecies(value: string): PetSpecies {
  return value === 'dog' || value === 'other' ? value : 'cat'
}

function toEventType(value: string): PetEventType {
  const types: PetEventType[] = [
    'vaccine', 'neuter', 'grooming', 'illness', 'visit', 'outing',
    'internal-deworm', 'external-deworm',
  ]
  return types.includes(value as PetEventType) ? value as PetEventType : 'outing'
}

function toDailyLogType(value: string): PetDailyLogType {
  return value === 'water' || value === 'stool' || value === 'urine'
    ? value
    : 'meal'
}

function toSupplyCategory(value: string): PetSupplyCategory {
  const categories: PetSupplyCategory[] = [
    'kibble', 'can', 'freeze-dried', 'soup', 'litter',
  ]
  return categories.includes(value as PetSupplyCategory)
    ? value as PetSupplyCategory
    : 'kibble'
}

function toSupplyStatus(value: string): PetSupplyStatus {
  const statuses: PetSupplyStatus[] = [
    'current', 'loved', 'tried', 'wishlist', 'dropped',
  ]
  return statuses.includes(value as PetSupplyStatus)
    ? value as PetSupplyStatus
    : 'tried'
}

function ifMatch(version: number): string {
  return `"${version}"`
}

function createIdempotencyKey(action: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `pet_${action}_${timestamp}_${random}`.slice(0, 64)
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

function toGatewayError(error: unknown): PetGatewayError {
  if (error instanceof PetGatewayError) return error
  if (error instanceof TransportError) {
    const fieldMessage = error.fields?.[0]?.message
    return new PetGatewayError(
      error.code,
      fieldMessage || error.message,
    )
  }
  return new PetGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '宠物操作没有完成',
  )
}
