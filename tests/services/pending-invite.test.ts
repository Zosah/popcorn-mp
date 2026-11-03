import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearPendingInvite,
  readPendingInvite,
  savePendingInvite,
} from '../../src/services/pending-invite'

describe('待处理邀请', () => {
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
    vi.restoreAllMocks()
  })

  it('规范化邀请码并在登录后保留', () => {
    savePendingInvite(' 7k3m9q2xab ')
    expect(readPendingInvite()).toBe('7K3M9Q2XAB')
  })

  it('加入成功后清理邀请码', () => {
    savePendingInvite('ABCDE23456')
    clearPendingInvite()
    expect(readPendingInvite()).toBe('')
  })

  it('超过七天自动失效', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    savePendingInvite('ABCDE23456')
    vi.spyOn(Date, 'now').mockReturnValue(1_000 + 7 * 24 * 60 * 60 * 1000 + 1)
    expect(readPendingInvite()).toBe('')
    expect(storage.size).toBe(0)
  })
})
