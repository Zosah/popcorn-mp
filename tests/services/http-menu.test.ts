import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import { HttpMenuGateway } from '../../src/services/http-menu'
import { clearApiSession, saveApiSession } from '../../src/stores/session'
import type {
  ApiMediaAsset,
  ApiMenuRecipe,
  ApiSession,
} from '../../src/types/api'

const originalConfig = { ...appConfig }
const createdAt = '2026-10-30T02:00:00Z'
const updatedAt = '2026-10-30T03:00:00Z'
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
  expiresAt: '2026-11-26T10:00:00Z',
  onboardingRequired: false,
}

const apiMenu: ApiMenuRecipe = {
  id: 'r_1234567890',
  spaceId: 's_1234567890',
  title: '番茄牛腩',
  description: '慢慢炖一锅',
  servings: 2,
  cookingMinutes: 55,
  imageMediaId: '',
  ingredients: [
    {
      id: 'g_1234567890',
      name: '牛腩',
      amount: '400g',
      source: '冰箱冷冻',
      ready: true,
      sortOrder: 0,
    },
  ],
  steps: [
    {
      id: 'p_1234567890',
      title: '焯水',
      description: '冷水下锅',
      sortOrder: 0,
    },
  ],
  version: 3,
  createdBy: 'u_1234567890',
  deletedAt: null,
  createdAt,
  updatedAt,
}

const mediaAsset: ApiMediaAsset = {
  id: 'media-menu-1',
  spaceId: 's_1234567890',
  purpose: 'menu',
  width: 1200,
  height: 900,
  createdAt,
  display: {
    url: 'https://cos.test/menu-display.jpg',
    expiresAt: '2099-12-31T23:59:59.000Z',
  },
  thumb: {
    url: 'https://cos.test/menu-thumb.jpg',
    expiresAt: '2099-12-31T23:59:59.000Z',
  },
}

function succeed(
  options: WechatMiniprogram.RequestOption,
  data: unknown,
  statusCode = 200,
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

function fail(options: WechatMiniprogram.RequestOption): void {
  options.fail?.({
    errMsg: 'request:fail timeout',
    errno: 600001,
    exception: null,
    useHttpDNS: false,
  } as unknown as WechatMiniprogram.RequestFailCallbackErr)
}

describe('HTTP 菜单网关', () => {
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

        if (url.includes('/media/')) {
          succeed(options, mediaAsset)
          return
        }
        if (url.includes('/menu-recipes?') && method === 'GET') {
          succeed(options, url.includes('cursor=next')
            ? {
                items: [{
                  ...apiMenu,
                  id: 'r_abcdefghij',
                  title: '葱油拌面',
                  cookingMinutes: 20,
                  version: 1,
                }],
                nextCursor: '',
              }
            : { items: [apiMenu], nextCursor: 'next' })
          return
        }
        if (url.endsWith('/menu-recipes') && method === 'POST') {
          succeed(options, {
            ...apiMenu,
            id: 'r_created001',
            title: '番茄牛腩',
            imageMediaId: 'media-menu-1',
            version: 1,
          }, 201, { etag: '"1"' })
          return
        }
        if (url.endsWith('/menu-recipes/r_1234567890') && method === 'GET') {
          succeed(options, apiMenu, 200, { etag: '"3"' })
          return
        }
        if (url.endsWith('/menu-recipes/r_1234567890') && method === 'PUT') {
          succeed(options, { ...apiMenu, version: 4 }, 200, { etag: '"4"' })
          return
        }
        if (url.endsWith('/menu-recipes/r_1234567890') && method === 'DELETE') {
          succeed(options, undefined, 204)
          return
        }
        if (url.endsWith('/servings') && method === 'PUT') {
          succeed(options, { ...apiMenu, servings: 3, version: 4 }, 200, { etag: '"4"' })
          return
        }
        if (url.endsWith('/ready') && method === 'POST') {
          succeed(options, {
            ...apiMenu,
            version: 4,
            ingredients: [{ ...apiMenu.ingredients[0]!, ready: true }],
          }, 200, { etag: '"4"' })
          return
        }
        if (url.endsWith('/unready') && method === 'POST') {
          succeed(options, {
            ...apiMenu,
            version: 4,
            ingredients: [{ ...apiMenu.ingredients[0]!, ready: false }],
          }, 200, { etag: '"4"' })
          return
        }
        if (url.endsWith('/menu-recipes/missing') && method === 'GET') {
          succeed(options, {
            code: 'NOT_FOUND',
            message: '菜单不存在',
            fields: [],
            requestId: 'request-404',
          }, 404)
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

  it('自动翻页，携带鉴权与筛选，并映射食材状态', async () => {
    const gateway = new HttpMenuGateway()
    const items = await gateway.list({ query: '番茄', maxMinutes: 60 })

    expect(items).toHaveLength(2)
    expect(items[0]).toMatchObject({
      id: 'r_1234567890',
      version: 3,
      cookingMinutes: 55,
      ingredients: [{ id: 'g_1234567890', ready: true }],
    })
    expect(requests).toHaveLength(2)
    const first = new URL(String(requests[0]?.url))
    expect(first.pathname).toBe('/spaces/s_1234567890/menu-recipes')
    expect(first.searchParams.get('query')).toBe('番茄')
    expect(first.searchParams.get('maxMinutes')).toBe('60')
    expect(first.searchParams.get('limit')).toBe('100')
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
    expect(new URL(String(requests[1]?.url)).searchParams.get('cursor')).toBe('next')
  })

  it('创建时携带图片、食材 ID 和幂等键', async () => {
    const gateway = new HttpMenuGateway()
    const created = await gateway.create({
      title: '番茄牛腩',
      description: '慢慢炖一锅',
      servings: 2,
      cookingMinutes: 55,
      imageMediaId: 'media-menu-1',
      ingredients: [{
        id: 'g_1234567890',
        name: '牛腩',
        amount: '400g',
        source: '冰箱冷冻',
      }],
      steps: [{
        id: 'p_1234567890',
        title: '焯水',
        description: '冷水下锅',
      }],
    })

    expect(created).toMatchObject({
      id: 'r_created001',
      imageMediaId: 'media-menu-1',
      version: 1,
    })
    const request = requests.find((item) => item.method === 'POST')
    expect(request?.header?.['Idempotency-Key']).toMatch(/^menu_create_/)
    expect(request?.data).toMatchObject({
      imageMediaId: 'media-menu-1',
      ingredients: [{ id: 'g_1234567890', name: '牛腩' }],
      steps: [{ id: 'p_1234567890', title: '焯水' }],
    })
  })

  it('详情使用展示图，更新时携带当前版本 If-Match', async () => {
    const gateway = new HttpMenuGateway()
    const current = await gateway.get(apiMenu.id)
    expect(current?.version).toBe(3)

    const updated = await gateway.update(apiMenu.id, {
      title: '番茄牛腩',
      description: '',
      servings: 2,
      cookingMinutes: 55,
      imageMediaId: '',
      ingredients: [{
        id: 'g_1234567890',
        name: '牛腩',
        amount: '400g',
        source: '冰箱冷冻',
      }],
      steps: [{ id: 'p_1234567890', title: '焯水', description: '' }],
    }, 3)

    expect(updated.version).toBe(4)
    const update = requests.find((item) => item.method === 'PUT')
    expect(update?.header?.['If-Match']).toBe('"3"')
    expect(update?.header?.['Idempotency-Key']).toMatch(/^menu_update_/)
  })

  it('人份、食材状态和删除都使用调用方传入的版本', async () => {
    const gateway = new HttpMenuGateway()
    await gateway.setServings(apiMenu.id, 3, 3)
    await gateway.setIngredientReady(apiMenu.id, 'g_1234567890', true, 4)
    await gateway.remove(apiMenu.id, 4)

    expect(requests.map((request) => String(request.method))).toEqual([
      'PUT',
      'POST',
      'DELETE',
    ])
    expect(requests.map((request) => request.header?.['If-Match'])).toEqual([
      '"3"',
      '"4"',
      '"4"',
    ])
    expect(requests.map((request) => String(request.url))).toEqual([
      'https://api.test/spaces/s_1234567890/menu-recipes/r_1234567890/servings',
      'https://api.test/spaces/s_1234567890/menu-recipes/r_1234567890/ingredients/g_1234567890/ready',
      'https://api.test/spaces/s_1234567890/menu-recipes/r_1234567890',
    ])
  })

  it('把 409 转换成页面可识别的版本冲突', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        succeed(options, {
          code: 'VERSION_CONFLICT',
          message: '版本已变化',
          fields: [],
          requestId: 'request-409',
        }, 409)
      },
    })

    const gateway = new HttpMenuGateway()
    await expect(gateway.update(apiMenu.id, {
      title: '番茄牛腩',
      description: '',
      servings: 2,
      cookingMinutes: 55,
      imageMediaId: '',
      ingredients: [{ name: '牛腩', amount: '', source: '' }],
      steps: [{ title: '焯水', description: '' }],
    }, 2)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  })

  it('详情不存在时返回 null，图片签名失败不影响文字', async () => {
    const gateway = new HttpMenuGateway()
    await expect(gateway.get('missing')).resolves.toBeNull()

    vi.unstubAllGlobals()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        requests.push(options)
        const url = String(options.url)
        if (url.includes('/media/')) {
          fail(options)
          return
        }
        succeed(options, {
          items: [{ ...apiMenu, imageMediaId: 'broken-media' }],
          nextCursor: '',
        })
      },
    })

    const brokenGateway = new HttpMenuGateway()
    const items = await brokenGateway.list()
    expect(items[0]?.title).toBe('番茄牛腩')
    expect(items[0]?.imageMediaId).toBe('broken-media')
    expect(items[0]?.image).toBeUndefined()
  })
})
