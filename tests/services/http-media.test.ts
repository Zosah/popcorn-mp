import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import { HttpMediaGateway } from '../../src/services/http-media'
import { clearApiSession, saveApiSession } from '../../src/stores/session'
import type { ApiSession } from '../../src/types/api'

const originalConfig = { ...appConfig }
const createdAt = '2026-10-28T02:00:00Z'
const futureExpiry = '2027-11-26T10:00:00Z'
const expiredAt = '2020-01-01T00:00:00Z'

const session: ApiSession = {
  user: {
    id: 'user-1',
    nickname: '小满',
    avatarTone: 'mint',
    createdAt,
    onboardingRequired: false,
  },
  spaces: [{
    id: 'space-1',
    name: '我们的家',
    type: 'family',
    role: 'owner',
    createdAt,
  }],
  activeSpaceId: 'space-1',
  expiresAt: futureExpiry,
  onboardingRequired: false,
}

function succeed(
  options: WechatMiniprogram.RequestOption,
  data: unknown,
): void {
  options.success?.({
    statusCode: 200,
    data,
    header: {},
    cookies: [],
    errMsg: 'request:ok',
    exception: null,
    profile: {},
    useHttpDNS: false,
  } as unknown as WechatMiniprogram.RequestSuccessCallbackResult)
}

describe('HTTP 媒体网关签名地址', () => {
  let storage: Map<string, unknown>
  let requests: WechatMiniprogram.RequestOption[]
  let expiresAt: string
  let issued: number

  beforeEach(() => {
    storage = new Map()
    requests = []
    expiresAt = futureExpiry
    issued = 0
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
        issued += 1
        succeed(options, {
          id: 'm_1234567890',
          spaceId: 'space-1',
          purpose: 'journal',
          width: 800,
          height: 600,
          createdAt,
          display: {
            url: `https://cdn.test/${issued}/display.jpg`,
            expiresAt,
          },
          thumb: {
            url: `https://cdn.test/${issued}/thumb.jpg`,
            expiresAt,
          },
        })
      },
    })
    saveApiSession(session, 'token-1')
  })

  afterEach(() => {
    clearApiSession()
    Object.assign(appConfig, originalConfig)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('签名地址未过期时复用缓存，不重复请求', async () => {
    const gateway = new HttpMediaGateway()
    const first = await gateway.get('m_1234567890')
    const second = await gateway.get('m_1234567890')

    expect(requests).toHaveLength(1)
    expect(second.display.url).toBe(first.display.url)
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
  })

  it('同一媒体的并发请求只发一次，避免列表重复拉取作者头像', async () => {
    const gateway = new HttpMediaGateway()
    const [left, right] = await Promise.all([
      gateway.get('m_1234567890'),
      gateway.get('m_1234567890'),
    ])

    expect(requests).toHaveLength(1)
    expect(left.display.url).toBe(right.display.url)
  })

  it('签名地址过期后重新换取，避免列表与详情继续使用失效地址', async () => {
    expiresAt = expiredAt
    const gateway = new HttpMediaGateway()
    const first = await gateway.get('m_1234567890')
    const second = await gateway.get('m_1234567890')

    expect(requests).toHaveLength(2)
    expect(second.display.url).not.toBe(first.display.url)
    expect(second.thumb.url).not.toBe(first.thumb.url)
  })
})
