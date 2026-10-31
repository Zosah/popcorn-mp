import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DemoMediaGateway } from '../../src/services/demo-media'

describe('Demo 媒体持久化', () => {
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
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('头像上传后重建网关仍然可以读取地址', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
    const gateway = new DemoMediaGateway()
    const uploaded = await gateway.upload('/tmp/avatar.jpg', 'avatar')

    expect(uploaded).toMatchObject({
      purpose: 'avatar',
      display: { url: '/tmp/avatar.jpg' },
      thumb: { url: '/tmp/avatar.jpg' },
    })

    const restored = await new DemoMediaGateway().get(uploaded.id)
    expect(restored).toMatchObject({
      id: uploaded.id,
      purpose: 'avatar',
      thumb: { url: '/tmp/avatar.jpg' },
    })
  })
})
