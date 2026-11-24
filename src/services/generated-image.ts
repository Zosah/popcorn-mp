import { appConfig } from '../config/env'
import { readApiToken, readStoredApiSession } from '../stores/session'
import { createRequestId } from './transport'

export interface ScenarioImage {
  mediaId: string
  displayUrl: string
  thumbUrl: string
}

interface ApiGeneratedImage {
  id: string
  display: { url: string }
  thumb: { url: string }
}

/** 只生成不落库：返回第三方临时地址，供用户预览。 */
export async function previewScenarioImage(
  kind: 'inventory' | 'menu',
  topic: string,
  category = '',
): Promise<string> {
  const { token, spaceId } = imageAuth()
  return requestImageApi<{ url: string }>('/generated-images/preview', token, spaceId, {
    kind, topic, category,
  }).then((data) => data.url)
}

/** 用户选中后再把临时图转存为自己的资源（此时才真正落库）。 */
export async function adoptScenarioImage(
  kind: 'inventory' | 'menu',
  topic: string,
  sourceUrl: string,
  category = '',
): Promise<ScenarioImage> {
  const { token, spaceId } = imageAuth()
  const data = await requestImageApi<ApiGeneratedImage>('/generated-images/adopt', token, spaceId, {
    kind,
    topic,
    category,
    sourceUrl,
  })
  return {
    mediaId: data.id,
    displayUrl: data.display?.url ?? '',
    thumbUrl: data.thumb?.url ?? data.display?.url ?? '',
  }
}

function imageAuth(): { token: string; spaceId: string } {
  const stored = readStoredApiSession()
  const token = readApiToken()
  const spaceId = stored?.session?.activeSpaceId ?? ''
  if (!token || !spaceId) throw new Error('登录后才能生成图片')
  return { token, spaceId }
}

function requestImageApi<T>(
  path: string,
  token: string,
  spaceId: string,
  data: Record<string, unknown>,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${appConfig.apiBaseUrl}/spaces/${encodeURIComponent(spaceId)}${path}`,
      method: 'POST',
      timeout: 60000,
      data,
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-Id': createRequestId(),
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as T)
          return
        }
        const body = res.data as { message?: string } | undefined
        reject(new Error(body?.message || '这次没有生成成功'))
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络不给力，稍后再试'))
      },
    })
  })
}

/**
 * 让服务端按名称生成一张示意图（同名全站复用，命中缓存立刻返回）。
 * 生成一次约 4 秒，调用方需要自己给 loading。
 */
export async function generateScenarioImage(
  kind: 'inventory' | 'menu',
  topic: string,
): Promise<ScenarioImage> {
  const stored = readStoredApiSession()
  const token = readApiToken()
  const spaceId = stored?.session?.activeSpaceId ?? ''
  if (!token || !spaceId) {
    throw new Error('登录后才能生成图片')
  }
  const response = await new Promise<ApiGeneratedImage>((resolve, reject) => {
    wx.request({
      url: `${appConfig.apiBaseUrl}/spaces/${encodeURIComponent(spaceId)}/generated-images`,
      method: 'POST',
      timeout: 60000,
      data: { kind, topic },
      header: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-Request-Id': createRequestId(),
      },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data as ApiGeneratedImage)
          return
        }
        const body = res.data as { message?: string } | undefined
        reject(new Error(body?.message || '这次没有生成成功'))
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络不给力，稍后再试'))
      },
    })
  })
  return {
    mediaId: response.id,
    displayUrl: response.display?.url ?? '',
    thumbUrl: response.thumb?.url ?? response.display?.url ?? '',
  }
}
