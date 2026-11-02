import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import { HttpMealOrderGateway } from '../../src/services/http-meal-order'
import { clearApiSession, saveApiSession } from '../../src/stores/session'
import type { ApiMealOrder, ApiSession } from '../../src/types/api'

const originalConfig = { ...appConfig }
const createdAt = '2026-11-02T02:00:00Z'
const session: ApiSession = {
  user: {
    id: 'u_1234567890',
    nickname: '小满',
    avatarTone: 'mint',
    createdAt,
    onboardingRequired: false,
  },
  spaces: [{
    id: 's_1234567890',
    name: '我们的家',
    type: 'family',
    role: 'owner',
    createdAt,
  }],
  activeSpaceId: 's_1234567890',
  expiresAt: '2026-12-02T10:00:00Z',
  onboardingRequired: false,
}

const apiOrder: ApiMealOrder = {
  id: 'h_1234567890',
  spaceId: 's_1234567890',
  orderDate: '2026-11-02',
  mealType: 'dinner',
  status: 'pending',
  note: '少放辣',
  version: 1,
  createdBy: 'u_1234567890',
  createdByName: '小满',
  items: [{
    id: 'f_1234567890',
    recipeId: 'r_1234567890',
    recipeTitle: '番茄牛腩',
    servings: 2,
    sortOrder: 0,
    ingredients: [{
      id: 'x_1234567890',
      name: '牛腩',
      amount: '400g',
      source: '冰箱冷冻',
      ready: false,
      sortOrder: 0,
    }],
  }],
  completedAt: null,
  createdAt,
  updatedAt: createdAt,
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

describe('HTTP 用餐订单网关', () => {
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
        if (method === 'GET' && url.includes('/meal-orders?')) {
          succeed(options, { items: [apiOrder], nextCursor: '' })
          return
        }
        if (method === 'POST' && url.endsWith('/meal-orders')) {
          succeed(options, apiOrder, 201)
          return
        }
        if (method === 'PUT' && url.endsWith('/status')) {
          succeed(options, { ...apiOrder, status: 'preparing', version: 2 })
          return
        }
        if (method === 'POST' && url.includes('/ingredients/') && url.endsWith('/ready')) {
          succeed(options, {
            ...apiOrder,
            version: 2,
            items: [{
              ...apiOrder.items[0]!,
              ingredients: [{ ...apiOrder.items[0]!.ingredients[0]!, ready: true }],
            }],
          })
          return
        }
        options.fail?.({
          errMsg: 'request:fail unexpected',
          errno: 600001,
          exception: null,
          useHttpDNS: false,
        } as unknown as WechatMiniprogram.RequestFailCallbackErr)
      },
    })
    saveApiSession(session, 'token-1')
  })

  afterEach(() => {
    clearApiSession()
    Object.assign(appConfig, originalConfig)
    vi.unstubAllGlobals()
  })

  it('按筛选读取并映射点单人、菜品和备菜食材', async () => {
    const gateway = new HttpMealOrderGateway()
    const items = await gateway.list({ status: 'pending', date: '2026-11-02' })

    expect(items[0]).toMatchObject({
      id: 'h_1234567890',
      createdByName: '小满',
      items: [{
        recipeTitle: '番茄牛腩',
        ingredients: [{ name: '牛腩', ready: false }],
      }],
    })
    const requestUrl = new URL(String(requests[0]?.url))
    expect(requestUrl.pathname).toBe('/spaces/s_1234567890/meal-orders')
    expect(requestUrl.searchParams.get('status')).toBe('pending')
    expect(requestUrl.searchParams.get('date')).toBe('2026-11-02')
    expect(requestUrl.searchParams.get('limit')).toBe('100')
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
  })

  it('创建点菜单时只提交菜谱和份数，并带幂等键', async () => {
    const gateway = new HttpMealOrderGateway()
    const created = await gateway.create({
      orderDate: '2026-11-02',
      mealType: 'dinner',
      note: ' 少放辣 ',
      items: [{ recipeId: 'r_1234567890', servings: 2 }],
    })

    expect(created.id).toBe('h_1234567890')
    const request = requests.find((item) => item.method === 'POST')
    expect(request?.data).toEqual({
      orderDate: '2026-11-02',
      mealType: 'dinner',
      note: '少放辣',
      items: [{ recipeId: 'r_1234567890', servings: 2 }],
    })
    expect(request?.header?.['Idempotency-Key']).toMatch(/^meal_create_/)
  })

  it('状态流转和食材勾选都携带当前版本', async () => {
    const gateway = new HttpMealOrderGateway()
    const advanced = await gateway.setStatus('h_1234567890', 'preparing', 1)
    const checked = await gateway.setIngredientReady(
      'h_1234567890',
      'x_1234567890',
      true,
      2,
    )

    expect(advanced.version).toBe(2)
    expect(checked.items[0]?.ingredients[0]?.ready).toBe(true)
    expect(requests.map((item) => item.header?.['If-Match'])).toEqual(['"1"', '"2"'])
    expect(requests.map((item) => item.header?.['Idempotency-Key'])).toEqual([
      expect.stringMatching(/^meal_status_/),
      expect.stringMatching(/^meal_ingredient-ready_/),
    ])
  })
})
