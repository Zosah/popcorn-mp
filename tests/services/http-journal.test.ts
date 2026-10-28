import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import { HttpJournalGateway } from '../../src/services/http-journal'
import { clearApiSession, saveApiSession } from '../../src/stores/session'
import type { ApiJournalItem, ApiSession } from '../../src/types/api'

const originalConfig = { ...appConfig }
const createdAt = '2026-10-28T02:00:00Z'
const updatedAt = '2026-10-28T03:00:00Z'
const session: ApiSession = {
  user: {
    id: 'user-1',
    nickname: '小满',
    avatarTone: 'mint',
    createdAt,
    onboardingRequired: false,
  },
  spaces: [{
    id: 'space-1',
    name: '我们的家',
    type: 'family',
    role: 'owner',
    createdAt,
  }],
  activeSpaceId: 'space-1',
  expiresAt: '2026-11-26T10:00:00Z',
  onboardingRequired: false,
}

const apiJournal: ApiJournalItem = {
  id: 'journal-1',
  spaceId: 'space-1',
  kind: 'note',
  title: '家里常用信息',
  content: '门禁卡放在玄关。',
  category: 'home',
  visibility: 'space',
  imageMediaId: '',
  imageCaption: '',
  version: 3,
  createdBy: 'user-1',
  authorName: '小满',
  deletedAt: null,
  createdAt,
  updatedAt,
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

describe('HTTP 生活记录网关', () => {
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
        if (url.includes('/journals/summary')) {
          succeed(options, { total: 4, moments: 2, notes: 2, private: 1 })
          return
        }
        if (url.includes('/journals?') && method === 'GET') {
          succeed(options, url.includes('cursor=next')
            ? { items: [], nextCursor: '' }
            : { items: [apiJournal], nextCursor: 'next' })
          return
        }
        if (url.endsWith('/journals/journal-1') && method === 'GET') {
          succeed(options, apiJournal, 200, { etag: '"3"' })
          return
        }
        if (url.endsWith('/journals') && method === 'POST') {
          succeed(options, {
            ...apiJournal,
            id: 'journal-created',
            kind: 'moment',
            title: '一起散步',
            category: '',
            version: 1,
            createdAt: updatedAt,
            updatedAt,
          }, 201, { etag: '"1"' })
          return
        }
        if (url.endsWith('/journals/journal-1') && method === 'PUT') {
          succeed(options, { ...apiJournal, version: 4 }, 200, { etag: '"4"' })
          return
        }
        if (url.endsWith('/journals/journal-1') && method === 'DELETE') {
          succeed(options, undefined, 204)
          return
        }
        if (url.endsWith('/journals/private-1') && method === 'GET') {
          succeed(options, {
            code: 'NOT_FOUND',
            message: '生活记录不存在',
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

  it('自动翻页、携带鉴权与筛选，并映射展示字段', async () => {
    const gateway = new HttpJournalGateway()
    const items = await gateway.list({
      kinds: ['moment', 'note'],
      category: 'home',
      visibility: 'space',
      query: '门禁',
    })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'journal-1',
      version: 3,
      kindLabel: '重要记录',
      categoryLabel: '家的资料',
      visibilityLabel: '空间成员可见',
      authorName: '小满',
      updatedAt,
    })
    expect(requests).toHaveLength(2)
    const first = new URL(String(requests[0]?.url))
    expect(first.pathname).toBe('/spaces/space-1/journals')
    expect(first.searchParams.getAll('kind')).toEqual(['moment', 'note'])
    expect(first.searchParams.get('category')).toBe('home')
    expect(first.searchParams.get('visibility')).toBe('space')
    expect(first.searchParams.get('query')).toBe('门禁')
    expect(first.searchParams.get('limit')).toBe('100')
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
  })

  it('读取摘要与详情，详情返回服务端版本', async () => {
    const gateway = new HttpJournalGateway()
    const summary = await gateway.summary()
    const item = await gateway.get('journal-1')

    expect(summary).toEqual({ total: 4, moments: 2, notes: 2, private: 1 })
    expect(item?.version).toBe(3)
  })

  it('创建时携带幂等键和规范化后的写入内容', async () => {
    const gateway = new HttpJournalGateway()
    const created = await gateway.create({
      kind: 'moment',
      title: ' 一起散步 ',
      content: ' 风很舒服 ',
      visibility: 'space',
      category: 'home',
    })

    expect(created).toMatchObject({ id: 'journal-created', version: 1 })
    const request = requests[0]
    expect(request?.method).toBe('POST')
    expect(request?.header?.['Idempotency-Key']).toMatch(/^journal_create_/)
    expect(request?.data).toEqual({
      kind: 'moment',
      title: '一起散步',
      content: '风很舒服',
      category: '',
      visibility: 'space',
      imageMediaId: '',
      imageCaption: '',
    })
  })

  it('更新与删除都使用当前版本的 If-Match 和独立幂等键', async () => {
    const gateway = new HttpJournalGateway()
    await gateway.get('journal-1')
    const updated = await gateway.update('journal-1', {
      kind: 'note',
      title: '家里常用信息',
      content: '门禁卡放在鞋柜。',
      visibility: 'space',
      category: 'home',
    }, 3)
    await gateway.remove('journal-1', 4)

    expect(updated.version).toBe(4)
    expect(requests[1]?.header?.['If-Match']).toBe('"3"')
    expect(requests[1]?.header?.['Idempotency-Key']).toMatch(/^journal_update_/)
    expect(requests[2]?.method).toBe('DELETE')
    expect(requests[2]?.header?.['If-Match']).toBe('"4"')
    expect(requests[2]?.header?.['Idempotency-Key']).toMatch(/^journal_delete_/)
  })

  it('私密记录对其他成员按不存在处理', async () => {
    const gateway = new HttpJournalGateway()
    await expect(gateway.get('private-1')).resolves.toBeNull()
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
          message: '生活记录已在别处更新',
          fields: [],
          requestId: 'request-409',
        }, 409)
      },
    })

    const gateway = new HttpJournalGateway()
    await expect(gateway.update('journal-1', {
      kind: 'note',
      title: '家里常用信息',
      content: '',
      visibility: 'space',
      category: 'home',
    }, 2)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  })
})
