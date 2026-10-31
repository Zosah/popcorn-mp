import { readStoredApiSession } from '../stores/session'
import type {
  ApiMenuRecipe,
  ApiMenuRecipeList,
  ApiMenuWriteRequest,
} from '../types/api'
import { requestApiResponse } from './http'
import { mediaGateway } from './media'
import {
  MenuGatewayError,
  type MenuGateway,
  type MenuListFilters,
  type MenuRecipe,
  type MenuWriteInput,
} from './menu-gateway'
import { TransportError, type TransportResponse } from './transport'

const PAGE_LIMIT = 100
const MAX_PAGE_COUNT = 20

interface MenuContext {
  token: string
  spaceId: string
}

export class HttpMenuGateway implements MenuGateway {
  async list(filters: MenuListFilters = {}): Promise<MenuRecipe[]> {
    const context = menuContext()
    const items: ApiMenuRecipe[] = []
    let cursor = ''

    try {
      for (let pageIndex = 0; pageIndex < MAX_PAGE_COUNT; pageIndex += 1) {
        const response = await retryNetwork(() => requestApiResponse<ApiMenuRecipeList>(
          menuListPath(context.spaceId, filters, cursor),
          { token: context.token },
        ))
        items.push(...response.data.items)
        if (!response.data.nextCursor) {
          return Promise.all(items.map((item) => toMenuRecipe(item, 'thumb')))
        }
        cursor = response.data.nextCursor
      }
      throw new MenuGatewayError(
        'TOO_MANY_PAGES',
        '菜单数量过多，请缩小搜索范围后重试',
      )
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async get(id: string): Promise<MenuRecipe | null> {
    const context = menuContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiMenuRecipe>(
        menuItemPath(context.spaceId, id),
        { token: context.token },
      ))
      return toMenuRecipe(response.data, 'display')
    } catch (error) {
      if (error instanceof TransportError && error.code === 'NOT_FOUND') return null
      throw toGatewayError(error)
    }
  }

  async create(input: MenuWriteInput): Promise<MenuRecipe> {
    const context = menuContext()
    const key = createIdempotencyKey('create')
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiMenuRecipe>(
        `/spaces/${encodeURIComponent(context.spaceId)}/menu-recipes`,
        {
          method: 'POST',
          token: context.token,
          body: toApiInput(input),
          headers: { 'Idempotency-Key': key },
        },
      ))
      return toMenuRecipe(response.data, 'display')
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async update(
    id: string,
    input: MenuWriteInput,
    currentVersion: number,
  ): Promise<MenuRecipe> {
    const context = menuContext()
    const key = createIdempotencyKey('update')
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiMenuRecipe>(
        menuItemPath(context.spaceId, id),
        {
          method: 'PUT',
          token: context.token,
          body: toApiInput(input),
          headers: {
            'If-Match': ifMatch(currentVersion),
            'Idempotency-Key': key,
          },
        },
      ))
      return toMenuRecipe(response.data, 'display')
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async remove(id: string, currentVersion: number): Promise<void> {
    const context = menuContext()
    const key = createIdempotencyKey('delete')
    try {
      await retryNetwork(() => requestApiResponse<void>(
        menuItemPath(context.spaceId, id),
        {
          method: 'DELETE',
          token: context.token,
          headers: {
            'If-Match': ifMatch(currentVersion),
            'Idempotency-Key': key,
          },
        },
      ))
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async setServings(
    id: string,
    servings: number,
    currentVersion: number,
  ): Promise<MenuRecipe> {
    return this.writeAction(
      'servings',
      `${menuItemPath(menuContext().spaceId, id)}/servings`,
      currentVersion,
      { servings },
    )
  }

  async setIngredientReady(
    id: string,
    ingredientId: string,
    ready: boolean,
    currentVersion: number,
  ): Promise<MenuRecipe> {
    const context = menuContext()
    return this.writeAction(
      ready ? 'ready' : 'unready',
      `${menuItemPath(context.spaceId, id)}/ingredients/${encodeURIComponent(ingredientId)}/${ready ? 'ready' : 'unready'}`,
      currentVersion,
    )
  }

  private async writeAction(
    action: string,
    path: string,
    currentVersion: number,
    body?: WechatMiniprogram.IAnyObject,
  ): Promise<MenuRecipe> {
    const context = menuContext()
    const key = createIdempotencyKey(action)
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiMenuRecipe>(
        path,
        {
          method: action === 'servings' ? 'PUT' : 'POST',
          token: context.token,
          ...(body ? { body } : {}),
          headers: {
            'If-Match': ifMatch(currentVersion),
            'Idempotency-Key': key,
          },
        },
      ))
      return toMenuRecipe(response.data, 'display')
    } catch (error) {
      throw toGatewayError(error)
    }
  }
}

function menuContext(): MenuContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new MenuGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new MenuGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
  }
}

function menuListPath(
  spaceId: string,
  filters: MenuListFilters,
  cursor: string,
): string {
  const params: string[] = []
  const add = (name: string, value: string) => {
    params.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
  }
  const query = filters.query?.trim()
  if (query) add('query', query)
  if (filters.maxMinutes && filters.maxMinutes > 0) {
    add('maxMinutes', String(filters.maxMinutes))
  }
  if (cursor) add('cursor', cursor)
  add('limit', String(PAGE_LIMIT))
  return `/spaces/${encodeURIComponent(spaceId)}/menu-recipes?${params.join('&')}`
}

function menuItemPath(spaceId: string, recipeId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/menu-recipes/${encodeURIComponent(recipeId)}`
}

async function toMenuRecipe(
  item: ApiMenuRecipe,
  variant: 'display' | 'thumb',
): Promise<MenuRecipe> {
  const image = await resolveMenuImage(item.imageMediaId, variant, item.title)
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    servings: item.servings,
    cookingMinutes: item.cookingMinutes,
    ingredients: item.ingredients.map((entry) => ({
      id: entry.id,
      name: entry.name,
      amount: entry.amount,
      source: entry.source,
      ready: entry.ready,
    })),
    steps: item.steps.map((entry) => ({
      id: entry.id,
      title: entry.title,
      description: entry.description,
    })),
    createdAt: item.createdAt,
    ...(item.updatedAt && Date.parse(item.updatedAt) - Date.parse(item.createdAt) > 500
      ? { updatedAt: item.updatedAt }
      : {}),
    ...(image ? { image } : {}),
    version: item.version,
    createdBy: item.createdBy,
    imageMediaId: item.imageMediaId || '',
  }
}

async function resolveMenuImage(
  mediaId: string,
  variant: 'display' | 'thumb',
  title: string,
): Promise<MenuRecipe['image'] | undefined> {
  const id = mediaId || ''
  if (!id) return undefined
  try {
    const asset = await mediaGateway.get(id)
    return {
      mediaId: id,
      src: variant === 'thumb' ? asset.thumb.url : asset.display.url,
      caption: title,
    }
  } catch {
    // 图片签名失败不阻塞菜谱文字；编辑页仍保留 mediaId，可重新加载或替换。
    return undefined
  }
}

function toApiInput(input: MenuWriteInput): ApiMenuWriteRequest {
  return {
    title: input.title.trim(),
    description: input.description.trim(),
    servings: input.servings,
    cookingMinutes: input.cookingMinutes,
    imageMediaId: input.imageMediaId.trim(),
    ingredients: input.ingredients.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      name: item.name.trim(),
      amount: item.amount.trim(),
      source: item.source.trim(),
    })),
    steps: input.steps.map((item) => ({
      ...(item.id ? { id: item.id } : {}),
      title: item.title.trim(),
      description: item.description.trim(),
    })),
  }
}

function ifMatch(version: number): string {
  return `"${version}"`
}

function createIdempotencyKey(action: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `menu_${action}_${timestamp}_${random}`.slice(0, 64)
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

function toGatewayError(error: unknown): MenuGatewayError {
  if (error instanceof MenuGatewayError) return error
  if (error instanceof TransportError) {
    return new MenuGatewayError(error.code, error.message)
  }
  return new MenuGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '菜单操作没有完成',
  )
}
