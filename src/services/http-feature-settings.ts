import {
  buildFeatureSettingsOwnerId,
  normalizeFeatureSettings,
  saveFeatureSettingsSnapshot,
  type FeatureSettingsConfig,
} from './feature-settings-config'
import {
  FeatureSettingsGatewayError,
  type FeatureSettings,
  type FeatureSettingsGateway,
} from './feature-settings-gateway'
import { requestApiResponse } from './http'
import { readStoredApiSession } from '../stores/session'
import type {
  ApiFeatureSettings,
  ApiFeatureSettingsUpdateRequest,
} from '../types/api'
import { TransportError } from './transport'

interface FeatureSettingsContext {
  token: string
  spaceId: string
  ownerId: string
}

export class HttpFeatureSettingsGateway implements FeatureSettingsGateway {
  async get(): Promise<FeatureSettings> {
    const context = featureSettingsContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiFeatureSettings>(
        featureSettingsPath(context.spaceId),
        { token: context.token },
      ))
      return cacheSettings(response.data, context.ownerId)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async update(
    config: FeatureSettingsConfig,
    currentVersion: number,
  ): Promise<FeatureSettings> {
    const context = featureSettingsContext()
    const normalized = normalizeFeatureSettings(config)
    const body: ApiFeatureSettingsUpdateRequest = {
      homeSlots: normalized.homeSlots,
      tabSlots: normalized.tabSlots,
    }
    const idempotencyKey = createIdempotencyKey()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiFeatureSettings>(
        featureSettingsPath(context.spaceId),
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

function featureSettingsContext(): FeatureSettingsContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new FeatureSettingsGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new FeatureSettingsGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
    ownerId: buildFeatureSettingsOwnerId(
      stored.session.user.id,
      stored.session.activeSpaceId,
    ),
  }
}

function featureSettingsPath(spaceId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/feature-settings`
}

function cacheSettings(
  item: ApiFeatureSettings,
  ownerId: string,
): FeatureSettings {
  return saveFeatureSettingsSnapshot({
    ...normalizeFeatureSettings(item),
    version: item.version,
    updatedAt: item.updatedAt,
  }, ownerId)
}

function createIdempotencyKey(): string {
  return `feature_settings_update_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
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

function toGatewayError(error: unknown): FeatureSettingsGatewayError {
  if (error instanceof FeatureSettingsGatewayError) return error
  if (error instanceof TransportError) {
    return new FeatureSettingsGatewayError(error.code, error.message)
  }
  return new FeatureSettingsGatewayError('UNKNOWN', '功能配置暂时没有同步成功')
}
