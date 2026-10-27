import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getDemoAccount,
  getDemoAuthState,
  loginDemoAccount,
  logoutDemoAccount,
  registerDemoAccount,
  resetDemoAuth,
  updateDemoAccount,
} from '../../src/services/demo-auth'

describe('本机登录态', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map<string, unknown>()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('注册后直接建立登录态', () => {
    const result = registerDemoAccount({
      nickname: ' 小满 ',
      avatarTone: 'peach',
    })

    expect(result.ok).toBe(true)
    expect(getDemoAccount()?.nickname).toBe('小满')
    expect(getDemoAuthState()).toMatchObject({
      isLoggedIn: true,
      avatarText: '小',
      user: { nickname: '小满', avatarTone: 'peach' },
    })
  })

  it('退出只清除会话，再次登录恢复本机账号', () => {
    registerDemoAccount({ nickname: '小满', avatarTone: 'mint' })
    logoutDemoAccount()

    expect(getDemoAuthState().isLoggedIn).toBe(false)
    expect(getDemoAccount()?.nickname).toBe('小满')
    expect(loginDemoAccount().ok).toBe(true)
    expect(getDemoAuthState().isLoggedIn).toBe(true)
  })

  it('支持更新昵称和头像配色', () => {
    registerDemoAccount({ nickname: '小满', avatarTone: 'mint' })
    const result = updateDemoAccount({ nickname: '满满', avatarTone: 'sun' })

    expect(result.ok).toBe(true)
    expect(getDemoAccount()).toMatchObject({ nickname: '满满', avatarTone: 'sun' })
  })

  it('拒绝空昵称，并可在清除后重新注册', () => {
    const invalid = registerDemoAccount({ nickname: ' ', avatarTone: 'mint' })
    expect(invalid).toMatchObject({
      ok: false,
      reason: 'invalid-nickname',
    })

    registerDemoAccount({ nickname: '小满', avatarTone: 'mint' })
    resetDemoAuth()
    expect(getDemoAccount()).toBeNull()
    expect(getDemoAuthState().isLoggedIn).toBe(false)
  })
})
