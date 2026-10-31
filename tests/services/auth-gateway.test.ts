import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import {
  loginWithApi,
  logoutApi,
  restoreApiSession,
  updateApiProfile,
} from '../../src/services/auth-gateway'
import {
  clearApiSession,
  readStoredApiSession,
} from '../../src/stores/session'
import type { ApiLoginResponse, ApiSession } from '../../src/types/api'

const originalConfig = { ...appConfig }
const loginSession: ApiSession = {
  user: {
    id: 'user-1',
    nickname: '',
    avatarTone: 'lavender',
    createdAt: '2026-10-27T10:00:00Z',
    onboardingRequired: true,
  },
  spaces: [{
    id: 'space-1',
    name: '我们的家',
    type: 'family',
    role: 'owner',
    createdAt: '2026-10-27T10:00:00Z',
  }],
  activeSpaceId: 'space-1',
  expiresAt: '2026-11-26T10:00:00Z',
  onboardingRequired: true,
}

function succeed(
  options: WechatMiniprogram.RequestOption,
  data: unknown,
  statusCode = 200,
): void {
  options.success?.({
    statusCode,
    data,
    header: {},
    cookies: [],
    errMsg: 'request:ok',
    exception: null,
    profile: {},
    useHttpDNS: false,
  } as unknown as WechatMiniprogram.RequestSuccessCallbackResult)
}

describe('HTTP 登录网关', () => {
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
        const url = String(options.url)
        if (url.endsWith('/auth/mock')) {
          succeed(options, { ...loginSession, token: 'token-1' } satisfies ApiLoginResponse)
          return
        }
        if (url.endsWith('/me')) {
          succeed(options, {
            ...loginSession,
            user: { ...loginSession.user, nickname: '小满', onboardingRequired: false },
            onboardingRequired: false,
          } satisfies ApiSession)
          return
        }
        if (url.endsWith('/session')) {
          succeed(options, loginSession)
          return
        }
        options.fail?.({
          errMsg: 'unexpected request',
          errno: 1,
          exception: null,
          useHttpDNS: false,
        } as unknown as WechatMiniprogram.RequestFailCallbackErr)
      },
    })
  })

  afterEach(() => {
    clearApiSession()
    Object.assign(appConfig, originalConfig)
    vi.unstubAllGlobals()
  })

  it('模拟登录后保存 Token，并识别需要补资料', async () => {
    const result = await loginWithApi()

    expect(result).toMatchObject({
      ok: true,
      requiresProfile: true,
      session: { activeSpaceId: 'space-1' },
    })
    expect(readStoredApiSession()?.token).toBe('token-1')
    expect(requests[0]).toMatchObject({
      url: 'https://api.test/auth/mock',
      method: 'POST',
    })
  })

  it('保存资料使用 PUT，并保留登录 Token', async () => {
    await loginWithApi()
    const result = await updateApiProfile({
      nickname: '小满',
      avatarTone: 'mint',
      avatarMediaId: 'm_avatar001',
    })

    expect(result.ok).toBe(true)
    expect(result.session?.user.nickname).toBe('小满')
    expect(readStoredApiSession()).toMatchObject({
      token: 'token-1',
      session: { onboardingRequired: false },
    })
    expect(requests[1]).toMatchObject({
      url: 'https://api.test/me',
      method: 'PUT',
      data: {
        nickname: '小满',
        avatarTone: 'mint',
        avatarMediaId: 'm_avatar001',
      },
    })
    expect(requests[1]?.header?.Authorization).toBe('Bearer token-1')
  })

  it('启动恢复调用 GET /session', async () => {
    await loginWithApi()
    const result = await restoreApiSession()

    expect(result.ok).toBe(true)
    expect(requests[1]).toMatchObject({
      url: 'https://api.test/session',
      method: 'GET',
    })
  })

  it('退出时撤销会话并清除本机 Token', async () => {
    await loginWithApi()
    await logoutApi()

    expect(requests[1]).toMatchObject({
      url: 'https://api.test/session',
      method: 'DELETE',
    })
    expect(readStoredApiSession()).toBeNull()
  })
})
