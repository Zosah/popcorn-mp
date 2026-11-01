import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPageCache,
  readPageCache,
  writePageCache,
} from '../../src/services/page-cache'
import { saveApiSession } from '../../src/stores/session'

describe('清除本机数据', () => {
  let storage: Map<string, unknown>
  let clearStorageSync: ReturnType<typeof vi.fn>

  beforeEach(() => {
    storage = new Map()
    clearStorageSync = vi.fn(() => storage.clear())
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      clearStorageSync,
    })
    saveApiSession({
      user: {
        id: 'user-1',
        nickname: '小满',
        avatarTone: 'mint',
        createdAt: '2026-11-01T00:00:00.000Z',
        onboardingRequired: false,
      },
      spaces: [{
        id: 'space-1',
        name: '我们的家',
        type: 'family',
        role: 'owner',
        createdAt: '2026-11-01T00:00:00.000Z',
      }],
      activeSpaceId: 'space-1',
      expiresAt: '2026-12-01T00:00:00.000Z',
      onboardingRequired: false,
    }, 'token-1')
    clearPageCache()
    writePageCache('home:overview', { title: '今天' })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('清空本机存储与页面缓存，不触碰云端接口', async () => {
    const { clearAllLocalData } = await import('../../src/services/local-reset')

    clearAllLocalData()

    expect(clearStorageSync).toHaveBeenCalledOnce()
    expect(storage.size).toBe(0)
    expect(readPageCache('home:overview')).toBeNull()
  })
})
