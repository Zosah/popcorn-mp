import { appConfig } from '../config/env'
import { readStoredApiSession } from '../stores/session'
import type {
  ApiErrorBody,
  ApiMediaAsset,
  ApiMediaPurpose,
} from '../types/api'
import { handleApiUnauthorized } from './auth-expiry'
import {
  MediaGatewayError,
  type MediaGateway,
} from './media-gateway'
import { createRequestId } from './transport'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const UPLOAD_TIMEOUT_MS = 30000
/** 签名地址本地缓存：同一 URL 复用能让微信图片磁盘缓存命中，冷启动也不重新下载。 */
const MEDIA_URL_STORAGE_KEY = 'popcorn_media_urls_v1'
const MEDIA_URL_STORAGE_LIMIT = 300

interface MediaContext {
  token: string
  spaceId: string
}

export class HttpMediaGateway implements MediaGateway {
  private readonly cache = new Map<string, ApiMediaAsset>()
  /** 同一媒体的并发请求共享同一个 Promise，避免列表里同一作者头像被重复拉取。 */
  private readonly pending = new Map<string, Promise<ApiMediaAsset>>()

  async upload(
    filePath: string,
    purpose: ApiMediaPurpose,
    fileSize = 0,
  ): Promise<ApiMediaAsset> {
    if (fileSize > MAX_UPLOAD_BYTES) {
      throw new MediaGatewayError('FILE_TOO_LARGE', '图片不能超过 10 MiB')
    }
    const context = mediaContext()
    const url = `${apiBaseUrl()}/spaces/${encodeURIComponent(context.spaceId)}/media`
    const requestId = createRequestId()
    const asset = await new Promise<ApiMediaAsset>((resolve, reject) => {
      wx.uploadFile({
        url,
        filePath,
        name: 'file',
        formData: { purpose },
        timeout: UPLOAD_TIMEOUT_MS,
        header: {
          Accept: 'application/json',
          Authorization: `Bearer ${context.token}`,
          'X-Request-Id': requestId,
        },
        success(response) {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              resolve(parseMediaAsset(response.data))
            } catch {
              reject(new MediaGatewayError(
                'INVALID_RESPONSE',
                '图片上传成功，但返回内容无法读取',
              ))
            }
            return
          }

          const body = parseErrorBody(response.data)
          const code = body.code || `HTTP_${response.statusCode}`
          const error = new MediaGatewayError(
            code,
            body.message || '图片上传没有完成',
          )
          if (response.statusCode === 401 || code === 'UNAUTHENTICATED') {
            handleApiUnauthorized(context.token)
          }
          reject(error)
        },
        fail(error) {
          console.error('媒体上传失败', {
            requestId,
            url,
            errMsg: error.errMsg,
          })
          reject(new MediaGatewayError(
            'NETWORK_ERROR',
            error.errMsg || '图片上传没有完成，请稍后再试',
          ))
        },
      })
    })
    this.cache.set(asset.id, asset)
    persistAsset(asset)
    return asset
  }

  async get(mediaId: string): Promise<ApiMediaAsset> {
    const id = mediaId.trim()
    if (!id) throw new MediaGatewayError('MEDIA_NOT_FOUND', '图片不存在')
    const cached = this.cache.get(id)
    if (cached && !isExpired(cached)) return cached
    const stored = readStoredAsset(id)
    if (stored && !isExpired(stored)) {
      this.cache.set(id, stored)
      return stored
    }
    const pending = this.pending.get(id)
    if (pending) return pending

    const request = this.fetchAsset(id)
    this.pending.set(id, request)
    try {
      return await request
    } finally {
      this.pending.delete(id)
    }
  }

  async getMany(mediaIds: string[]): Promise<Record<string, ApiMediaAsset>> {
    const unique = Array.from(new Set(mediaIds.map((id) => id.trim()).filter(Boolean)))
    const result: Record<string, ApiMediaAsset> = {}
    const missing: string[] = []
    for (const id of unique) {
      const cached = this.cache.get(id)
      if (cached && !isExpired(cached)) {
        result[id] = cached
        continue
      }
      const stored = readStoredAsset(id)
      if (stored && !isExpired(stored)) {
        this.cache.set(id, stored)
        result[id] = stored
        continue
      }
      missing.push(id)
    }
    if (!missing.length) return result

    const context = mediaContext()
    try {
      const response = await new Promise<{ items: ApiMediaAsset[] }>((resolve, reject) => {
        wx.request({
          url: `${apiBaseUrl()}/spaces/${encodeURIComponent(context.spaceId)}/media/batch`,
          method: 'POST',
          timeout: appConfig.requestTimeoutMs,
          data: { ids: missing },
          header: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${context.token}`,
            'X-Request-Id': createRequestId(),
          },
          success(res) {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(res.data as { items: ApiMediaAsset[] })
              return
            }
            reject(new MediaGatewayError(`HTTP_${res.statusCode}`, '图片地址暂时无法读取'))
          },
          fail(error) {
            reject(new MediaGatewayError('NETWORK_ERROR', error.errMsg || '网络不给力，稍后再试'))
          },
        })
      })
      for (const raw of response.items || []) {
        try {
          const asset = parseMediaAsset(raw)
          this.cache.set(asset.id, asset)
          persistAsset(asset)
          result[asset.id] = asset
        } catch {
          // 单张解析失败不影响整批
        }
      }
      return result
    } catch {
      // 批量失败退回逐个，保证功能不受影响
      const settled = await Promise.all(unique.map(async (id) => {
        if (result[id]) return null
        try {
          return await this.get(id)
        } catch {
          return null
        }
      }))
      for (const asset of settled) {
        if (asset) result[asset.id] = asset
      }
      return result
    }
  }

  private async fetchAsset(id: string): Promise<ApiMediaAsset> {
    const context = mediaContext()
    const path = `/spaces/${encodeURIComponent(context.spaceId)}/media/${encodeURIComponent(id)}`
    const requestId = createRequestId()
    const asset = await new Promise<ApiMediaAsset>((resolve, reject) => {
      wx.request({
        url: `${apiBaseUrl()}${path}`,
        method: 'GET',
        timeout: appConfig.requestTimeoutMs,
        header: {
          Accept: 'application/json',
          Authorization: `Bearer ${context.token}`,
          'X-Request-Id': requestId,
        },
        success(response) {
          if (response.statusCode >= 200 && response.statusCode < 300) {
            try {
              resolve(parseMediaAsset(response.data))
            } catch {
              reject(new MediaGatewayError(
                'INVALID_RESPONSE',
                '图片地址暂时无法读取',
              ))
            }
            return
          }
          const body = parseErrorBody(response.data)
          const code = body.code || `HTTP_${response.statusCode}`
          if (response.statusCode === 401 || code === 'UNAUTHENTICATED') {
            handleApiUnauthorized(context.token)
          }
          reject(new MediaGatewayError(
            code,
            body.message || '图片地址暂时无法读取',
          ))
        },
        fail(error) {
          reject(new MediaGatewayError(
            'NETWORK_ERROR',
            error.errMsg || '图片地址暂时无法读取',
          ))
        },
      })
    })
    this.cache.set(asset.id, asset)
    persistAsset(asset)
    return asset
  }
}

function mediaContext(): MediaContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new MediaGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new MediaGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
  }
}

function apiBaseUrl(): string {
  const baseUrl = appConfig.apiBaseUrl.trim().replace(/\/+$/, '')
  if (!baseUrl) {
    throw new MediaGatewayError('API_BASE_URL_MISSING', '还没有配置后端接口地址')
  }
  return baseUrl
}

function parseMediaAsset(value: unknown): ApiMediaAsset {
  const raw = typeof value === 'string' ? JSON.parse(value) as unknown : value
  if (!raw || typeof raw !== 'object') throw new Error('invalid media response')
  const asset = raw as Partial<ApiMediaAsset>
  if (
    typeof asset.id !== 'string' ||
    !asset.display ||
    typeof asset.display.url !== 'string' ||
    !asset.thumb ||
    typeof asset.thumb.url !== 'string'
  ) {
    throw new Error('invalid media response')
  }
  return asset as ApiMediaAsset
}

function parseErrorBody(value: unknown): ApiErrorBody {
  if (!value) return {}
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) as unknown : value
    if (!raw || typeof raw !== 'object') return {}
    return raw as ApiErrorBody
  } catch {
    return {}
  }
}

type StoredAssetMap = Record<string, ApiMediaAsset>

function readAssetMap(): StoredAssetMap {
  try {
    const raw = wx.getStorageSync<StoredAssetMap | ''>(MEDIA_URL_STORAGE_KEY)
    return raw && typeof raw === 'object' ? raw : {}
  } catch {
    return {}
  }
}

function readStoredAsset(mediaId: string): ApiMediaAsset | null {
  const map = readAssetMap()
  const asset = map[mediaId]
  return asset && asset.id ? asset : null
}

/** 只保留未过期的条目，并按近期写入裁剪条数，避免 storage 无限增长。 */
function persistAsset(asset: ApiMediaAsset): void {
  try {
    const map = readAssetMap()
    map[asset.id] = asset
    const alive = Object.entries(map)
      .filter(([, value]) => value && !isExpired(value))
      .slice(-MEDIA_URL_STORAGE_LIMIT)
    wx.setStorageSync(MEDIA_URL_STORAGE_KEY, Object.fromEntries(alive))
  } catch {
    // 缓存失败不影响主流程
  }
}

function isExpired(asset: ApiMediaAsset): boolean {
  const displayExpiresAt = Date.parse(asset.display.expiresAt)
  const thumbExpiresAt = Date.parse(asset.thumb.expiresAt)
  const earliest = Math.min(displayExpiresAt, thumbExpiresAt)
  return !Number.isFinite(earliest) || earliest <= Date.now() + 30000
}
