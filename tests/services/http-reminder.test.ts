import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import { HttpReminderGateway } from '../../src/services/http-reminder'
import { ReminderGatewayError } from '../../src/services/reminder-gateway'
import { clearApiSession, saveApiSession } from '../../src/stores/session'
import type {
  ApiReminderSettings,
  ApiReminderSubscription,
  ApiSession,
} from '../../src/types/api'

const originalConfig = { ...appConfig }
const createdAt = '2026-10-30T02:00:00Z'

const session: ApiSession = {
  user: {
    id: 'u_1234567890',
    nickname: '小满',
    avatarTone: 'mint',
    createdAt,
    onboardingRequired: false,
  },
  spaces: [{
    id: 's_1234567890',
    name: '我们的家',
    type: 'family',
    role: 'owner',
    createdAt,
  }],
  activeSpaceId: 's_1234567890',
  expiresAt: '2026-11-26T10:00:00Z',
  onboardingRequired: false,
}

const settings: ApiReminderSettings = {
  expiry: true,
  petCare: false,
  weeklyReview: true,
  reminderTime: '07:05',
  version: 4,
  updatedAt: '2026-10-31T03:00:00Z',
}

const subscription: ApiReminderSubscription = {
  configured: true,
  templateId: 'template-1',
  page: 'pages/reminder-settings/index',
  status: 'accept',
  availableCount: 2,
  lastStatusAt: '2026-11-01T12:00:00Z',
  lastAcceptedAt: '2026-11-01T12:00:00Z',
}

function succeed(
  options: WechatMiniprogram.RequestOption,
  data: unknown,
  statusCode = 200,
  header: Record<string, string> = {},
): void {
  options.success?.({
    statusCode,
    data,
    header,
    cookies: [],
    errMsg: 'request:ok',
    exception: null,
    profile: {},
    useHttpDNS: false,
  } as unknown as WechatMiniprogram.RequestSuccessCallbackResult)
}

function fail(options: WechatMiniprogram.RequestOption): void {
  options.fail?.({
    errMsg: 'request:fail timeout',
    errno: 600001,
    exception: null,
    useHttpDNS: false,
  } as unknown as WechatMiniprogram.RequestFailCallbackErr)
}

describe('HTTP 提醒设置网关', () => {
  let storage: Map<string, unknown>
  let requests: WechatMiniprogram.RequestOption[]

  beforeEach(() => {
    storage = new Map()
    requests = []
    Object.assign(appConfig, {
      demoMode: false,
      apiBaseUrl: 'https://api.test',
      apiAuthMode: 'mock',
    })
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    saveApiSession(session, 'token-1')
  })

  afterEach(() => {
    clearApiSession()
    Object.assign(appConfig, originalConfig)
    vi.unstubAllGlobals()
  })

  it('读取当前空间成员自己的提醒设置', async () => {
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        succeed(options, settings)
      },
    })

    const result = await new HttpReminderGateway().get()
    expect(result).toEqual(settings)
    expect(requests[0]?.url).toBe(
      'https://api.test/spaces/s_1234567890/reminder-settings',
    )
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
  })

  it('保存时携带 If-Match、幂等键和完整偏好', async () => {
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        succeed(options, { ...settings, version: 5 }, 200, { etag: '"5"' })
      },
    })

    const result = await new HttpReminderGateway().update({
      expiry: true,
      petCare: false,
      weeklyReview: true,
      reminderTime: '07:05',
    }, 4)
    expect(result.version).toBe(5)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.header?.['If-Match']).toBe('"4"')
    expect(requests[0]?.header?.['Idempotency-Key']).toMatch(/^reminder_update_/)
    expect(requests[0]?.data).toEqual({
      expiry: true,
      petCare: false,
      weeklyReview: true,
      reminderTime: '07:05',
    })
  })

  it('网络失败自动重试一次且沿用同一幂等键', async () => {
    let attempts = 0
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        attempts += 1
        if (attempts === 1) {
          fail(options)
          return
        }
        succeed(options, { ...settings, version: 5 })
      },
    })

    await new HttpReminderGateway().update({
      expiry: true,
      petCare: true,
      weeklyReview: false,
      reminderTime: '20:30',
    }, 4)
    expect(attempts).toBe(2)
    expect(requests[0]?.header?.['Idempotency-Key']).toBe(
      requests[1]?.header?.['Idempotency-Key'],
    )
  })

  it('版本冲突转换为可识别的业务错误', async () => {
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        succeed(options, {
          code: 'VERSION_CONFLICT',
          message: '提醒设置已在别处更新',
          fields: [],
          requestId: 'request-conflict',
        }, 409)
      },
    })

    const promise = new HttpReminderGateway().update({
      expiry: true,
      petCare: true,
      weeklyReview: false,
      reminderTime: '20:30',
    }, 2)
    await expect(promise).rejects.toMatchObject({
      name: ReminderGatewayError.name,
      code: 'VERSION_CONFLICT',
    } satisfies Partial<ReminderGatewayError>)
  })

  it('读取订阅模板配置和剩余发送机会', async () => {
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        succeed(options, subscription)
      },
    })

    const result = await new HttpReminderGateway().getSubscription()
    expect(result).toEqual(subscription)
    expect(requests[0]?.url).toBe(
      'https://api.test/spaces/s_1234567890/reminder-subscription',
    )
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
  })

  it('回报微信授权结果时携带幂等键', async () => {
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        succeed(options, { ...subscription, availableCount: 1 })
      },
    })

    const result = await new HttpReminderGateway().recordSubscription('accept')
    expect(result.availableCount).toBe(1)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.data).toEqual({ status: 'accept' })
    expect(requests[0]?.header?.['Idempotency-Key']).toMatch(/^reminder_subscription_/)
  })
})
