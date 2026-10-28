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

interface MediaContext {
  token: string
  spaceId: string
}

export class HttpMediaGateway implements MediaGateway {
  private readonly cache = new Map<string, ApiMediaAsset>()

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
          reject(new MediaGatewayError(
            'NETWORK_ERROR',
            error.errMsg || '图片上传没有完成，请稍后再试',
          ))
        },
      })
    })
    this.cache.set(asset.id, asset)
    return asset
  }

  async get(mediaId: string): Promise<ApiMediaAsset> {
    const id = mediaId.trim()
    if (!id) throw new MediaGatewayError('MEDIA_NOT_FOUND', '图片不存在')
    const cached = this.cache.get(id)
    if (cached && !isExpired(cached)) return cached

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

function isExpired(asset: ApiMediaAsset): boolean {
  const displayExpiresAt = Date.parse(asset.display.expiresAt)
  const thumbExpiresAt = Date.parse(asset.thumb.expiresAt)
  const earliest = Math.min(displayExpiresAt, thumbExpiresAt)
  return !Number.isFinite(earliest) || earliest <= Date.now() + 30000
}
