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
  PetBackgroundKey,
  PetSupplyCategory,
  PetSupplyPreference,
} from '../domain/demo-pet'
import { PET_SUPPLY_CATEGORY_LABELS } from '../domain/demo-pet'
import { readStoredApiSession } from '../stores/session'
import type {
  ApiPet,
  ApiPetDailyLogWriteRequest,
  ApiPetEventWriteRequest,
  ApiPetProfileWriteRequest,
  ApiPetStatusNoteWriteRequest,
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
  type PetWeightInput,
} from './pet-gateway'
import { TransportError } from './transport'

const LEGACY_ACTIVE_PET_STORAGE_KEY = 'popcorn_active_pet_id'
const ACTIVE_PET_STORAGE_KEY_PREFIX = 'popcorn_active_pet_id:'
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
      return withActivePet(pets, context.spaceId)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async setActivePet(id: string): Promise<PetCollection> {
    const context = petContext()
    const current = await this.list()
    if (!current.pets.some((pet) => pet.profile.id === id)) {
      throw new PetGatewayError('NOT_FOUND', '宠物档案不存在')
    }
    storeActivePetId(context.spaceId, id)
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
      backgroundKey: profile.backgroundKey ?? 'sage',
      backgroundMediaId: profile.backgroundMediaId ?? '',
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
      clearActivePetIdIfMatches(context.spaceId, petId)
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

  async addWeight(
    petId: string,
    input: PetWeightInput,
  ): Promise<DemoPetState> {
    const context = petContext()
    const body: ApiPetWeightWriteRequest = {
      value: input.value,
      recordedOn: input.recordedOn,
    }
    return this.writePet('weight', `${petPath(context.spaceId, petId)}/weights`, 'POST', body)
  }

  async updateWeight(
    petId: string,
    weightId: string,
    input: PetWeightInput,
  ): Promise<DemoPetState> {
    const context = petContext()
    const body: ApiPetWeightWriteRequest = {
      value: input.value,
      recordedOn: input.recordedOn,
    }
    return this.writePet(
      'weight-update',
      `${petPath(context.spaceId, petId)}/weights/${encodeURIComponent(weightId)}`,
      'PUT',
      body,
    )
  }

  async removeWeight(petId: string, weightId: string): Promise<DemoPetState> {
    const context = petContext()
    return this.writePet(
      'weight-delete',
      `${petPath(context.spaceId, petId)}/weights/${encodeURIComponent(weightId)}`,
      'DELETE',
    )
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
      recordedAt: input.recordedAt?.trim() || new Date().toISOString(),
    }
    return this.writePet('daily', `${petPath(context.spaceId, petId)}/daily-logs`, 'POST', body)
  }

  async updateDailyLog(
    petId: string,
    logId: string,
    input: PetDailyLogInput,
  ): Promise<DemoPetState> {
    const context = petContext()
    const body: ApiPetDailyLogWriteRequest = {
      type: input.type,
      summary: input.summary.trim(),
      note: input.note?.trim() ?? '',
      recordedAt: input.recordedAt?.trim() || new Date().toISOString(),
    }
    return this.writePet(
      'daily-update',
      `${petPath(context.spaceId, petId)}/daily-logs/${encodeURIComponent(logId)}`,
      'PUT',
      body,
    )
  }

  async removeDailyLog(petId: string, logId: string): Promise<DemoPetState> {
    const context = petContext()
    return this.writePet(
      'daily-delete',
      `${petPath(context.spaceId, petId)}/daily-logs/${encodeURIComponent(logId)}`,
      'DELETE',
    )
  }

  async createSupply(
    petId: string,
    input: PetSupplyInput,
  ): Promise<DemoPetState> {
    const context = petContext()
    const body: ApiPetSupplyWriteRequest = {
      category: input.category,
      categoryLabel: input.categoryLabel?.trim() ?? '',
      name: input.name.trim(),
      brand: input.brand?.trim() ?? '',
      preference: input.preference,
      note: input.note?.trim() ?? '',
      mediaId: input.mediaId?.trim() ?? '',
      recordedOn: getShanghaiDateOnly(Date.now()),
    }
    return this.writePet('supply-create', `${petPath(context.spaceId, petId)}/supplies`, 'POST', body)
  }

  async updateSupply(
    petId: string,
    supplyId: string,
    input: PetSupplyInput,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const context = petContext()
    const existing = (await this.list()).pets
      .flatMap((pet) => pet.supplies)
      .find((supply) => supply.id === supplyId)
    const body: ApiPetSupplyWriteRequest = {
      category: input.category,
      categoryLabel: input.categoryLabel?.trim() ?? '',
      name: input.name.trim(),
      brand: input.brand?.trim() ?? '',
      preference: input.preference,
      note: input.note?.trim() ?? '',
      mediaId: input.mediaId?.trim() ?? '',
      recordedOn: existing?.recordedOn ?? getShanghaiDateOnly(Date.now()),
    }
    return this.writePet(
      'supply-update',
      `${petPath(context.spaceId, petId)}/supplies/${encodeURIComponent(supplyId)}`,
      'PUT',
      body,
      currentVersion,
    )
  }

  async setSupplyStatus(
    petId: string,
    supplyId: string,
    preference: PetSupplyPreference,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const context = petContext()
    return this.writePet(
      'supply-status',
      `${petPath(context.spaceId, petId)}/supplies/${encodeURIComponent(supplyId)}/status`,
      'PUT',
      { preference },
      currentVersion,
    )
  }

  async createStatusNote(petId: string, content: string): Promise<DemoPetState> {
    const context = petContext()
    const body: ApiPetStatusNoteWriteRequest = { content: content.trim() }
    return this.writePet(
      'status-create',
      `${petPath(context.spaceId, petId)}/status-notes`,
      'POST',
      body,
    )
  }

  async updateStatusNote(
    petId: string,
    noteId: string,
    content: string,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const context = petContext()
    const body: ApiPetStatusNoteWriteRequest = { content: content.trim() }
    return this.writePet(
      'status-update',
      `${petPath(context.spaceId, petId)}/status-notes/${encodeURIComponent(noteId)}`,
      'PUT',
      body,
      currentVersion,
    )
  }

  async removeStatusNote(
    petId: string,
    noteId: string,
    currentVersion: number,
  ): Promise<DemoPetState> {
    const context = petContext()
    return this.writePet(
      'status-delete',
      `${petPath(context.spaceId, petId)}/status-notes/${encodeURIComponent(noteId)}`,
      'DELETE',
      undefined,
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
      storeActivePetId(context.spaceId, response.data.id)
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

function withActivePet(pets: DemoPetState[], spaceId: string): PetCollection {
  const saved = readActivePetId(spaceId)
  const active = pets.find((pet) => pet.profile.id === saved) ?? pets[0]
  if (active) {
    storeActivePetId(spaceId, active.profile.id)
  } else {
    clearActivePetId(spaceId)
  }
  return {
    activePetId: active?.profile.id ?? '',
    pets,
  }
}

function activePetStorageKey(spaceId: string): string {
  return `${ACTIVE_PET_STORAGE_KEY_PREFIX}${spaceId}`
}

function readActivePetId(spaceId: string): string {
  const scoped = String(wx.getStorageSync(activePetStorageKey(spaceId)) || '')
  if (scoped) return scoped
  return String(wx.getStorageSync(LEGACY_ACTIVE_PET_STORAGE_KEY) || '')
}

function storeActivePetId(spaceId: string, petId: string): void {
  wx.setStorageSync(activePetStorageKey(spaceId), petId)
  wx.removeStorageSync(LEGACY_ACTIVE_PET_STORAGE_KEY)
}

function clearActivePetId(spaceId: string): void {
  wx.removeStorageSync(activePetStorageKey(spaceId))
  wx.removeStorageSync(LEGACY_ACTIVE_PET_STORAGE_KEY)
}

function clearActivePetIdIfMatches(spaceId: string, petId: string): void {
  const key = activePetStorageKey(spaceId)
  if (String(wx.getStorageSync(key) || '') === petId) wx.removeStorageSync(key)
  if (String(wx.getStorageSync(LEGACY_ACTIVE_PET_STORAGE_KEY) || '') === petId) {
    wx.removeStorageSync(LEGACY_ACTIVE_PET_STORAGE_KEY)
  }
}

async function toPetState(item: ApiPet): Promise<DemoPetState> {
  const [avatarUrl, backgroundUrl, backgroundHistory, supplyMedia] = await Promise.all([
    resolveMedia(item.avatarMediaId, 'thumb'),
    resolveMedia(item.backgroundMediaId, 'display'),
    Promise.all((item.backgroundHistory ?? []).map(async (background) => ({
      mediaId: background.mediaId,
      usedAt: background.usedAt,
      url: await resolveMedia(background.mediaId, 'display') ?? '',
    }))),
    Promise.all(item.supplies.map(async (supply) => {
      if (!supply.mediaId) return { display: '', thumb: '' }
      try {
        const asset = await mediaGateway.get(supply.mediaId)
        return {
          display: asset.display.url || asset.thumb.url || '',
          thumb: asset.thumb.url || asset.display.url || '',
        }
      } catch {
        return { display: '', thumb: '' }
      }
    })),
  ])
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
    statusNotes: (item.statusNotes ?? []).map((note) => ({
      id: note.id,
      content: note.content,
      version: note.version,
      sortOrder: note.sortOrder,
    })),
    version: item.version,
    avatarMediaId: item.avatarMediaId || '',
    avatarUrl: avatarUrl ?? '',
    backgroundKey: toBackgroundKey(item.backgroundKey),
    backgroundMediaId: item.backgroundMediaId || '',
    backgroundUrl: backgroundUrl ?? '',
    backgroundHistory: backgroundHistory.filter((background) => Boolean(background.url)),
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
    supplies: item.supplies.map((supply, index): DemoPetSupply => ({
      id: supply.id,
      category: toSupplyCategory(supply.category),
      categoryLabel: supply.categoryLabel || PET_SUPPLY_CATEGORY_LABELS[toSupplyCategory(supply.category)],
      name: supply.name,
      brand: supply.brand || '',
      preference: toSupplyPreference(supply.preference || supply.status),
      note: supply.note,
      mediaId: supply.mediaId || '',
      mediaUrl: supplyMedia[index]?.display ?? '',
      mediaThumbUrl: supplyMedia[index]?.thumb ?? '',
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
      deletedAt: log.deletedAt ?? null,
    })),
  }
}

async function resolveMedia(
  mediaId: string,
  variant: 'display' | 'thumb',
): Promise<string | undefined> {
  if (!mediaId) return undefined
  try {
    const asset = await mediaGateway.get(mediaId)
    return variant === 'thumb'
      ? asset.thumb.url || asset.display.url
      : asset.display.url || asset.thumb.url
  } catch {
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
    backgroundKey: input.backgroundKey,
    backgroundMediaId: input.backgroundMediaId.trim(),
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
    'vaccine', 'neuter', 'grooming', 'illness', 'visit', 'checkup', 'outing',
    'internal-deworm', 'external-deworm',
  ]
  return types.includes(value as PetEventType) ? value as PetEventType : 'outing'
}

function toDailyLogType(value: string): PetDailyLogType {
  return value === 'record'
    || value === 'water'
    || value === 'stool'
    || value === 'urine'
    || value === 'litter-change'
    || value === 'water-change'
    ? value
    : 'meal'
}

function toSupplyCategory(value: string): PetSupplyCategory {
  const categories: PetSupplyCategory[] = [
    'kibble', 'can', 'freeze-dried', 'soup', 'litter', 'custom',
  ]
  return categories.includes(value as PetSupplyCategory)
    ? value as PetSupplyCategory
    : 'kibble'
}

function toSupplyPreference(value: string): PetSupplyPreference {
  return value === 'loved' || value === 'wishlist'
    ? 'loved'
    : value === 'dropped'
      ? 'dropped'
      : 'neutral'
}

function toBackgroundKey(value: string): PetBackgroundKey {
  return value === 'apricot' || value === 'mist' ? value : 'sage'
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
