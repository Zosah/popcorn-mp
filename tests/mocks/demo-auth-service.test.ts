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

  it('支持更新昵称和头像配色，不传头像时保留原头像', () => {
    registerDemoAccount({
      nickname: '小满',
      avatarTone: 'mint',
      avatarMediaId: 'm_avatar001',
    })
    const result = updateDemoAccount({ nickname: '满满', avatarTone: 'sun' })

    expect(result.ok).toBe(true)
    expect(getDemoAccount()).toMatchObject({
      nickname: '满满',
      avatarTone: 'sun',
      avatarMediaId: 'm_avatar001',
    })
  })

  it('支持替换和清除头像', () => {
    registerDemoAccount({
      nickname: '小满',
      avatarTone: 'mint',
      avatarMediaId: 'm_avatar001',
    })
    updateDemoAccount({
      nickname: '小满',
      avatarTone: 'mint',
      avatarMediaId: 'm_avatar002',
    })
    expect(getDemoAccount()?.avatarMediaId).toBe('m_avatar002')

    updateDemoAccount({
      nickname: '小满',
      avatarTone: 'mint',
      avatarMediaId: '',
    })
    expect(getDemoAccount()?.avatarMediaId).toBe('')
  })

  it('兼容旧缓存中没有 avatarMediaId 的账号', () => {
    storage.set('popcorn_demo_auth_account_v1', {
      id: 'demo-user-legacy',
      nickname: '旧账号',
      avatarTone: 'peach',
      createdAt: '2026-10-01T10:00:00.000Z',
    })
    storage.set('popcorn_demo_auth_session_v1', {
      userId: 'demo-user-legacy',
      loggedInAt: '2026-10-01T10:00:00.000Z',
    })

    expect(getDemoAuthState()).toMatchObject({
      isLoggedIn: true,
      user: { nickname: '旧账号', avatarMediaId: '' },
    })
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
