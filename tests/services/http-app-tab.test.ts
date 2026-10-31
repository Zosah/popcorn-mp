import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import { getAppTabSnapshot } from '../../src/services/app-tab-config'
import { AppTabGatewayError } from '../../src/services/app-tab-gateway'
import { HttpAppTabGateway } from '../../src/services/http-app-tab'
import { clearApiSession, saveApiSession } from '../../src/stores/session'
import type { ApiAppTabSettings, ApiSession } from '../../src/types/api'

const originalConfig = { ...appConfig }
const createdAt = '2026-11-01T02:00:00Z'

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
  expiresAt: '2026-12-01T10:00:00Z',
  onboardingRequired: false,
}

const settings: ApiAppTabSettings = {
  slot2: 'menu',
  slot3: 'fitness',
  version: 4,
  updatedAt: '2026-11-01T03:00:00Z',
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

describe('HTTP 自定义底栏网关', () => {
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
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        succeed(options, settings)
      },
    })
    saveApiSession(session, 'token-1')
  })

  afterEach(() => {
    clearApiSession()
    Object.assign(appConfig, originalConfig)
    vi.unstubAllGlobals()
  })

  it('读取空间成员自己的底栏并写入本机缓存', async () => {
    const result = await new HttpAppTabGateway().get()
    expect(result).toMatchObject(settings)
    expect(requests[0]?.url).toBe(
      'https://api.test/spaces/s_1234567890/app-tab-settings',
    )
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
    expect(getAppTabSnapshot('s_1234567890:u_1234567890')).toMatchObject(settings)
  })

  it('保存时携带 If-Match、幂等键和两个入口', async () => {
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        succeed(options, { ...settings, version: 5 }, 200, { etag: '"5"' })
      },
    })

    const result = await new HttpAppTabGateway().update({
      slot2: 'menu',
      slot3: 'fitness',
    }, 4)
    expect(result.version).toBe(5)
    expect(requests[0]?.method).toBe('PUT')
    expect(requests[0]?.header?.['If-Match']).toBe('"4"')
    expect(requests[0]?.header?.['Idempotency-Key']).toMatch(/^app_tab_update_/)
    expect(requests[0]?.data).toEqual({
      slot2: 'menu',
      slot3: 'fitness',
    })
  })

  it('版本冲突转换为可识别的业务错误', async () => {
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        succeed(options, {
          code: 'VERSION_CONFLICT',
          message: '底栏设置已在别处更新',
          fields: [],
          requestId: 'request-conflict',
        }, 409)
      },
    })

    const promise = new HttpAppTabGateway().update({
      slot2: 'menu',
      slot3: 'fitness',
    }, 2)
    await expect(promise).rejects.toMatchObject({
      name: AppTabGatewayError.name,
      code: 'VERSION_CONFLICT',
    } satisfies Partial<AppTabGatewayError>)
  })
})
