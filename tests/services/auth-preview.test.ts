import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  dismissAuthGate,
  getAuthGateSnapshot,
  promptAuthGateIfNeeded,
  requireAuthForWrite,
  resetAuthPreviewSession,
} from '../../src/services/auth-preview'

describe('访客预览登录提示', () => {
  beforeEach(() => {
    vi.stubGlobal('wx', {
      getStorageSync: () => '',
    })
    resetAuthPreviewSession()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('关闭后本次会话不再主动弹出，写操作仍强制提示', () => {
    promptAuthGateIfNeeded()
    expect(getAuthGateSnapshot()).toEqual({ visible: true, force: false })

    dismissAuthGate()
    promptAuthGateIfNeeded()
    expect(getAuthGateSnapshot().visible).toBe(false)

    expect(requireAuthForWrite()).toBe(false)
    expect(getAuthGateSnapshot()).toEqual({ visible: true, force: true })
  })
})
