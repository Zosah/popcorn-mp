import { appConfig } from '../config/env'
import { readApiToken, readStoredApiSession } from '../stores/session'
import { createRequestId } from './transport'

export type ImageJobStatus = 'pending' | 'running' | 'done' | 'failed'

export interface ImageJob {
  id: string
  status: ImageJobStatus
  mediaId: string
  error: string
  topic: string
  targetItemId: string
}

function auth(): { token: string; spaceId: string } {
  const stored = readStoredApiSession()
  const token = readApiToken()
  const spaceId = stored?.session?.activeSpaceId ?? ''
  if (!token || !spaceId) throw new Error('登录后才能生成图片')
  return { token, spaceId }
}

function request<T>(path: string, method: 'POST' | 'GET', data?: Record<string, unknown>): Promise<T> {
  const { token, spaceId } = auth()
  return new Promise<T>((resolve, reject) => {
    wx.request({
      url: `${appConfig.apiBaseUrl}/spaces/${encodeURIComponent(spaceId)}${path}`,
      method,
      timeout: 15000,
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
        reject(new Error(body?.message || '操作没成功，稍后再试'))
      },
      fail(error) {
        reject(new Error(error.errMsg || '网络不给力，稍后再试'))
      },
    })
  })
}

/**
 * 提交一张生图任务（幂等：同 分类+名称 已有图或已有排队任务时，后端直接复用）。
 * forced=true 表示用户主动「换一张」，跳过缓存重新生成。
 */
export function enqueueImageJob(input: {
  kind: 'inventory' | 'menu'
  category: string
  topic: string
  targetItemId?: string
  forced?: boolean
}): Promise<ImageJob> {
  return request<ImageJob>('/generated-images/jobs', 'POST', {
    kind: input.kind,
    category: input.category,
    topic: input.topic,
    targetItemId: input.targetItemId ?? '',
    forced: input.forced ?? false,
  })
}

/** 轮询任务状态。 */
export function getImageJob(jobId: string): Promise<ImageJob> {
  return request<ImageJob>(`/generated-images/jobs/${encodeURIComponent(jobId)}`, 'GET')
}
