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
import { addCalendarDays, getShanghaiDateOnly } from '../domain/expiry'
import {
  createDemoPetState,
  createSecondDemoPetState,
} from '../mocks/pet-fixtures'

const STORAGE_KEY = 'popcorn_demo_pets_v2'
const LEGACY_STORAGE_KEY = 'popcorn_demo_pet_v1'

export const DEMO_PET_STORAGE_KEYS = [STORAGE_KEY, LEGACY_STORAGE_KEY] as const

export interface DemoPetStore {
  activePetId: string
  pets: DemoPetState[]
}

function cloneState(state: DemoPetState): DemoPetState {
  const profile = state.profile as DemoPetProfile & { species?: PetSpecies }
  return {
    profile: { ...profile, species: profile.species ?? 'cat' },
    events: Array.isArray(state.events) ? state.events.map((item) => ({ ...item })) : [],
    supplies: Array.isArray(state.supplies)
      ? state.supplies.map((item) => ({ ...item }))
      : [],
    weights: Array.isArray(state.weights) ? state.weights.map((item) => ({ ...item })) : [],
    dailyLogs: Array.isArray(state.dailyLogs)
      ? state.dailyLogs.map((item) => ({ ...item }))
      : [],
  }
}

function cloneStore(store: DemoPetStore): DemoPetStore {
  return {
    activePetId: store.activePetId,
    pets: store.pets.map(cloneState),
  }
}

function saveDemoPetStore(store: DemoPetStore): DemoPetStore {
  const next = cloneStore(store)
  wx.setStorageSync(STORAGE_KEY, next)
  return cloneStore(next)
}

export function getDemoPetStore(): DemoPetStore {
  const stored = wx.getStorageSync<DemoPetStore | ''>(STORAGE_KEY)
  if (stored && typeof stored === 'object' && Array.isArray(stored.pets) && stored.pets.length) {
    const normalized = cloneStore(stored)
    if (!normalized.pets.some((item) => item.profile.id === normalized.activePetId)) {
      normalized.activePetId = normalized.pets[0]?.profile.id ?? ''
    }
    return normalized
  }

  const legacy = wx.getStorageSync<DemoPetState | ''>(LEGACY_STORAGE_KEY)
  const first =
    legacy && typeof legacy === 'object' && legacy.profile
      ? cloneState(legacy)
      : createDemoPetState()
  return saveDemoPetStore({
    activePetId: first.profile.id,
    pets: [first, createSecondDemoPetState()],
  })
}

export function resetDemoPetData(): DemoPetStore {
  for (const key of DEMO_PET_STORAGE_KEYS) wx.removeStorageSync(key)
  return getDemoPetStore()
}

export function getDemoPetState(): DemoPetState {
  const store = getDemoPetStore()
  return cloneState(
    store.pets.find((item) => item.profile.id === store.activePetId) ??
      store.pets[0]!,
  )
}

export function listDemoPetProfiles(): DemoPetProfile[] {
  return getDemoPetStore().pets.map((item) => ({ ...item.profile }))
}

export function switchDemoPet(id: string): DemoPetState {
  const store = getDemoPetStore()
  if (store.pets.some((item) => item.profile.id === id)) {
    store.activePetId = id
    saveDemoPetStore(store)
  }
  return getDemoPetState()
}

export function addDemoPet(input: {
  name: string
  species: PetSpecies
}): DemoPetState {
  const store = getDemoPetStore()
  const nowMs = Date.now()
  const today = getShanghaiDateOnly(nowMs)
  const id = `pet-${nowMs}`
  const breedLabels: Record<PetSpecies, string> = {
    cat: '猫咪',
    dog: '狗狗',
    other: '其他伙伴',
  }
  const state: DemoPetState = {
    profile: {
      id,
      name: input.name.trim(),
      species: input.species,
      breed: breedLabels[input.species],
      sex: 'female',
      birthday: addCalendarDays(today, -365),
      homeOn: today,
      neuteredOn: null,
      status: '刚刚加入这个家',
    },
    events: [],
    supplies: [],
    weights: [],
    dailyLogs: [],
  }
  store.pets.push(state)
  store.activePetId = id
  saveDemoPetStore(store)
  return cloneState(state)
}

function saveDemoPetState(state: DemoPetState): DemoPetState {
  const store = getDemoPetStore()
  store.pets = store.pets.map((item) =>
    item.profile.id === store.activePetId ? cloneState(state) : item,
  )
  saveDemoPetStore(store)
  return cloneState(state)
}

export function updateDemoPetProfile(
  patch: Pick<DemoPetProfile, 'birthday' | 'homeOn' | 'neuteredOn'>,
): DemoPetState {
  const state = getDemoPetState()
  state.profile = { ...state.profile, ...patch }
  return saveDemoPetState(state)
}

export function addDemoPetEvent(input: {
  type: PetEventType
  title: string
  note: string
  occurredOn?: string
  provider?: string
  cost?: string
  nextOn?: string | null
}): DemoPetState {
  const state = getDemoPetState()
  const nowMs = Date.now()
  const event: DemoPetEvent = {
    id: `pet-event-${nowMs}`,
    type: input.type,
    occurredOn: input.occurredOn ?? getShanghaiDateOnly(nowMs),
    title: input.title.trim(),
    note: input.note.trim(),
    provider: input.provider?.trim() ?? '',
    cost: input.cost?.trim() ?? '',
    nextOn: input.nextOn ?? null,
    createdAt: new Date(nowMs).toISOString(),
  }
  state.events = [event, ...state.events]
  return saveDemoPetState(state)
}

export function getDemoPetEvent(id: string): DemoPetEvent | null {
  const event = getDemoPetState().events.find((item) => item.id === id)
  return event ? { ...event } : null
}

export function updateDemoPetEvent(
  id: string,
  input: {
    type: PetEventType
    occurredOn: string
    title: string
    note: string
    provider?: string
    cost?: string
    nextOn?: string | null
  },
): DemoPetState {
  const state = getDemoPetState()
  state.events = state.events.map((event) =>
    event.id === id
      ? {
          ...event,
          type: input.type,
          occurredOn: input.occurredOn,
          title: input.title.trim(),
          note: input.note.trim(),
          provider: input.provider?.trim() ?? '',
          cost: input.cost?.trim() ?? '',
          nextOn: input.nextOn ?? null,
        }
      : event,
  )
  return saveDemoPetState(state)
}

export function removeDemoPetEvent(id: string): DemoPetState {
  const state = getDemoPetState()
  state.events = state.events.filter((event) => event.id !== id)
  return saveDemoPetState(state)
}

export function addDemoPetSupply(input: {
  category: PetSupplyCategory
  name: string
  status: PetSupplyStatus
  note?: string
}): DemoPetState {
  const state = getDemoPetState()
  const nowMs = Date.now()
  const supply: DemoPetSupply = {
    id: `pet-supply-${nowMs}`,
    category: input.category,
    name: input.name.trim(),
    status: input.status,
    note: input.note?.trim() ?? '',
    recordedOn: getShanghaiDateOnly(nowMs),
  }
  state.supplies = [supply, ...state.supplies]
  return saveDemoPetState(state)
}

export function updateDemoPetSupplyStatus(
  id: string,
  status: PetSupplyStatus,
): DemoPetState {
  const state = getDemoPetState()
  state.supplies = state.supplies.map((item) =>
    item.id === id ? { ...item, status } : item,
  )
  return saveDemoPetState(state)
}

export function addDemoPetWeight(value: string): DemoPetState {
  const state = getDemoPetState()
  const nowMs = Date.now()
  const weight: DemoPetWeight = {
    id: `pet-weight-${nowMs}`,
    value,
    recordedOn: getShanghaiDateOnly(nowMs),
  }
  state.weights = [...state.weights, weight]
  return saveDemoPetState(state)
}

export function addDemoPetDailyLog(input: {
  type: PetDailyLogType
  summary: string
  note?: string
}): DemoPetState {
  const state = getDemoPetState()
  const nowMs = Date.now()
  const log: DemoPetDailyLog = {
    id: `pet-daily-${nowMs}`,
    type: input.type,
    summary: input.summary.trim(),
    note: input.note?.trim() ?? '',
    recordedAt: new Date(nowMs).toISOString(),
  }
  state.dailyLogs = [log, ...state.dailyLogs]
  return saveDemoPetState(state)
}
