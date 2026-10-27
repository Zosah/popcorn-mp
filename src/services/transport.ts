import type { ApiErrorBody } from '../types/api'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

export interface TransportRequestOptions {
  url: string
  method?: HttpMethod
  headers?: Record<string, string>
  data?: WechatMiniprogram.IAnyObject | string | ArrayBuffer
  timeoutMs: number
}

export interface TransportResponse<T> {
  data: T
  statusCode: number
  requestId: string
}

export class TransportError extends Error {
  readonly statusCode: number
  readonly code: string
  readonly requestId: string
  readonly fields: ApiErrorBody['fields']

  constructor(input: {
    message: string
    statusCode: number
    code: string
    requestId: string
    fields?: ApiErrorBody['fields']
  }) {
    super(input.message)
    this.name = 'TransportError'
    this.statusCode = input.statusCode
    this.code = input.code
    this.requestId = input.requestId
    this.fields = input.fields
  }
}

export function createRequestId(): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 10)
  return `mp_${timestamp}_${random}`
}

export function sendRequest<T>(
  options: TransportRequestOptions,
): Promise<TransportResponse<T>> {
  const requestId = createRequestId()
  return new Promise((resolve, reject) => {
    wx.request({
      url: options.url,
      method: options.method ?? 'GET',
      data: options.data,
      timeout: options.timeoutMs,
      header: {
        Accept: 'application/json',
        ...options.headers,
        'X-Request-Id': requestId,
      },
      success(response) {
        const responseRequestId = findHeader(
          response.header as Record<string, string> | undefined,
          'x-request-id',
        ) || requestId

        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve({
            data: response.data as T,
            statusCode: response.statusCode,
            requestId: responseRequestId,
          })
          return
        }

        const body = readErrorBody(response.data)
        reject(new TransportError({
          statusCode: response.statusCode,
          code: body.code || `HTTP_${response.statusCode}`,
          message: body.message || '请求暂时没有完成',
          requestId: body.requestId || responseRequestId,
          fields: body.fields,
        }))
      },
      fail(error) {
        reject(new TransportError({
          statusCode: 0,
          code: 'NETWORK_ERROR',
          message: error.errMsg || '网络连接失败，请稍后再试',
          requestId,
        }))
      },
    })
  })
}

function readErrorBody(value: unknown): ApiErrorBody {
  if (!value || typeof value !== 'object') return {}
  return value as ApiErrorBody
}

function findHeader(
  headers: Record<string, string> | undefined,
  name: string,
): string {
  if (!headers) return ''
  const matchedKey = Object.keys(headers).find(
    (key) => key.toLowerCase() === name,
  )
  return matchedKey ? headers[matchedKey] ?? '' : ''
}
