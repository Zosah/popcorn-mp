import { readStoredApiSession } from '../stores/session'
import type {
  ApiReminderSettings,
  ApiReminderSettingsUpdateRequest,
  ApiReminderSubscription,
  ApiReminderSubscriptionWriteRequest,
} from '../types/api'
import { requestApiResponse } from './http'
import {
  ReminderGatewayError,
  type ReminderGateway,
  type ReminderAuthorizationStatus,
  type ReminderSettings,
  type ReminderSettingsInput,
  type ReminderSubscription,
} from './reminder-gateway'
import { TransportError } from './transport'

interface ReminderContext {
  token: string
  spaceId: string
}

export class HttpReminderGateway implements ReminderGateway {
  async get(): Promise<ReminderSettings> {
    const context = reminderContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiReminderSettings>(
        reminderSettingsPath(context.spaceId),
        { token: context.token },
      ))
      return toReminderSettings(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async update(
    input: ReminderSettingsInput,
    currentVersion: number,
  ): Promise<ReminderSettings> {
    const context = reminderContext()
    const body: ApiReminderSettingsUpdateRequest = {
      expiry: input.expiry,
      petCare: input.petCare,
      weeklyReview: input.weeklyReview,
      reminderTime: input.reminderTime,
    }
    const idempotencyKey = createIdempotencyKey()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiReminderSettings>(
        reminderSettingsPath(context.spaceId),
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
      return toReminderSettings(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async getSubscription(): Promise<ReminderSubscription> {
    const context = reminderContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiReminderSubscription>(
        reminderSubscriptionPath(context.spaceId),
        { token: context.token },
      ))
      return toReminderSubscription(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async recordSubscription(
    status: ReminderAuthorizationStatus,
  ): Promise<ReminderSubscription> {
    const context = reminderContext()
    const body: ApiReminderSubscriptionWriteRequest = { status }
    const idempotencyKey = createSubscriptionIdempotencyKey()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiReminderSubscription>(
        reminderSubscriptionPath(context.spaceId),
        {
          method: 'PUT',
          token: context.token,
          body,
          headers: { 'Idempotency-Key': idempotencyKey },
        },
      ))
      return toReminderSubscription(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }
}

function reminderContext(): ReminderContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new ReminderGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new ReminderGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
  }
}

function reminderSettingsPath(spaceId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/reminder-settings`
}

function reminderSubscriptionPath(spaceId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/reminder-subscription`
}

function toReminderSettings(item: ApiReminderSettings): ReminderSettings {
  return {
    expiry: item.expiry,
    petCare: item.petCare,
    weeklyReview: item.weeklyReview,
    reminderTime: item.reminderTime,
    version: item.version,
    updatedAt: item.updatedAt,
  }
}

function toReminderSubscription(item: ApiReminderSubscription): ReminderSubscription {
  return {
    configured: item.configured,
    templateId: item.templateId,
    page: item.page,
    status: item.status,
    availableCount: item.availableCount,
    lastStatusAt: item.lastStatusAt,
    lastAcceptedAt: item.lastAcceptedAt,
  }
}

function createIdempotencyKey(): string {
  return `reminder_update_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

function createSubscriptionIdempotencyKey(): string {
  return `reminder_subscription_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
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

function toGatewayError(error: unknown): ReminderGatewayError {
  if (error instanceof ReminderGatewayError) return error
  if (error instanceof TransportError) {
    return new ReminderGatewayError(error.code, error.message)
  }
  return new ReminderGatewayError('UNKNOWN', '提醒设置暂时没有保存成功')
}
