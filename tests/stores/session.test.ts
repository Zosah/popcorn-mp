import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { ApiSession } from '../../src/types/api'
import {
  API_SESSION_STORAGE_KEYS,
  clearApiSession,
  readStoredApiSession,
  saveApiSession,
} from '../../src/stores/session'

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

describe('API 会话存储', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('保存 Token 和会话快照', () => {
    saveApiSession(session, 'token-1')

    expect(readStoredApiSession()).toEqual({ token: 'token-1', session })
    expect(storage.has(API_SESSION_STORAGE_KEYS[0])).toBe(true)
    expect(storage.has(API_SESSION_STORAGE_KEYS[1])).toBe(true)
  })

  it('后续会话更新不覆盖已保存 Token', () => {
    saveApiSession(session, 'token-1')
    saveApiSession({ ...session, activeSpaceId: 'space-1' })

    expect(readStoredApiSession()?.token).toBe('token-1')
  })

  it('清除会话时同时删除 Token 和快照', () => {
    saveApiSession(session, 'token-1')
    clearApiSession()

    expect(readStoredApiSession()).toBeNull()
  })
})
