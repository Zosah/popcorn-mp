import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import { requestApi } from '../../src/services/http'
import {
  clearApiSession,
  readStoredApiSession,
  saveApiSession,
} from '../../src/stores/session'
import type { ApiSession } from '../../src/types/api'

const originalConfig = { ...appConfig }
const session: ApiSession = {
  user: {
    id: 'user-1',
    nickname: '小满',
    avatarTone: 'mint',
    createdAt: '2026-10-27T10:00:00Z',
    onboardingRequired: false,
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
  onboardingRequired: false,
}

function reply(
  options: WechatMiniprogram.RequestOption,
  statusCode: number,
  data: unknown,
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

describe('HTTP 鉴权失效处理', () => {
  let storage: Map<string, unknown>
  let navigateTo: ReturnType<typeof vi.fn>
  let showToast: ReturnType<typeof vi.fn>

  beforeEach(() => {
    storage = new Map()
    navigateTo = vi.fn()
    showToast = vi.fn()
    Object.assign(appConfig, {
      demoMode: false,
      apiBaseUrl: 'https://api.test',
      apiAuthMode: 'mock',
    })
    vi.stubGlobal('getCurrentPages', () => [{
      route: 'pages/inventory/index',
      options: {},
    }])
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      navigateTo,
      showToast,
      request: (options: WechatMiniprogram.RequestOption) => {
        reply(options, 401, {
          code: 'UNAUTHENTICATED',
          message: '登录已失效，请重新登录',
          fields: [],
          requestId: 'request-401',
        })
      },
    })
  })

  afterEach(() => {
    clearApiSession()
    Object.assign(appConfig, originalConfig)
    vi.unstubAllGlobals()
  })

  it('带 Token 的请求失效后清理会话，并且只跳转一次登录页', async () => {
    saveApiSession(session, 'expired-token')

    const results = await Promise.allSettled([
      requestApi('/inventory', { token: 'expired-token' }),
      requestApi('/journals', { token: 'expired-token' }),
    ])

    expect(results.every((result) => result.status === 'rejected')).toBe(true)
    expect(readStoredApiSession()).toBeNull()
    expect(navigateTo).toHaveBeenCalledTimes(1)
    expect(navigateTo).toHaveBeenCalledWith(expect.objectContaining({
      url: '/pages/auth/index?mode=login&reason=session-expired',
    }))
    expect(showToast).toHaveBeenCalledTimes(1)
    expect(showToast).toHaveBeenCalledWith({
      title: '登录已失效，请重新登录',
      icon: 'none',
    })
  })

  it('已经在登录页时只清理会话，不重复跳转', async () => {
    saveApiSession(session, 'auth-page-token')
    vi.stubGlobal('getCurrentPages', () => [{
      route: 'pages/auth/index',
      options: {},
    }])

    await expect(requestApi('/session', { token: 'auth-page-token' })).rejects.toMatchObject({
      statusCode: 401,
    })

    expect(readStoredApiSession()).toBeNull()
    expect(navigateTo).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('登录接口没有旧 Token 时，401 不清理也不跳转', async () => {
    await expect(requestApi('/auth/wechat', { method: 'POST' })).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
    })

    expect(navigateTo).not.toHaveBeenCalled()
    expect(showToast).not.toHaveBeenCalled()
  })

  it('旧 Token 的迟到 401 不会清掉刚建立的新会话', async () => {
    saveApiSession(session, 'new-token')

    await expect(requestApi('/inventory', { token: 'old-token' })).rejects.toMatchObject({
      statusCode: 401,
    })

    expect(readStoredApiSession()?.token).toBe('new-token')
    expect(navigateTo).not.toHaveBeenCalled()
  })
})
