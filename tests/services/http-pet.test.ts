import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import { HttpPetGateway } from '../../src/services/http-pet'
import { PetGatewayError } from '../../src/services/pet-gateway'
import { clearApiSession, saveApiSession } from '../../src/stores/session'
import type {
  ApiMediaAsset,
  ApiPet,
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

const apiPet: ApiPet = {
  id: 'e_1234567890',
  spaceId: 's_1234567890',
  name: '糯米',
  species: 'cat',
  breed: '英短',
  sex: 'female',
  birthday: '2024-03-01',
  homeOn: '2024-05-01',
  neuteredOn: '2025-03-01',
  status: '精神不错',
  avatarMediaId: 'm_petavatar01',
  version: 3,
  createdBy: 'u_1234567890',
  deletedAt: null,
  createdAt,
  updatedAt,
  events: [{
    id: 'n_1234567890',
    petId: 'e_1234567890',
    type: 'vaccine',
    occurredOn: '2026-10-01',
    title: '年度疫苗',
    note: '状态稳定',
    provider: '社区宠物医院',
    cost: '180',
    nextOn: '2027-10-01',
    recurrenceDays: 365,
    version: 2,
    createdBy: 'u_1234567890',
    deletedAt: null,
    createdAt,
    updatedAt,
  }],
  weights: [{
    id: 'w_1234567890',
    petId: 'e_1234567890',
    value: '3.8',
    recordedOn: '2026-10-30',
    createdBy: 'u_1234567890',
    createdAt,
  }],
  dailyLogs: [{
    id: 'd_1234567890',
    petId: 'e_1234567890',
    type: 'meal',
    summary: '早餐吃了 42g',
    note: '',
    recordedAt: '2026-10-30T00:00:00Z',
    createdBy: 'u_1234567890',
    createdAt,
  }],
  supplies: [{
    id: 'q_1234567890',
    petId: 'e_1234567890',
    category: 'kibble',
    name: '鸡肉冻干粮',
    status: 'current',
    note: '',
    recordedOn: '2026-10-30',
    version: 4,
    createdBy: 'u_1234567890',
    deletedAt: null,
    createdAt,
    updatedAt,
  }],
}

const mediaAsset: ApiMediaAsset = {
  id: 'm_petavatar01',
  spaceId: 's_1234567890',
  purpose: 'avatar',
  width: 800,
  height: 800,
  createdAt,
  display: {
    url: 'https://cos.test/pet-display.jpg',
    expiresAt: '2099-12-31T23:59:59.000Z',
  },
  thumb: {
    url: 'https://cos.test/pet-thumb.jpg',
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

describe('HTTP 宠物网关', () => {
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
        if (url.includes('/media/m_petavatar01') && method === 'GET') {
          succeed(options, mediaAsset)
          return
        }
        if (url.endsWith('/spaces/s_1234567890/pets') && method === 'GET') {
          succeed(options, { items: [apiPet] })
          return
        }
        if (url.endsWith('/spaces/s_1234567890/pets') && method === 'POST') {
          succeed(options, {
            ...apiPet,
            id: 'e_created001',
            name: '团子',
            avatarMediaId: '',
            version: 1,
          }, 201)
          return
        }
        if (url.endsWith('/pets/e_1234567890') && method === 'PUT') {
          const body = options.data && typeof options.data === 'object'
            ? options.data as Partial<ApiPet>
            : {}
          succeed(options, { ...apiPet, ...body, version: 4 }, 200, { etag: '"4"' })
          return
        }
        if (url.endsWith('/pets/e_1234567890') && method === 'DELETE') {
          succeed(options, undefined, 204)
          return
        }
        if (url.endsWith('/pets/e_1234567890/events') && method === 'POST') {
          succeed(options, {
            ...apiPet,
            events: [{
              ...apiPet.events[0],
              id: 'n_created0001',
              type: 'external-deworm',
              occurredOn: '2026-10-31',
              title: '完成体外驱虫',
              nextOn: '2026-11-30',
              recurrenceDays: 30,
              version: 1,
            }],
          }, 201)
          return
        }
        if (url.endsWith('/events/n_1234567890') && method === 'PUT') {
          succeed(options, {
            ...apiPet,
            events: [{
              ...apiPet.events[0],
              title: '年度疫苗加强',
              nextOn: '2027-10-15',
              recurrenceDays: 379,
              version: 3,
            }],
          }, 200, { etag: '"3"' })
          return
        }
        if (url.endsWith('/events/n_1234567890') && method === 'DELETE') {
          succeed(options, {
            ...apiPet,
            version: 4,
            events: [],
          })
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

  it('读取空间宠物列表，映射版本并通过私有媒体换取缩略图', async () => {
    const gateway = new HttpPetGateway()
    const collection = await gateway.list()

    expect(collection.activePetId).toBe(apiPet.id)
    expect(collection.pets[0]).toMatchObject({
      profile: {
        id: apiPet.id,
        version: 3,
        avatarMediaId: 'm_petavatar01',
        avatarUrl: 'https://cos.test/pet-thumb.jpg',
      },
      events: [{
        id: 'n_1234567890',
        version: 2,
        nextOn: '2027-10-01',
        recurrenceDays: 365,
      }],
      supplies: [{ id: 'q_1234567890', version: 4 }],
    })
    const listRequest = requests.find((item) =>
      String(item.url).endsWith('/spaces/s_1234567890/pets'),
    )
    expect(listRequest?.header?.Authorization).toBe('Bearer token-1')
  })

  it('创建宠物时携带幂等键，并切换当前宠物', async () => {
    const gateway = new HttpPetGateway()
    const created = await gateway.createPet({
      name: ' 团子 ',
      species: 'other',
    })

    expect(created.profile).toMatchObject({ id: 'e_created001', name: '团子' })
    expect(storage.get('popcorn_active_pet_id')).toBe('e_created001')
    const request = requests.find((item) => item.method === 'POST')
    expect(request?.header?.['Idempotency-Key']).toMatch(/^pet_create_/)
    expect(request?.data).toMatchObject({ name: '团子', species: 'other' })
  })

  it('完整档案更新携带 If-Match 与幂等键', async () => {
    const gateway = new HttpPetGateway()
    const updated = await gateway.updateProfile(apiPet.id, {
      name: '糯米团',
      species: 'cat',
      breed: '英短',
      sex: 'female',
      birthday: '2024-03-01',
      homeOn: '2024-05-01',
      neuteredOn: '2025-03-01',
      status: '精神不错',
      avatarMediaId: 'm_petavatar01',
    }, 3)

    expect(updated.profile.version).toBe(4)
    const request = requests.find((item) => item.method === 'PUT')
    expect(request?.header?.['If-Match']).toBe('"3"')
    expect(request?.header?.['Idempotency-Key']).toMatch(/^pet_profile_/)
    expect(request?.data).toMatchObject({ name: '糯米团', avatarMediaId: 'm_petavatar01' })
  })

  it('移除宠物头像时显式提交空媒体 ID', async () => {
    const gateway = new HttpPetGateway()
    const updated = await gateway.updateProfile(apiPet.id, {
      name: apiPet.name,
      species: 'cat',
      breed: apiPet.breed,
      sex: 'female',
      birthday: apiPet.birthday,
      homeOn: apiPet.homeOn,
      neuteredOn: apiPet.neuteredOn,
      status: apiPet.status,
      avatarMediaId: '',
    }, 3)

    expect(updated.profile.avatarMediaId).toBe('')
    expect(updated.profile.avatarUrl).toBe('')
    const request = requests.find((item) => item.method === 'PUT')
    expect(request?.header?.['If-Match']).toBe('"3"')
    expect(request?.data).toMatchObject({ avatarMediaId: '' })
  })

  it('创建和修改周期照护事件时提交 recurrenceDays', async () => {
    const gateway = new HttpPetGateway()
    const created = await gateway.createEvent(apiPet.id, {
      type: 'external-deworm',
      occurredOn: '2026-10-31',
      title: '完成体外驱虫',
      note: '',
      nextOn: null,
      recurrenceDays: 30,
    })
    expect(created.events[0]).toMatchObject({
      type: 'external-deworm',
      nextOn: '2026-11-30',
      recurrenceDays: 30,
    })
    const createRequest = requests.find(
      (item) => item.method === 'POST' && String(item.url).endsWith('/events'),
    )
    expect(createRequest?.data).toMatchObject({
      type: 'external-deworm',
      nextOn: null,
      recurrenceDays: 30,
    })
    expect(createRequest?.header?.['Idempotency-Key']).toMatch(/^pet_event-create_/)

    const updated = await gateway.updateEvent(apiPet.id, 'n_1234567890', {
      type: 'vaccine',
      occurredOn: '2026-10-01',
      title: '年度疫苗加强',
      note: '',
      nextOn: null,
      recurrenceDays: 379,
    }, 2)
    expect(updated.events[0]).toMatchObject({
      title: '年度疫苗加强',
      nextOn: '2027-10-15',
      recurrenceDays: 379,
    })
    const updateRequest = requests.find((item) => item.method === 'PUT')
    expect(updateRequest?.header?.['If-Match']).toBe('"2"')
    expect(updateRequest?.data).toMatchObject({ recurrenceDays: 379 })
  })

  it('删除事件使用事件自身版本', async () => {
    const gateway = new HttpPetGateway()
    await gateway.removeEvent(apiPet.id, 'n_1234567890', 2)

    const request = requests.find((item) => item.method === 'DELETE')
    expect(request?.header?.['If-Match']).toBe('"2"')
    expect(request?.header?.['Idempotency-Key']).toMatch(/^pet_event-delete_/)
  })

  it('删除宠物档案使用档案版本并清理活动缓存', async () => {
    storage.set('popcorn_active_pet_id', apiPet.id)
    const gateway = new HttpPetGateway()
    await gateway.remove(apiPet.id, apiPet.version)

    const request = requests.find(
      (item) => item.method === 'DELETE'
        && String(item.url).endsWith('/pets/e_1234567890'),
    )
    expect(request?.header?.['If-Match']).toBe('"3"')
    expect(request?.header?.['Idempotency-Key']).toMatch(/^pet_pet-delete_/)
    expect(storage.has('popcorn_active_pet_id')).toBe(false)
  })

  it('网络失败自动重试一次', async () => {
    vi.unstubAllGlobals()
    let attempts = 0
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        attempts += 1
        if (attempts === 1) {
          fail(options)
          return
        }
        succeed(options, { items: [{ ...apiPet, avatarMediaId: '' }] })
      },
    })

    const collection = await new HttpPetGateway().list()
    expect(attempts).toBe(2)
    expect(collection.pets[0]?.profile.avatarUrl).toBe('')
  })

  it('版本冲突转换为可识别的业务错误', async () => {
    vi.unstubAllGlobals()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
      request: (options: WechatMiniprogram.RequestOption) => {
        succeed(options, {
          code: 'VERSION_CONFLICT',
          message: '版本冲突',
          fields: [],
          requestId: 'request-conflict',
        }, 409)
      },
    })

    const promise = new HttpPetGateway().updateProfile(apiPet.id, {
      name: apiPet.name,
      species: 'cat',
      breed: apiPet.breed,
      sex: 'female',
      birthday: apiPet.birthday,
      homeOn: apiPet.homeOn,
      neuteredOn: apiPet.neuteredOn,
      status: apiPet.status,
      avatarMediaId: apiPet.avatarMediaId,
    }, 2)

    await expect(promise).rejects.toMatchObject({
      name: PetGatewayError.name,
      code: 'VERSION_CONFLICT',
    } satisfies Partial<PetGatewayError>)
  })
})
