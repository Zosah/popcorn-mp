import { travelDuration } from '../domain/travel'
import {
  createDemoTravelTemplate,
  createDemoTravelTrip,
  getDemoTravelTemplate,
  getDemoTravelTrip,
  listDemoTravelTemplates,
  listDemoTravelTrips,
  saveDemoTravelTemplates,
  saveDemoTravelTrips,
} from './demo-travel'
import {
  TravelGatewayError,
  type TravelGateway,
  type TravelTemplate,
  type TravelTemplateWriteInput,
  type TravelTrip,
  type TravelTripItemWriteInput,
  type TravelTripWriteInput,
} from './travel-gateway'

let generatedID = 0

function nextID(prefix: string): string {
  generatedID += 1
  return `${prefix}_${Date.now().toString(36).slice(-4)}${generatedID.toString(36).padStart(2, '0')}b`
}

export class DemoTravelGateway implements TravelGateway {
  async listTrips(): Promise<TravelTrip[]> {
    return listDemoTravelTrips()
  }

  async getTrip(id: string): Promise<TravelTrip | null> {
    return getDemoTravelTrip(id) ?? null
  }

  async createTrip(input: TravelTripWriteInput): Promise<TravelTrip> {
    const trip = createDemoTravelTrip(input)
    return this.withDuration(trip)
  }

  async updateTrip(
    id: string,
    input: TravelTripWriteInput,
    currentVersion: number,
  ): Promise<TravelTrip> {
    const trips = listDemoTravelTrips()
    const index = trips.findIndex((item) => item.id === id)
    const current = trips[index]
    if (!current) throw notFound('这次出行已经不存在')
    if (current.version !== currentVersion) throw conflict()

    const updated: TravelTrip = {
      ...current,
      title: input.title.trim(),
      destination: input.destination.trim(),
      departAt: input.departAt,
      returnAt: input.returnAt,
      note: input.note.trim(),
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    }
    trips[index] = this.withDuration(updated)
    saveDemoTravelTrips(trips)
    return trips[index]!
  }

  async removeTrip(id: string, currentVersion: number): Promise<void> {
    const trips = listDemoTravelTrips()
    const current = trips.find((item) => item.id === id)
    if (!current) throw notFound('这次出行已经不存在')
    if (current.version !== currentVersion) throw conflict()
    saveDemoTravelTrips(trips.filter((item) => item.id !== id))
  }

  async addTripItem(
    tripId: string,
    input: TravelTripItemWriteInput,
    currentVersion: number,
  ): Promise<TravelTrip> {
    return this.mutateTrip(tripId, currentVersion, (trip, now) => {
      this.assertUniqueItem(trip.items.map((item) => item.name), input.name)
      return {
        ...trip,
        items: [...trip.items, {
          id: nextID('ti'),
          name: input.name.trim(),
          packed: input.packed,
          sortOrder: trip.items.length * 10,
          templateItemId: '',
          createdAt: now,
          updatedAt: now,
        }],
      }
    })
  }

  async updateTripItem(
    tripId: string,
    itemId: string,
    input: TravelTripItemWriteInput,
    currentVersion: number,
  ): Promise<TravelTrip> {
    return this.mutateTrip(tripId, currentVersion, (trip, now) => {
      const item = trip.items.find((entry) => entry.id === itemId)
      if (!item) throw new TravelGatewayError('ITEM_NOT_FOUND', '这件物品已经不存在')
      this.assertUniqueItem(
        trip.items.filter((entry) => entry.id !== itemId).map((entry) => entry.name),
        input.name,
      )
      return {
        ...trip,
        items: trip.items.map((entry) => entry.id === itemId
          ? { ...entry, name: input.name.trim(), packed: input.packed, updatedAt: now }
          : entry),
      }
    })
  }

  async removeTripItem(
    tripId: string,
    itemId: string,
    currentVersion: number,
  ): Promise<TravelTrip> {
    return this.mutateTrip(tripId, currentVersion, (trip) => {
      if (!trip.items.some((entry) => entry.id === itemId)) {
        throw new TravelGatewayError('ITEM_NOT_FOUND', '这件物品已经不存在')
      }
      return { ...trip, items: trip.items.filter((entry) => entry.id !== itemId) }
    })
  }

  async importTemplate(
    tripId: string,
    templateId: string,
    currentVersion: number,
  ): Promise<TravelTrip> {
    const template = getDemoTravelTemplate(templateId)
    if (!template) throw new TravelGatewayError('TEMPLATE_NOT_FOUND', '这份必备清单已经不存在')
    return this.mutateTrip(tripId, currentVersion, (trip, now) => {
      const names = new Set(trip.items.map((item) => item.name.toLocaleLowerCase()))
      const imported = template.items.flatMap((item, index) => {
        const key = item.name.toLocaleLowerCase()
        if (names.has(key)) return []
        names.add(key)
        return [{
          id: nextID('ti'),
          name: item.name,
          packed: false,
          sortOrder: (trip.items.length + index) * 10,
          templateItemId: item.id,
          createdAt: now,
          updatedAt: now,
        }]
      })
      return { ...trip, items: [...trip.items, ...imported] }
    })
  }

  async listTemplates(): Promise<TravelTemplate[]> {
    return listDemoTravelTemplates().sort((left, right) => {
      if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1
      return right.updatedAt.localeCompare(left.updatedAt)
    })
  }

  async getTemplate(id: string): Promise<TravelTemplate | null> {
    return getDemoTravelTemplate(id) ?? null
  }

  async createTemplate(input: TravelTemplateWriteInput): Promise<TravelTemplate> {
    return createDemoTravelTemplate(input)
  }

  async updateTemplate(
    id: string,
    input: TravelTemplateWriteInput,
    currentVersion: number,
  ): Promise<TravelTemplate> {
    const templates = listDemoTravelTemplates()
    const index = templates.findIndex((item) => item.id === id)
    const current = templates[index]
    if (!current) throw new TravelGatewayError('TEMPLATE_NOT_FOUND', '这份必备清单已经不存在')
    if (current.version !== currentVersion) throw conflict()

    const now = new Date().toISOString()
    const updated: TravelTemplate = {
      ...current,
      title: input.title.trim(),
      isDefault: input.isDefault,
      items: input.items.map((item, itemIndex) => ({
        id: nextID('pi'),
        name: item.name.trim(),
        sortOrder: itemIndex * 10,
        createdAt: now,
        updatedAt: now,
      })),
      version: current.version + 1,
      updatedAt: now,
    }
    templates[index] = updated
    saveDemoTravelTemplates(templates.map((item) => (
      input.isDefault && item.id !== id ? { ...item, isDefault: false } : item
    )))
    return updated
  }

  async removeTemplate(id: string, currentVersion: number): Promise<void> {
    const templates = listDemoTravelTemplates()
    const current = templates.find((item) => item.id === id)
    if (!current) throw new TravelGatewayError('TEMPLATE_NOT_FOUND', '这份必备清单已经不存在')
    if (current.version !== currentVersion) throw conflict()
    saveDemoTravelTemplates(templates.filter((item) => item.id !== id))
  }

  private mutateTrip(
    id: string,
    currentVersion: number,
    mutate: (trip: TravelTrip, now: string) => TravelTrip,
  ): TravelTrip {
    const trips = listDemoTravelTrips()
    const index = trips.findIndex((item) => item.id === id)
    const current = trips[index]
    if (!current) throw notFound('这次出行已经不存在')
    if (current.version !== currentVersion) throw conflict()
    const now = new Date().toISOString()
    const updated = this.withDuration({
      ...mutate(current, now),
      version: current.version + 1,
      updatedAt: now,
    })
    trips[index] = updated
    saveDemoTravelTrips(trips)
    return updated
  }

  private withDuration(trip: TravelTrip): TravelTrip {
    const duration = travelDuration(trip.departAt, trip.returnAt)
    return { ...trip, ...duration }
  }

  private assertUniqueItem(existing: string[], name: string): void {
    const normalized = name.trim().toLocaleLowerCase()
    if (existing.some((item) => item.trim().toLocaleLowerCase() === normalized)) {
      throw new TravelGatewayError('VALIDATION_FAILED', '这次行程里已经有同名物品')
    }
  }
}

function notFound(message: string): TravelGatewayError {
  return new TravelGatewayError('NOT_FOUND', message)
}

function conflict(): TravelGatewayError {
  return new TravelGatewayError('VERSION_CONFLICT', '行程已在别处更新，请刷新后再试')
}
