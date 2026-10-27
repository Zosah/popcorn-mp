import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import type {
  ApiInventoryItem,
  ApiInventorySummary,
  ApiSession,
} from '../../src/types/api'
import { HttpInventoryGateway } from '../../src/services/http-inventory'
import { clearApiSession, saveApiSession } from '../../src/stores/session'

const originalConfig = { ...appConfig }
const now = '2026-10-27T10:00:00Z'
const session: ApiSession = {
  user: {
    id: 'user-1',
    nickname: '小满',
    avatarTone: 'mint',
    createdAt: now,
    onboardingRequired: false,
  },
  spaces: [{
    id: 'space-1',
    name: '我们的家',
    type: 'family',
    role: 'owner',
    createdAt: now,
  }],
  activeSpaceId: 'space-1',
  expiresAt: '2026-11-26T10:00:00Z',
  onboardingRequired: false,
}

const apiItem: ApiInventoryItem = {
  id: 'item-1',
  spaceId: 'space-1',
  name: '鲜牛奶',
  category: 'drink',
  quantity: '2.000',
  unit: '盒',
  location: 'fridge',
  purchasedOn: null,
  openedOn: null,
  expiresOn: '2026-10-30',
  note: '早餐',
  status: 'active',
  version: 1,
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
}

const summary: ApiInventorySummary = {
  total: 3,
  expired: 1,
  today: 0,
  urgent: 1,
  soon: 0,
  normal: 1,
  none: 0,
  dueWithin3Days: 1,
}

function succeed(
  options: WechatMiniprogram.RequestOption,
  data: unknown,
  statusCode = 200,
): void {
  options.success?.({
    statusCode,
    data,
    header: {},
    cookies: [],
    errMsg: 'request:ok',
    exception: null,
    profile: {},
    useHttpDNS: false,
  } as unknown as WechatMiniprogram.RequestSuccessCallbackResult)
}

function fail(options: WechatMiniprogram.RequestOption): void {
  options.fail?.({
    errMsg: 'request:fail timeout',
    errno: 600001,
    exception: null,
    useHttpDNS: false,
  } as unknown as WechatMiniprogram.RequestFailCallbackErr)
}

describe('HTTP 库存网关', () => {
  let storage: Map<string, unknown>
  let requests: WechatMiniprogram.RequestOption[]

  beforeEach(() => {
    storage = new Map()
    requests = []
    Object.assign(appConfig, {
      demoMode: false,
      apiBaseUrl: 'https://api.test',
      apiAuthMode: 'mock',
    })
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        const url = String(options.url)
        const method = String(options.method ?? 'GET')
        if (url.includes('/inventory/summary')) {
          succeed(options, summary)
          return
        }
        if (url.includes('/inventory/items?') && method === 'GET') {
          succeed(options, url.includes('cursor=next')
            ? { items: [], nextCursor: '' }
            : { items: [apiItem], nextCursor: 'next' })
          return
        }
        if (url.endsWith('/inventory/items') && method === 'POST') {
          succeed(options, { ...apiItem, id: 'item-created' }, 201)
          return
        }
        if (/\/inventory\/items\/item-1\/(?:consume|discard|archive|restore)$/.test(url) && method === 'POST') {
          succeed(options, apiItem)
          return
        }
        if (url.endsWith('/inventory/items/item-1') && method === 'PUT') {
          succeed(options, { ...apiItem, version: 2 })
          return
        }
        if (url.endsWith('/inventory/items/item-1') && method === 'DELETE') {
          succeed(options, undefined, 204)
          return
        }
        if (url.endsWith('/inventory/items/missing')) {
          succeed(options, {
            code: 'NOT_FOUND',
            message: '库存物品不存在',
            fields: [],
            requestId: 'request-404',
          }, 404)
          return
        }
        if (url.endsWith('/inventory/items/item-1') && method === 'GET') {
          succeed(options, apiItem)
          return
        }
        fail(options)
      },
    })
    saveApiSession(session, 'token-1')
  })

  afterEach(() => {
    clearApiSession()
    Object.assign(appConfig, originalConfig)
    vi.unstubAllGlobals()
  })

  it('自动翻页并携带筛选、鉴权和稳定上限', async () => {
    const gateway = new HttpInventoryGateway()
    const result = await gateway.list({
      query: '牛奶',
      categories: ['drink'],
      locations: ['fridge'],
      expiryStatuses: ['today', 'urgent'],
      lifecycleStatuses: ['active'],
    }, '2026-10-27')

    expect(result).toEqual([apiItem])
    expect(requests).toHaveLength(2)
    const first = new URL(String(requests[0]?.url))
    expect(first.pathname).toBe('/spaces/space-1/inventory/items')
    expect(first.searchParams.getAll('category')).toEqual(['drink'])
    expect(first.searchParams.getAll('expiryStatus')).toEqual(['today', 'urgent'])
    expect(first.searchParams.get('query')).toBe('牛奶')
    expect(first.searchParams.get('limit')).toBe('100')
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
    expect(new URL(String(requests[1]?.url)).searchParams.get('cursor')).toBe('next')
  })

  it('读取服务端摘要与单条详情，404 转成 null', async () => {
    const gateway = new HttpInventoryGateway()

    await expect(gateway.summary('2026-10-27')).resolves.toEqual(summary)
    await expect(gateway.get('item-1')).resolves.toEqual(apiItem)
    await expect(gateway.get('missing')).resolves.toBeNull()
  })

  it('创建、更新、状态切换和删除使用正确方法、版本与幂等头', async () => {
    const gateway = new HttpInventoryGateway()
    const input = {
      name: '鲜牛奶',
      category: 'drink' as const,
      quantity: '2',
      unit: '盒',
      location: 'fridge' as const,
      purchasedOn: null,
      openedOn: null,
      expiresOn: '2026-10-30',
      note: '早餐',
    }

    await gateway.create(input)
    await gateway.update('item-1', input, 1)
    await gateway.changeStatus('item-1', 'consumed', 2)
    await gateway.changeStatus('item-1', 'discarded', 3)
    await gateway.changeStatus('item-1', 'archived', 4)
    await gateway.changeStatus('item-1', 'active', 5)
    await gateway.remove('item-1', 6)

    expect(requests[0]).toMatchObject({ method: 'POST' })
    expect(requests[0]?.header?.['Idempotency-Key']).toMatch(/^inventory_create_/)
    expect(requests[1]).toMatchObject({ method: 'PUT' })
    expect(requests[1]?.header?.['If-Match']).toBe('"1"')
    expect(requests[1]?.header?.['Idempotency-Key']).toMatch(/^inventory_update_/)
    expect(String(requests[2]?.url)).toMatch(/\/consume$/)
    expect(requests[2]?.header?.['If-Match']).toBe('"2"')
    expect(String(requests[3]?.url)).toMatch(/\/discard$/)
    expect(requests[3]?.header?.['If-Match']).toBe('"3"')
    expect(String(requests[4]?.url)).toMatch(/\/archive$/)
    expect(requests[4]?.header?.['If-Match']).toBe('"4"')
    expect(String(requests[5]?.url)).toMatch(/\/restore$/)
    expect(requests[5]?.header?.['If-Match']).toBe('"5"')
    expect(requests[6]).toMatchObject({ method: 'DELETE' })
    expect(requests[6]?.header?.['If-Match']).toBe('"6"')
  })

  it('网络失败时用同一个幂等键重试一次', async () => {
    let attempts = 0
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        attempts += 1
        requests.push(options)
        if (attempts === 1) {
          fail(options)
          return
        }
        succeed(options, { ...apiItem, id: 'item-created' }, 201)
      },
    })

    const gateway = new HttpInventoryGateway()
    const result = await gateway.create({
      name: '鲜牛奶',
      category: 'drink',
      quantity: '2',
      unit: '盒',
      location: 'fridge',
      purchasedOn: null,
      openedOn: null,
      expiresOn: '2026-10-30',
      note: '早餐',
    })

    expect(result.id).toBe('item-created')
    expect(requests).toHaveLength(2)
    expect(requests[0]?.header?.['Idempotency-Key']).toBe(
      requests[1]?.header?.['Idempotency-Key'],
    )
  })

  it('后端冲突错误保留业务 code 和提示', async () => {
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        succeed(options, {
          code: 'VERSION_CONFLICT',
          message: '物品已被更新，请刷新后重试',
          fields: [],
          requestId: 'request-conflict',
        }, 409)
      },
    })

    const gateway = new HttpInventoryGateway()
    await expect(gateway.remove('item-1', 1)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
      message: '物品已被更新，请刷新后重试',
    })
  })
})
