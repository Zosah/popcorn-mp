import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import {
  acceptApiInvite,
  createApiSpaceInvite,
  getApiSpace,
  leaveApiSpace,
  listApiSpaceMembers,
  renameApiSpace,
  resolveApiInvite,
} from '../../src/services/space-gateway'
import {
  clearApiSession,
  readStoredApiSession,
  saveApiSession,
} from '../../src/stores/session'
import type {
  ApiInvitePreview,
  ApiSession,
  ApiSpaceDetail,
  ApiSpaceMember,
} from '../../src/types/api'

const originalConfig = { ...appConfig }
const now = '2026-10-27T10:00:00Z'
const space: ApiSpaceDetail = {
  id: 'space-1',
  name: '我们的家',
  type: 'family',
  role: 'owner',
  ownerId: 'user-1',
  timezone: 'Asia/Shanghai',
  createdAt: now,
  updatedAt: now,
}
const session: ApiSession = {
  user: {
    id: 'user-1',
    nickname: '小满',
    avatarTone: 'mint',
    avatarMediaId: 'm_avatar001',
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
const member: ApiSpaceMember = {
  userId: 'user-1',
  nickname: '小满',
  avatarTone: 'mint',
  avatarMediaId: 'm_avatar001',
  role: 'owner',
  joinedAt: now,
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

describe('HTTP 空间网关', () => {
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
        if (url.endsWith('/spaces/space-1/members')) {
          succeed(options, { items: [member] })
          return
        }
        if (url.endsWith('/spaces/space-1/invites') && method === 'POST') {
          succeed(options, {
            code: 'ABCDE23456',
            spaceId: 'space-1',
            expiresAt: '2026-11-03T10:00:00Z',
          }, 201)
          return
        }
        if (url.endsWith('/spaces/space-1/members/me') && method === 'DELETE') {
          succeed(options, '', 204)
          return
        }
        if (url.endsWith('/invites/ABCDE23456') && method === 'GET') {
          succeed(options, {
            status: 'available',
            space: { id: 'space-1', name: '我们的家', type: 'family' },
            inviter: {
              userId: 'user-1',
              nickname: '小满',
              avatarTone: 'mint',
              avatarMediaId: 'm_avatar001',
            },
            expiresAt: '2026-11-03T10:00:00Z',
          } satisfies ApiInvitePreview)
          return
        }
        if (url.endsWith('/invites/ABCDE23456/accept')) {
          succeed(options, { ...space, role: 'member' })
          return
        }
        if (url.endsWith('/spaces/space-1') && method === 'PUT') {
          succeed(options, { ...space, name: '新的家' })
          return
        }
        if (url.endsWith('/spaces/space-1')) {
          succeed(options, space)
          return
        }
        if (url.endsWith('/session')) {
          succeed(options, {
            ...session,
            spaces: [{ ...session.spaces[0], name: '新的家' }],
          })
          return
        }
        options.fail?.({
          errMsg: 'unexpected request',
          errno: 1,
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

  it('读取空间详情与成员列表', async () => {
    const spaceResult = await getApiSpace('space-1')
    const memberResult = await listApiSpaceMembers('space-1')

    expect(spaceResult).toMatchObject({ ok: true, data: { id: 'space-1' } })
    expect(memberResult).toMatchObject({
      ok: true,
      data: [{ role: 'owner', avatarMediaId: 'm_avatar001' }],
    })
    expect(requests[0]?.header?.Authorization).toBe('Bearer token-1')
  })

  it('创建和预览邀请码', async () => {
    const invite = await createApiSpaceInvite('space-1')
    const preview = await resolveApiInvite('ABCDE23456')

    expect(invite).toMatchObject({ ok: true, data: { code: 'ABCDE23456' } })
    expect(preview).toMatchObject({
      ok: true,
      data: {
        space: { name: '我们的家' },
        inviter: { avatarMediaId: 'm_avatar001' },
      },
    })
    expect(requests[1]?.header?.Authorization).toBeUndefined()
  })

  it('重命名后刷新会话缓存', async () => {
    const result = await renameApiSpace('space-1', '新的家')

    expect(result).toMatchObject({ ok: true, data: { name: '新的家' } })
    expect(readStoredApiSession()?.session.spaces[0]?.name).toBe('新的家')
    expect(requests[1]).toMatchObject({
      url: 'https://api.test/session',
      method: 'GET',
    })
  })

  it('接受邀请后刷新会话缓存', async () => {
    const result = await acceptApiInvite('ABCDE23456')

    expect(result).toMatchObject({ ok: true, data: { role: 'member' } })
    expect(readStoredApiSession()?.token).toBe('token-1')
    expect(requests.map((item) => item.url)).toContain('https://api.test/session')
  })

  it('退出共享空间后刷新会话缓存', async () => {
    const result = await leaveApiSpace('space-1')

    expect(result).toEqual({ ok: true })
    expect(requests[0]).toMatchObject({
      url: 'https://api.test/spaces/space-1/members/me',
      method: 'DELETE',
    })
    expect(requests.map((item) => item.url)).toContain('https://api.test/session')
  })
})
