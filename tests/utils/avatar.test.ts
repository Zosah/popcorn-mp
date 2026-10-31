import { describe, expect, it, vi } from 'vitest'

import type { ApiMediaAsset } from '../../src/types/api'
import { resolveAvatarUrl } from '../../src/utils/avatar'

const asset: ApiMediaAsset = {
  id: 'm_avatar001',
  spaceId: 'space-1',
  purpose: 'avatar',
  width: 640,
  height: 640,
  createdAt: '2026-11-01T10:00:00Z',
  display: {
    url: 'https://cos.example/avatar-display.jpg',
    expiresAt: '2026-11-01T11:00:00Z',
  },
  thumb: {
    url: 'https://cos.example/avatar-thumb.jpg',
    expiresAt: '2026-11-01T11:00:00Z',
  },
}

describe('头像地址解析', () => {
  it('没有 mediaId 时不请求媒体接口', async () => {
    const get = vi.fn()
    await expect(resolveAvatarUrl('  ', 'thumb', { get })).resolves.toBe('')
    expect(get).not.toHaveBeenCalled()
  })

  it('默认使用缩略图签名地址', async () => {
    const get = vi.fn().mockResolvedValue(asset)
    await expect(resolveAvatarUrl(' m_avatar001 ', 'thumb', { get })).resolves.toBe(
      'https://cos.example/avatar-thumb.jpg',
    )
    expect(get).toHaveBeenCalledWith('m_avatar001')
  })

  it('预览时可以使用原图签名地址', async () => {
    const get = vi.fn().mockResolvedValue(asset)
    await expect(resolveAvatarUrl('m_avatar001', 'display', { get })).resolves.toBe(
      'https://cos.example/avatar-display.jpg',
    )
  })

  it('签名失败或地址为空时回退到默认头像', async () => {
    const get = vi.fn().mockRejectedValue(new Error('signed url failed'))
    await expect(resolveAvatarUrl('m_avatar001', 'thumb', { get })).resolves.toBe('')

    const emptyGet = vi.fn().mockResolvedValue({
      ...asset,
      thumb: { ...asset.thumb, url: '' },
    })
    await expect(resolveAvatarUrl('m_avatar001', 'thumb', { get: emptyGet })).resolves.toBe('')
  })
})
