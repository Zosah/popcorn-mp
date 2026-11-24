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
