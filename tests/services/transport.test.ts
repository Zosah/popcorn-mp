import { afterEach, describe, expect, it, vi } from 'vitest'

import { sendRequest } from '../../src/services/transport'

function succeed(
  options: WechatMiniprogram.RequestOption,
  statusCode: number,
  data: unknown,
  header: Record<string, string> = {},
): void {
  options.success?.({
    statusCode,
    data,
    header,
    cookies: [],
    errMsg: 'request:ok',
    exception: null,
    profile: {},
    useHttpDNS: false,
  } as unknown as WechatMiniprogram.RequestSuccessCallbackResult)
}

describe('小程序请求层', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('自动注入请求 ID，并返回成功响应', async () => {
    const request = vi.fn((options: WechatMiniprogram.RequestOption) => {
      succeed(options, 200, { status: 'ready' }, {
        'X-Request-Id': 'server-request-id',
      })
    })
    vi.stubGlobal('wx', { request })

    const response = await sendRequest<{ status: string }>({
      url: 'https://api.test/readyz',
      timeoutMs: 1000,
    })

    expect(response).toEqual({
      statusCode: 200,
      requestId: 'server-request-id',
      data: { status: 'ready' },
      headers: { 'x-request-id': 'server-request-id' },
    })
    const options = request.mock.calls[0]?.[0]
    expect(options?.header?.['X-Request-Id']).toMatch(/^mp_/)
  })

  it('把后端错误转换为带 code 的 TransportError', async () => {
    const request = vi.fn((options: WechatMiniprogram.RequestOption) => {
      succeed(options, 401, {
        code: 'UNAUTHENTICATED',
        message: '登录已失效，请重新登录',
        fields: [],
        requestId: 'server-request-id',
      })
    })
    vi.stubGlobal('wx', { request })

    await expect(sendRequest({
      url: 'https://api.test/session',
      timeoutMs: 1000,
    })).rejects.toMatchObject({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
      message: '登录已失效，请重新登录',
      requestId: 'server-request-id',
    })
  })

  it('网络失败转换为 NETWORK_ERROR', async () => {
    const request = vi.fn((options: WechatMiniprogram.RequestOption) => {
      options.fail?.({
        errMsg: 'request:fail timeout',
        errno: 600001,
        exception: null,
        useHttpDNS: false,
      } as unknown as WechatMiniprogram.RequestFailCallbackErr)
    })
    vi.stubGlobal('wx', { request })

    await expect(sendRequest({
      url: 'https://api.test/session',
      timeoutMs: 1000,
    })).rejects.toMatchObject({
      statusCode: 0,
      code: 'NETWORK_ERROR',
      message: 'request:fail timeout',
    })
  })
})
