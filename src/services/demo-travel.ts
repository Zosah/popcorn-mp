import type {
  TravelTemplate,
  TravelTemplateWriteInput,
  TravelTrip,
  TravelTripItemWriteInput,
  TravelTripWriteInput,
} from './travel-gateway'

const TRIPS_KEY = 'popcorn_demo_travel_trips_v1'
const TEMPLATES_KEY = 'popcorn_demo_travel_templates_v1'
const SEEDED_KEY = 'popcorn_demo_travel_seeded_v1'

export const DEMO_TRAVEL_STORAGE_KEYS = [TRIPS_KEY, TEMPLATES_KEY, SEEDED_KEY] as const

let idSequence = 0

function nextID(prefix: string): string {
  idSequence += 1
  return `${prefix}_${Date.now().toString(36).slice(-4)}${idSequence.toString(36).padStart(2, '0')}a`
}

function seedData(): { trips: TravelTrip[]; templates: TravelTemplate[] } {
  const now = Date.now()
  const depart = new Date(now + 5 * 86400000)
  depart.setHours(9, 0, 0, 0)
  const returnAt = new Date(now + 7 * 86400000)
  returnAt.setHours(18, 0, 0, 0)
  const createdAt = new Date(now - 86400000).toISOString()
  const templateID = 'tp_demo000001'
  return {
    templates: [{
      id: templateID,
      spaceId: 'demo-space',
      title: '短途必备',
      isDefault: true,
      items: [
        templateItem('pi_demo00001', templateID, '身份证', 0, createdAt),
        templateItem('pi_demo00002', templateID, '充电器', 10, createdAt),
        templateItem('pi_demo00003', templateID, '换洗衣物', 20, createdAt),
        templateItem('pi_demo00004', templateID, '洗漱包', 30, createdAt),
        templateItem('pi_demo00005', templateID, '常用药', 40, createdAt),
      ],
      version: 1,
      createdBy: 'u_demo000001',
      createdAt,
      updatedAt: createdAt,
    }],
    trips: [{
      id: 'tr_demo000001',
      spaceId: 'demo-space',
      title: '去杭州过个周末',
      destination: '杭州',
      departAt: depart.toISOString(),
      returnAt: returnAt.toISOString(),
      days: 3,
      nights: 2,
      note: '住在西湖附近，带一双好走的鞋。',
      items: [
        tripItem('ti_demo00001', 'tr_demo000001', '身份证', 0, true, createdAt),
        tripItem('ti_demo00002', 'tr_demo000001', '充电器', 10, false, createdAt),
        tripItem('ti_demo00003', 'tr_demo000001', '换洗衣物', 20, false, createdAt),
      ],
      version: 1,
      createdBy: 'u_demo000001',
      createdAt,
      updatedAt: createdAt,
    }],
  }
}

function templateItem(
  id: string,
  templateID: string,
  name: string,
  sortOrder: number,
  timestamp: string,
): TravelTemplate['items'][number] {
  return { id, name, sortOrder, createdAt: timestamp, updatedAt: timestamp }
}

function tripItem(
  id: string,
  tripID: string,
  name: string,
  sortOrder: number,
  packed: boolean,
  timestamp: string,
): TravelTrip['items'][number] {
  return {
    id,
    name,
    packed,
    sortOrder,
    templateItemId: '',
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function ensureSeed(): void {
  const seeded = wx.getStorageSync<boolean | ''>(SEEDED_KEY)
  if (seeded === true) return
  const seed = seedData()
  wx.setStorageSync(TRIPS_KEY, seed.trips)
  wx.setStorageSync(TEMPLATES_KEY, seed.templates)
  wx.setStorageSync(SEEDED_KEY, true)
}

export function listDemoTravelTrips(): TravelTrip[] {
  ensureSeed()
  const items = wx.getStorageSync<TravelTrip[] | ''>(TRIPS_KEY)
  return Array.isArray(items) ? clone(items) : []
}

export function listDemoTravelTemplates(): TravelTemplate[] {
  ensureSeed()
  const items = wx.getStorageSync<TravelTemplate[] | ''>(TEMPLATES_KEY)
  return Array.isArray(items) ? clone(items) : []
}

export function getDemoTravelTrip(id: string): TravelTrip | undefined {
  return listDemoTravelTrips().find((item) => item.id === id)
}

export function getDemoTravelTemplate(id: string): TravelTemplate | undefined {
  return listDemoTravelTemplates().find((item) => item.id === id)
}

export function saveDemoTravelTrips(items: TravelTrip[]): void {
  wx.setStorageSync(TRIPS_KEY, clone(items))
}

export function saveDemoTravelTemplates(items: TravelTemplate[]): void {
  wx.setStorageSync(TEMPLATES_KEY, clone(items))
}

export function createDemoTravelTrip(input: TravelTripWriteInput): TravelTrip {
  const now = new Date().toISOString()
  const id = nextID('tr')
  const trip: TravelTrip = {
    id,
    spaceId: 'demo-space',
    title: input.title.trim(),
    destination: input.destination.trim(),
    departAt: input.departAt,
    returnAt: input.returnAt,
    days: 1,
    nights: 0,
    note: input.note.trim(),
    items: input.items.map((item, index) => tripItem(
      nextID('ti'), id, item.name.trim(), index * 10, item.packed, now,
    )),
    version: 1,
    createdBy: 'u_demo000001',
    createdAt: now,
    updatedAt: now,
  }
  saveDemoTravelTrips([trip, ...listDemoTravelTrips()])
  return clone(trip)
}

export function createDemoTravelTemplate(input: TravelTemplateWriteInput): TravelTemplate {
  const now = new Date().toISOString()
  const id = nextID('tp')
  const template: TravelTemplate = {
    id,
    spaceId: 'demo-space',
    title: input.title.trim(),
    isDefault: input.isDefault,
    items: input.items.map((item, index) => templateItem(
      nextID('pi'), id, item.name.trim(), index * 10, now,
    )),
    version: 1,
    createdBy: 'u_demo000001',
    createdAt: now,
    updatedAt: now,
  }
  const items = listDemoTravelTemplates().map((item) => (
    input.isDefault ? { ...item, isDefault: false } : item
  ))
  saveDemoTravelTemplates([template, ...items])
  return clone(template)
}

export function applyDemoTripItem(
  trip: TravelTrip,
  input: TravelTripItemWriteInput,
): TravelTrip['items'][number] {
  return tripItem(nextID('ti'), trip.id, input.name.trim(), trip.items.length * 10, input.packed, new Date().toISOString())
}

export function nextDemoTravelItemID(): string {
  return nextID('ti')
}

export function resetDemoTravelData(): void {
  for (const key of DEMO_TRAVEL_STORAGE_KEYS) wx.removeStorageSync(key)
  ensureSeed()
}
