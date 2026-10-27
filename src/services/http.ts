import { appConfig } from '../config/env'
import {
  sendRequest,
  TransportError,
  type HttpMethod,
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

  return sendRequest<T>({
    url: `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`,
    method: options.method ?? 'GET',
    headers,
    data: options.body,
    timeoutMs: appConfig.requestTimeoutMs,
  }).then((response) => response.data)
}
