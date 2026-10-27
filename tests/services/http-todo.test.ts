import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import type { ApiSession, ApiTodoItem } from '../../src/types/api'
import { HttpTodoGateway } from '../../src/services/http-todo'
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

const apiTodo: ApiTodoItem = {
  id: 'todo-1',
  spaceId: 'space-1',
  kind: 'travel',
  title: '去大理',
  note: '慢一点',
  done: false,
  dueDate: '2026-11-02',
  destination: '大理',
  checklist: [{
    id: 'check-1',
    text: '身份证',
    done: false,
    sortOrder: 0,
  }],
  exercise: '',
  durationMinutes: 0,
  calories: 0,
  mealType: '',
  amount: '',
  merchant: '',
  version: 3,
  createdBy: 'user-1',
  deletedAt: null,
  createdAt: now,
  updatedAt: now,
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

describe('HTTP 待办网关', () => {
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
        if (url.includes('/todos/summary')) {
          succeed(options, {
            total: 4,
            pending: 3,
            completed: 1,
            pendingByKind: {
              travel: 1,
              plan: 1,
              fitness: 0,
              meal: 1,
              expense: 0,
            },
          })
          return
        }
        if (url.includes('/todos?') && method === 'GET') {
          succeed(options, url.includes('cursor=next')
            ? { items: [], nextCursor: '' }
            : { items: [apiTodo], nextCursor: 'next' })
          return
        }
        if (url.endsWith('/todos/todo-1') && method === 'GET') {
          succeed(options, apiTodo, 200, { etag: '"3"' })
          return
        }
        if (url.endsWith('/todos') && method === 'POST') {
          succeed(options, {
            ...apiTodo,
            id: 'todo-created',
            kind: 'expense',
            title: '晚餐',
            amount: '88.50',
            mealType: '',
            version: 1,
          }, 201, { etag: '"1"' })
          return
        }
        if (url.endsWith('/todos/todo-1') && method === 'PUT') {
          succeed(options, { ...apiTodo, version: 4 }, 200, { etag: '"4"' })
          return
        }
        if (url.endsWith('/todos/todo-1') && method === 'DELETE') {
          succeed(options, undefined, 204)
          return
        }
        if (url.endsWith('/todos/todo-1/complete') || url.endsWith('/todos/todo-1/reopen')) {
          succeed(options, { ...apiTodo, done: method === 'POST' }, 200, { etag: '"4"' })
          return
        }
        if (url.endsWith('/checklist-items/check-1/complete') ||
          url.endsWith('/checklist-items/check-1/reopen')) {
          succeed(options, {
            ...apiTodo,
            version: 4,
            checklist: [{ id: 'check-1', text: '身份证', done: true, sortOrder: 0 }],
          }, 200, { etag: '"4"' })
          return
        }
        if (url.endsWith('/todos/missing')) {
          succeed(options, {
            code: 'NOT_FOUND',
            message: '待办不存在',
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

  it('自动翻页并携带鉴权、类型筛选和稳定上限', async () => {
    const gateway = new HttpTodoGateway()
    const items = await gateway.list({ kinds: ['travel', 'meal'], status: 'pending' })

    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      id: 'todo-1',
      version: 3,
      destination: '大理',
    })
    expect(requests).toHaveLength(2)
    const first = new URL(String(requests[0]?.url))
    expect(first.pathname).toBe('/spaces/space-1/todos')
    expect(first.searchParams.getAll('kind')).toEqual(['travel', 'meal'])
    expect(first.searchParams.get('status')).toBe('pending')
    expect(first.searchParams.get('limit')).toBe('100')
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
  })

  it('创建账单时映射金额，并携带幂等键', async () => {
    const gateway = new HttpTodoGateway()
    const created = await gateway.create({
      kind: 'expense',
      title: '晚餐',
      amount: 88.5,
      merchant: '小店',
    })

    expect(created).toMatchObject({ id: 'todo-created', amount: 88.5, version: 1 })
    const request = requests[0]
    expect(request?.method).toBe('POST')
    expect(request?.header?.['Idempotency-Key']).toMatch(/^todo_create_/)
    expect(request?.data).toMatchObject({
      kind: 'expense',
      title: '晚餐',
      amount: '88.50',
      merchant: '小店',
    })
  })

  it('读取详情后使用服务端 ETag 更新，并返回新版本', async () => {
    const gateway = new HttpTodoGateway()
    const current = await gateway.get('todo-1')
    expect(current?.version).toBe(3)

    const updated = await gateway.update('todo-1', {
      kind: 'travel',
      title: '去大理',
      dueDate: '2026-11-02',
      destination: '大理',
      checklist: [{ id: 'check-1', text: '身份证', done: true }],
    }, 3)

    expect(updated.version).toBe(4)
    expect(requests[1]?.header?.['If-Match']).toBe('"3"')
    expect(requests[1]?.header?.['Idempotency-Key']).toMatch(/^todo_update_/)
  })

  it('完成、重开、勾选准备项和删除都使用当前版本', async () => {
    const gateway = new HttpTodoGateway()
    await gateway.setDone('todo-1', true, 3)
    await gateway.setDone('todo-1', false, 4)
    await gateway.setChecklistDone('todo-1', 'check-1', true, 4)
    await gateway.remove('todo-1', 4)

    expect(requests.map((request) => String(request.method))).toEqual([
      'POST',
      'POST',
      'POST',
      'DELETE',
    ])
    expect(requests.map((request) => request.header?.['If-Match'])).toEqual([
      '"3"',
      '"4"',
      '"4"',
      '"4"',
    ])
    expect(requests.map((request) => String(request.url))).toEqual([
      'https://api.test/spaces/space-1/todos/todo-1/complete',
      'https://api.test/spaces/space-1/todos/todo-1/reopen',
      'https://api.test/spaces/space-1/todos/todo-1/checklist-items/check-1/complete',
      'https://api.test/spaces/space-1/todos/todo-1',
    ])
  })

  it('把冲突转换成页面可识别的版本冲突错误', async () => {
    const gateway = new HttpTodoGateway()
    // 用一个临时网关模拟服务端已返回 409。
    Object.assign(gateway, {
      etags: new Map([['todo-1', '"2"']]),
    })
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

    await expect(gateway.update('todo-1', { kind: 'plan', title: '计划' }, 2))
      .rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  })
})
