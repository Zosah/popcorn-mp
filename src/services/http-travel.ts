import { readStoredApiSession } from '../stores/session'
import type {
  ApiTravelTemplate,
  ApiTravelTemplateList,
  ApiTravelTemplateWriteRequest,
  ApiTravelTrip,
  ApiTravelTripItemWriteRequest,
  ApiTravelTripList,
  ApiTravelTripWriteRequest,
} from '../types/api'
import { requestApi } from './http'
import {
  TravelGatewayError,
  type TravelGateway,
  type TravelTemplate,
  type TravelTemplateWriteInput,
  type TravelTrip,
  type TravelTripItemWriteInput,
  type TravelTripWriteInput,
} from './travel-gateway'
import { TransportError } from './transport'

interface TravelContext {
  token: string
  spaceId: string
}

export class HttpTravelGateway implements TravelGateway {
  async listTrips(): Promise<TravelTrip[]> {
    const context = travelContext()
    try {
      const result = await retryNetwork(() => requestApi<ApiTravelTripList>(
        travelTripsPath(context.spaceId),
        { token: context.token },
      ))
      return result.items.map(toTravelTrip)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async getTrip(id: string): Promise<TravelTrip | null> {
    const context = travelContext()
    try {
      const trip = await retryNetwork(() => requestApi<ApiTravelTrip>(
        travelTripPath(context.spaceId, id),
        { token: context.token },
      ))
      return toTravelTrip(trip)
    } catch (error) {
      if (error instanceof TransportError && error.code === 'NOT_FOUND') return null
      throw toGatewayError(error)
    }
  }

  async createTrip(input: TravelTripWriteInput): Promise<TravelTrip> {
    const context = travelContext()
    try {
      const trip = await retryNetwork(() => requestApi<ApiTravelTrip>(
        travelTripsPath(context.spaceId),
        {
          method: 'POST',
          token: context.token,
          body: toApiTripInput(input),
          headers: { 'Idempotency-Key': createIdempotencyKey('trip_create') },
        },
      ))
      return toTravelTrip(trip)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async updateTrip(
    id: string,
    input: TravelTripWriteInput,
    currentVersion: number,
  ): Promise<TravelTrip> {
    const context = travelContext()
    try {
      const trip = await retryNetwork(() => requestApi<ApiTravelTrip>(
        travelTripPath(context.spaceId, id),
        {
          method: 'PUT',
          token: context.token,
          body: toApiTripInput(input),
          headers: {
            'If-Match': versionETag(currentVersion),
            'Idempotency-Key': createIdempotencyKey('trip_update'),
          },
        },
      ))
      return toTravelTrip(trip)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async removeTrip(id: string, currentVersion: number): Promise<void> {
    const context = travelContext()
    try {
      await retryNetwork(() => requestApi<void>(
        travelTripPath(context.spaceId, id),
        {
          method: 'DELETE',
          token: context.token,
          headers: {
            'If-Match': versionETag(currentVersion),
            'Idempotency-Key': createIdempotencyKey('trip_delete'),
          },
        },
      ))
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async addTripItem(
    tripId: string,
    input: TravelTripItemWriteInput,
    currentVersion: number,
  ): Promise<TravelTrip> {
    const context = travelContext()
    try {
      const trip = await retryNetwork(() => requestApi<ApiTravelTrip>(
        `${travelTripPath(context.spaceId, tripId)}/items`,
        {
          method: 'POST',
          token: context.token,
          body: toApiItemInput(input),
          headers: {
            'If-Match': versionETag(currentVersion),
            'Idempotency-Key': createIdempotencyKey('trip_item_create'),
          },
        },
      ))
      return toTravelTrip(trip)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async updateTripItem(
    tripId: string,
    itemId: string,
    input: TravelTripItemWriteInput,
    currentVersion: number,
  ): Promise<TravelTrip> {
    const context = travelContext()
    try {
      const trip = await retryNetwork(() => requestApi<ApiTravelTrip>(
        `${travelTripPath(context.spaceId, tripId)}/items/${encodeURIComponent(itemId)}`,
        {
          method: 'PUT',
          token: context.token,
          body: toApiItemInput(input),
          headers: {
            'If-Match': versionETag(currentVersion),
            'Idempotency-Key': createIdempotencyKey('trip_item_update'),
          },
        },
      ))
      return toTravelTrip(trip)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async removeTripItem(
    tripId: string,
    itemId: string,
    currentVersion: number,
  ): Promise<TravelTrip> {
    const context = travelContext()
    try {
      const trip = await retryNetwork(() => requestApi<ApiTravelTrip>(
        `${travelTripPath(context.spaceId, tripId)}/items/${encodeURIComponent(itemId)}`,
        {
          method: 'DELETE',
          token: context.token,
          headers: {
            'If-Match': versionETag(currentVersion),
            'Idempotency-Key': createIdempotencyKey('trip_item_delete'),
          },
        },
      ))
      return toTravelTrip(trip)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async importTemplate(
    tripId: string,
    templateId: string,
    currentVersion: number,
  ): Promise<TravelTrip> {
    const context = travelContext()
    try {
      const trip = await retryNetwork(() => requestApi<ApiTravelTrip>(
        `${travelTripPath(context.spaceId, tripId)}/import-template`,
        {
          method: 'POST',
          token: context.token,
          body: { templateId },
          headers: {
            'If-Match': versionETag(currentVersion),
            'Idempotency-Key': createIdempotencyKey('trip_template_import'),
          },
        },
      ))
      return toTravelTrip(trip)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async listTemplates(): Promise<TravelTemplate[]> {
    const context = travelContext()
    try {
      const result = await retryNetwork(() => requestApi<ApiTravelTemplateList>(
        travelTemplatesPath(context.spaceId),
        { token: context.token },
      ))
      return result.items.map(toTravelTemplate)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async getTemplate(id: string): Promise<TravelTemplate | null> {
    const context = travelContext()
    try {
      const template = await retryNetwork(() => requestApi<ApiTravelTemplate>(
        travelTemplatePath(context.spaceId, id),
        { token: context.token },
      ))
      return toTravelTemplate(template)
    } catch (error) {
      if (
        error instanceof TransportError &&
        (error.code === 'TEMPLATE_NOT_FOUND' || error.code === 'NOT_FOUND')
      ) {
        return null
      }
      throw toGatewayError(error)
    }
  }

  async createTemplate(input: TravelTemplateWriteInput): Promise<TravelTemplate> {
    const context = travelContext()
    try {
      const template = await retryNetwork(() => requestApi<ApiTravelTemplate>(
        travelTemplatesPath(context.spaceId),
        {
          method: 'POST',
          token: context.token,
          body: toApiTemplateInput(input),
          headers: { 'Idempotency-Key': createIdempotencyKey('template_create') },
        },
      ))
      return toTravelTemplate(template)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async updateTemplate(
    id: string,
    input: TravelTemplateWriteInput,
    currentVersion: number,
  ): Promise<TravelTemplate> {
    const context = travelContext()
    try {
      const template = await retryNetwork(() => requestApi<ApiTravelTemplate>(
        travelTemplatePath(context.spaceId, id),
        {
          method: 'PUT',
          token: context.token,
          body: toApiTemplateInput(input),
          headers: {
            'If-Match': versionETag(currentVersion),
            'Idempotency-Key': createIdempotencyKey('template_update'),
          },
        },
      ))
      return toTravelTemplate(template)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async removeTemplate(id: string, currentVersion: number): Promise<void> {
    const context = travelContext()
    try {
      await retryNetwork(() => requestApi<void>(
        travelTemplatePath(context.spaceId, id),
        {
          method: 'DELETE',
          token: context.token,
          headers: {
            'If-Match': versionETag(currentVersion),
            'Idempotency-Key': createIdempotencyKey('template_delete'),
          },
        },
      ))
    } catch (error) {
      throw toGatewayError(error)
    }
  }
}

function travelContext(): TravelContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new TravelGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new TravelGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
  }
}

function travelTripsPath(spaceId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/travel/trips`
}

function travelTripPath(spaceId: string, tripId: string): string {
  return `${travelTripsPath(spaceId)}/${encodeURIComponent(tripId)}`
}

function travelTemplatesPath(spaceId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/travel/templates`
}

function travelTemplatePath(spaceId: string, templateId: string): string {
  return `${travelTemplatesPath(spaceId)}/${encodeURIComponent(templateId)}`
}

function toApiTripInput(input: TravelTripWriteInput): ApiTravelTripWriteRequest {
  return {
    title: input.title.trim(),
    destination: input.destination.trim(),
    departAt: input.departAt,
    returnAt: input.returnAt,
    note: input.note.trim(),
    items: input.items.map((item) => ({
      name: item.name.trim(),
      packed: item.packed,
    })),
  }
}

function toApiItemInput(
  input: TravelTripItemWriteInput,
): ApiTravelTripItemWriteRequest {
  return { name: input.name.trim(), packed: input.packed }
}

function toApiTemplateInput(
  input: TravelTemplateWriteInput,
): ApiTravelTemplateWriteRequest {
  return {
    title: input.title.trim(),
    isDefault: input.isDefault,
    items: input.items.map((item) => ({ name: item.name.trim() })),
  }
}

function toTravelTrip(trip: ApiTravelTrip): TravelTrip {
  return {
    ...trip,
    items: [...(trip.items ?? [])].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    ),
  }
}

function toTravelTemplate(template: ApiTravelTemplate): TravelTemplate {
  return {
    ...template,
    items: [...(template.items ?? [])].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
    ),
  }
}

function versionETag(version: number): string {
  return `"${version}"`
}

function createIdempotencyKey(action: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `${action}_${timestamp}_${random}`.slice(0, 64)
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

function toGatewayError(error: unknown): TravelGatewayError {
  if (error instanceof TravelGatewayError) return error
  if (error instanceof TransportError) {
    const fieldMessage = error.fields?.[0]?.message
    return new TravelGatewayError(
      error.code,
      fieldMessage || error.message,
    )
  }
  return new TravelGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '旅行操作没有完成',
  )
}
