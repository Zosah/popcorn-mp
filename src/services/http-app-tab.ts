import {
  buildAppTabOwnerId,
  normalizeAppTabConfig,
  saveAppTabSnapshot,
  type AppTabConfig,
} from './app-tab-config'
import {
  AppTabGatewayError,
  type AppTabGateway,
  type AppTabSettings,
} from './app-tab-gateway'
import { requestApiResponse } from './http'
import { readStoredApiSession } from '../stores/session'
import type {
  ApiAppTabSettings,
  ApiAppTabSettingsUpdateRequest,
} from '../types/api'
import { TransportError } from './transport'

interface AppTabContext {
  token: string
  spaceId: string
  userId: string
  ownerId: string
}

export class HttpAppTabGateway implements AppTabGateway {
  async get(): Promise<AppTabSettings> {
    const context = appTabContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiAppTabSettings>(
        appTabSettingsPath(context.spaceId),
        { token: context.token },
      ))
      return cacheSettings(response.data, context.ownerId)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async update(
    config: AppTabConfig,
    currentVersion: number,
  ): Promise<AppTabSettings> {
    const context = appTabContext()
    const normalized = normalizeAppTabConfig(config)
    const body: ApiAppTabSettingsUpdateRequest = {
      slot2: normalized.slot2,
      slot3: normalized.slot3,
    }
    const idempotencyKey = createIdempotencyKey()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiAppTabSettings>(
        appTabSettingsPath(context.spaceId),
        {
          method: 'PUT',
          token: context.token,
          body,
          headers: {
            'If-Match': `"${currentVersion}"`,
            'Idempotency-Key': idempotencyKey,
          },
        },
      ))
      return cacheSettings(response.data, context.ownerId)
    } catch (error) {
      throw toGatewayError(error)
    }
  }
}

function appTabContext(): AppTabContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new AppTabGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new AppTabGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
    userId: stored.session.user.id,
    ownerId: buildAppTabOwnerId(stored.session.user.id, stored.session.activeSpaceId),
  }
}

function appTabSettingsPath(spaceId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/app-tab-settings`
}

function cacheSettings(
  item: ApiAppTabSettings,
  ownerId: string,
): AppTabSettings {
  const normalized = normalizeAppTabConfig(item)
  const saved = saveAppTabSnapshot({
    ...normalized,
    version: item.version,
    updatedAt: item.updatedAt,
  }, ownerId)
  return saved
}

function createIdempotencyKey(): string {
  return `app_tab_update_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

async function retryNetwork<T>(action: () => Promise<T>): Promise<T> {
  try {
    return await action()
  } catch (error) {
    if (error instanceof TransportError && error.code === 'NETWORK_ERROR') {
      return action()
    }
    throw error
  }
}

function toGatewayError(error: unknown): AppTabGatewayError {
  if (error instanceof AppTabGatewayError) return error
  if (error instanceof TransportError) {
    return new AppTabGatewayError(error.code, error.message)
  }
  return new AppTabGatewayError('UNKNOWN', '底栏设置暂时没有同步成功')
}
