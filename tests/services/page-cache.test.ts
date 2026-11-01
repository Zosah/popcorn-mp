import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPageCache,
  invalidatePageCache,
  readPageCache,
  writePageCache,
} from '../../src/services/page-cache'
import { saveApiSession } from '../../src/stores/session'
import type { ApiSession } from '../../src/types/api'

function buildSession(userId: string): ApiSession {
  return {
    user: {
      id: userId,
      nickname: `用户${userId}`,
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
  }
}

describe('根页面缓存', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    saveApiSession(buildSession('user-1'), 'token-1')
    clearPageCache()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('区分新鲜缓存、过期缓存和最大有效期', () => {
    writePageCache('home:overview', { title: '今天' }, 1_000)

    expect(readPageCache<{ title: string }>('home:overview', {
      now: 1_500,
      freshForMs: 1_000,
      maxAgeMs: 2_000,
    })).toMatchObject({
      value: { title: '今天' },
      ageMs: 500,
      fresh: true,
    })
    expect(readPageCache('home:overview', {
      now: 2_500,
      freshForMs: 1_000,
      maxAgeMs: 2_000,
    })).toMatchObject({ ageMs: 1_500, fresh: false })
    expect(readPageCache('home:overview', {
      now: 3_001,
      maxAgeMs: 2_000,
    })).toBeNull()
  })

  it('不同用户之间的缓存相互隔离', () => {
    writePageCache('pets:overview', { pet: '糯米' }, 1_000)

    saveApiSession(buildSession('user-2'))

    expect(readPageCache('pets:overview', { now: 1_100 })).toBeNull()
  })

  it('可按前缀失效当前空间的页面缓存', () => {
    writePageCache('todo:overview', { pending: 2 }, 1_000)
    writePageCache('home:overview', { title: '今天' }, 1_000)

    invalidatePageCache('todo:')

    expect(readPageCache('todo:overview', { now: 1_100 })).toBeNull()
    expect(readPageCache('home:overview', { now: 1_100 })).not.toBeNull()
  })
})
