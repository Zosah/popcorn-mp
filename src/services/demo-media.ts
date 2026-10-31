import type { ApiMediaAsset, ApiMediaPurpose } from '../types/api'
import type { MediaGateway } from './media-gateway'

const DEMO_MEDIA_KEY = 'popcorn_demo_media_assets_v1'

function readAssets(): Map<string, ApiMediaAsset> {
  const value = wx.getStorageSync<unknown>(DEMO_MEDIA_KEY)
  if (!value || typeof value !== 'object') return new Map()
  const result = new Map<string, ApiMediaAsset>()
  for (const [key, asset] of Object.entries(value as Record<string, unknown>)) {
    if (!asset || typeof asset !== 'object') continue
    const candidate = asset as Partial<ApiMediaAsset>
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.spaceId !== 'string' ||
      typeof candidate.purpose !== 'string' ||
      typeof candidate.createdAt !== 'string' ||
      !candidate.display ||
      !candidate.thumb
    ) continue
    result.set(key, candidate as ApiMediaAsset)
  }
  return result
}

export class DemoMediaGateway implements MediaGateway {
  private readonly cache = readAssets()

  private persist(): void {
    wx.setStorageSync(DEMO_MEDIA_KEY, Object.fromEntries(this.cache))
  }

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
    this.persist()
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
