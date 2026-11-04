import { readStoredApiSession } from '../stores/session'
import type {
  ApiMealOrder,
  ApiMealOrderList,
  ApiMealOrderStatusWriteRequest,
  ApiMealOrderWriteRequest,
} from '../types/api'
import { requestApiResponse } from './http'
import { resolveAvatarUrl } from '../utils/avatar'
import {
  MealOrderGatewayError,
  type MealOrder,
  type MealOrderGateway,
  type MealOrderListFilters,
  type MealOrderStatus,
  type MealOrderWriteInput,
} from './meal-order-gateway'
import { TransportError } from './transport'

const PAGE_LIMIT = 100
const MAX_PAGE_COUNT = 20

interface MealOrderContext {
  token: string
  spaceId: string
}

export class HttpMealOrderGateway implements MealOrderGateway {
  async list(filters: MealOrderListFilters = {}): Promise<MealOrder[]> {
    const context = mealOrderContext()
    const items: ApiMealOrder[] = []
    let cursor = ''
    try {
      for (let pageIndex = 0; pageIndex < MAX_PAGE_COUNT; pageIndex += 1) {
        const response = await retryNetwork(() => requestApiResponse<ApiMealOrderList>(
          mealOrderListPath(context.spaceId, filters, cursor),
          { token: context.token },
        ))
        items.push(...response.data.items)
        if (!response.data.nextCursor) return Promise.all(items.map(toMealOrder))
        cursor = response.data.nextCursor
      }
      throw new MealOrderGatewayError('TOO_MANY_PAGES', '点菜记录过多，请稍后重试')
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async create(input: MealOrderWriteInput): Promise<MealOrder> {
    const context = mealOrderContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiMealOrder>(
        `/spaces/${encodeURIComponent(context.spaceId)}/meal-orders`,
        {
          method: 'POST',
          token: context.token,
          body: toApiInput(input),
          headers: { 'Idempotency-Key': createIdempotencyKey('create') },
        },
      ))
      return await toMealOrder(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async setStatus(
    id: string,
    status: MealOrderStatus,
    currentVersion: number,
  ): Promise<MealOrder> {
    const context = mealOrderContext()
    const body: ApiMealOrderStatusWriteRequest = { status }
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiMealOrder>(
        `/spaces/${encodeURIComponent(context.spaceId)}/meal-orders/${encodeURIComponent(id)}/status`,
        {
          method: 'PUT',
          token: context.token,
          body,
          headers: {
            'If-Match': ifMatch(currentVersion),
            'Idempotency-Key': createIdempotencyKey('status'),
          },
        },
      ))
      return await toMealOrder(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async setIngredientReady(
    id: string,
    ingredientId: string,
    ready: boolean,
    currentVersion: number,
  ): Promise<MealOrder> {
    const context = mealOrderContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiMealOrder>(
        `/spaces/${encodeURIComponent(context.spaceId)}/meal-orders/${encodeURIComponent(id)}/ingredients/${encodeURIComponent(ingredientId)}/${ready ? 'ready' : 'unready'}`,
        {
          method: 'POST',
          token: context.token,
          headers: {
            'If-Match': ifMatch(currentVersion),
            'Idempotency-Key': createIdempotencyKey(ready ? 'ingredient-ready' : 'ingredient-unready'),
          },
        },
      ))
      return await toMealOrder(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async remove(id: string, currentVersion: number): Promise<void> {
    const context = mealOrderContext()
    try {
      await retryNetwork(() => requestApiResponse<void>(
        `/spaces/${encodeURIComponent(context.spaceId)}/meal-orders/${encodeURIComponent(id)}`,
        {
          method: 'DELETE',
          token: context.token,
          headers: {
            'If-Match': ifMatch(currentVersion),
            'Idempotency-Key': createIdempotencyKey('meal-order-delete'),
          },
        },
      ))
    } catch (error) {
      throw toGatewayError(error)
    }
  }
}

function mealOrderContext(): MealOrderContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new MealOrderGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new MealOrderGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return { token: stored.token, spaceId: stored.session.activeSpaceId }
}

function mealOrderListPath(
  spaceId: string,
  filters: MealOrderListFilters,
  cursor: string,
): string {
  const params: string[] = []
  if (filters.status) params.push(`status=${encodeURIComponent(filters.status)}`)
  if (filters.date) params.push(`date=${encodeURIComponent(filters.date)}`)
  if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`)
  params.push(`limit=${PAGE_LIMIT}`)
  return `/spaces/${encodeURIComponent(spaceId)}/meal-orders?${params.join('&')}`
}

async function toMealOrder(item: ApiMealOrder): Promise<MealOrder> {
  const [createdByAvatarUrl, updatedByAvatarUrl] = await Promise.all([
    resolveAvatarUrl(item.createdByAvatarMediaId),
    resolveAvatarUrl(item.updatedByAvatarMediaId),
  ])
  return {
    id: item.id,
    spaceId: item.spaceId,
    orderDate: item.orderDate,
    mealType: item.mealType,
    status: item.status,
    note: item.note,
    version: item.version,
    createdBy: item.createdBy,
    createdByName: item.createdByName || '空间成员',
    createdByAvatarMediaId: item.createdByAvatarMediaId ?? '',
    createdByAvatarUrl,
    updatedBy: item.updatedBy ?? '',
    updatedByName: item.updatedByName ?? '',
    updatedByAvatarMediaId: item.updatedByAvatarMediaId ?? '',
    updatedByAvatarUrl,
    items: item.items.map((entry) => ({
      id: entry.id,
      recipeId: entry.recipeId,
      recipeTitle: entry.recipeTitle,
      servings: entry.servings,
      ingredients: entry.ingredients.map((ingredient) => ({
        id: ingredient.id,
        name: ingredient.name,
        amount: ingredient.amount,
        source: ingredient.source,
        ready: ingredient.ready,
      })),
    })),
    completedAt: item.completedAt,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  }
}

function toApiInput(input: MealOrderWriteInput): ApiMealOrderWriteRequest {
  return {
    orderDate: input.orderDate,
    mealType: input.mealType,
    note: input.note.trim(),
    items: input.items.map((item) => ({
      recipeId: item.recipeId,
      servings: item.servings,
    })),
  }
}

function ifMatch(version: number): string {
  return `"${version}"`
}

function createIdempotencyKey(action: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `meal_${action}_${timestamp}_${random}`.slice(0, 64)
}

async function retryNetwork<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof TransportError) || error.code !== 'NETWORK_ERROR') throw error
    return operation()
  }
}

function toGatewayError(error: unknown): MealOrderGatewayError {
  if (error instanceof MealOrderGatewayError) return error
  if (error instanceof TransportError) {
    return new MealOrderGatewayError(error.code, error.message)
  }
  return new MealOrderGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '点菜操作没有完成',
  )
}
