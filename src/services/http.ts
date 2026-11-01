import { appConfig } from '../config/env'
import { handleApiUnauthorized } from './auth-expiry'
import { invalidatePageCache } from './page-cache'
import {
  sendRequest,
  TransportError,
  type HttpMethod,
  type TransportResponse,
} from './transport'

export interface ApiRequestOptions {
  method?: HttpMethod
  body?: WechatMiniprogram.IAnyObject | string | ArrayBuffer
  token?: string
  headers?: Record<string, string>
}

export function requestApi<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  return requestApiResponse<T>(path, options).then((response) => response.data)
}

export function requestApiResponse<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<TransportResponse<T>> {
  if (appConfig.demoMode) {
    throw new TransportError({
      statusCode: 0,
      code: 'DEMO_MODE',
      message: '当前处于 Demo 模式，不会请求后端接口',
      requestId: '',
    })
  }
  const baseUrl = appConfig.apiBaseUrl.trim().replace(/\/+$/, '')
  if (!baseUrl) {
    throw new TransportError({
      statusCode: 0,
      code: 'API_BASE_URL_MISSING',
      message: '还没有配置后端接口地址',
      requestId: '',
    })
  }

  const headers: Record<string, string> = {}
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  Object.assign(headers, options.headers)

  const method = options.method ?? 'GET'
  return sendRequest<T>({
    url: `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`,
    method,
    headers,
    data: options.body,
    timeoutMs: appConfig.requestTimeoutMs,
  }).then((response) => {
    // 写请求成功后，当前用户/空间下的根页面缓存都可能过期。
    // 这里统一失效，避免换头像、记账、写记录后切页仍看到旧快照。
    if (method !== 'GET') invalidatePageCache()
    return response
  }).catch((error: unknown) => {
    if (
      options.token &&
      error instanceof TransportError &&
      (error.statusCode === 401 || error.code === 'UNAUTHENTICATED')
    ) {
      handleApiUnauthorized(options.token)
    }
    throw error
  })
}
