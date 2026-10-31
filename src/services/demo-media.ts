import type { ApiMediaAsset, ApiMediaPurpose } from '../types/api'
import type { MediaGateway } from './media-gateway'

export class DemoMediaGateway implements MediaGateway {
  private readonly cache = new Map<string, ApiMediaAsset>()

  async upload(filePath: string, purpose: ApiMediaPurpose): Promise<ApiMediaAsset> {
    const now = new Date().toISOString()
    const id = `demo-media-${Date.now()}`
    const asset: ApiMediaAsset = {
      id,
      spaceId: 'demo-space',
      purpose,
      width: 0,
      height: 0,
      createdAt: now,
      display: { url: filePath, expiresAt: '2099-12-31T23:59:59.000Z' },
      thumb: { url: filePath, expiresAt: '2099-12-31T23:59:59.000Z' },
    }
    this.cache.set(id, asset)
    return asset
  }

  async get(mediaId: string): Promise<ApiMediaAsset> {
    const cached = this.cache.get(mediaId)
    if (cached) return cached
    const now = new Date().toISOString()
    return {
      id: mediaId,
      spaceId: 'demo-space',
      purpose: 'journal',
      width: 0,
      height: 0,
      createdAt: now,
      display: { url: '', expiresAt: '2099-12-31T23:59:59.000Z' },
      thumb: { url: '', expiresAt: '2099-12-31T23:59:59.000Z' },
    }
  }
}
