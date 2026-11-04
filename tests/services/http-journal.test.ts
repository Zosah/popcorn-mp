import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { appConfig } from '../../src/config/env'
import { HttpJournalGateway } from '../../src/services/http-journal'
import { mediaGateway } from '../../src/services/media'
import { MediaGatewayError } from '../../src/services/media-gateway'
import { clearApiSession, saveApiSession } from '../../src/stores/session'
import type { ApiJournalItem, ApiMediaAsset, ApiSession } from '../../src/types/api'

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
  images: [],
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
          const query = new URL(url).searchParams.get('query')
          const avatarItem = query === '头像'
            ? [{ ...apiJournal, id: 'journal-author', authorAvatarMediaId: 'm_avatar0001' }]
            : query === '图片'
              ? [{
                  ...apiJournal,
                  id: 'journal-list-images',
                  images: [
                    { mediaId: 'media-2', caption: '', sortOrder: 1 },
                    { mediaId: 'media-1', caption: '', sortOrder: 0 },
                  ],
                }]
              : [apiJournal]
          succeed(options, url.includes('cursor=next')
            ? { items: [], nextCursor: '' }
            : { items: avatarItem, nextCursor: 'next' })
          return
        }
        if (url.endsWith('/journals/journal-author') && method === 'GET') {
          succeed(options, {
            ...apiJournal,
            id: 'journal-author',
            authorAvatarMediaId: 'm_avatar0001',
          }, 200, { etag: '"3"' })
          return
        }
        if (url.endsWith('/journals/journal-avatar-broken') && method === 'GET') {
          succeed(options, {
            ...apiJournal,
            id: 'journal-avatar-broken',
            authorAvatarMediaId: 'm_missing0001',
          }, 200, { etag: '"3"' })
          return
        }
        if (url.endsWith('/journals/journal-1') && method === 'GET') {
          succeed(options, apiJournal, 200, { etag: '"3"' })
          return
        }
        if (url.endsWith('/journals/journal-images') && method === 'GET') {
          succeed(options, {
            ...apiJournal,
            id: 'journal-images',
            images: [
              { mediaId: 'media-2', caption: '第二张', sortOrder: 1 },
              { mediaId: 'media-1', caption: '第一张', sortOrder: 0 },
            ],
          }, 200, { etag: '"3"' })
          return
        }
        if (url.endsWith('/journals/journal-legacy') && method === 'GET') {
          succeed(options, {
            ...apiJournal,
            id: 'journal-legacy',
            imageMediaId: 'media-legacy',
            imageCaption: '旧版单图',
          }, 200, { etag: '"3"' })
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
    vi.restoreAllMocks()
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
      images: [],
    })
  })

  it('创建时按顺序提交最多十五张图片，并兼容第一张旧字段', async () => {
    const gateway = new HttpJournalGateway()
    const images = Array.from({ length: 15 }, (_, index) => ({
      mediaId: `media-${index + 1}`,
      src: `https://cdn.test/${index + 1}.jpg`,
      caption: index === 0 ? '封面说明' : '',
    }))

    await gateway.create({
      kind: 'moment',
      title: '十五张照片',
      content: '把这一天完整留下',
      visibility: 'space',
      images,
    })

    expect(requests[0]?.data).toMatchObject({
      imageMediaId: 'media-1',
      imageCaption: '封面说明',
      images: images.map((image, index) => ({
        mediaId: image.mediaId,
        caption: image.caption,
        sortOrder: index,
      })),
    })
  })

  it('读取多图时按 sortOrder 排序并签名，旧单图字段仍可回退', async () => {
    const getMedia = vi.spyOn(mediaGateway, 'get').mockImplementation(async (mediaId): Promise<ApiMediaAsset> => ({
      id: mediaId,
      spaceId: 'space-1',
      purpose: 'journal',
      width: 1200,
      height: 1200,
      createdAt,
      display: { url: `https://cdn.test/${mediaId}-display.jpg`, expiresAt: updatedAt },
      thumb: { url: `https://cdn.test/${mediaId}-thumb.jpg`, expiresAt: updatedAt },
    }))
    const gateway = new HttpJournalGateway()

    const multi = await gateway.get('journal-images')
    const legacy = await gateway.get('journal-legacy')
    const listed = await gateway.list({ query: '图片' })

    expect(multi?.images?.map((image) => image.mediaId)).toEqual(['media-1', 'media-2'])
    expect(multi?.images?.map((image) => image.src)).toEqual([
      'https://cdn.test/media-1-display.jpg',
      'https://cdn.test/media-2-display.jpg',
    ])
    expect(multi?.image?.caption).toBe('第一张')
    // 列表保留缩略图供网格使用，同时保留展示图供点击预览，避免清晰度回退。
    expect(listed[0]?.images?.map((image) => image.mediaId)).toEqual(['media-1', 'media-2'])
    expect(listed[0]?.images?.[0]).toMatchObject({
      src: 'https://cdn.test/media-1-display.jpg',
      thumbSrc: 'https://cdn.test/media-1-thumb.jpg',
    })
    expect(legacy?.image).toMatchObject({
      mediaId: 'media-legacy',
      src: 'https://cdn.test/media-legacy-display.jpg',
      caption: '旧版单图',
    })
    expect(getMedia).toHaveBeenCalledTimes(5)
  })

  it('作者头像使用缩略图签名地址，无头像或签名失败时保留昵称首字', async () => {
    const getMedia = vi.spyOn(mediaGateway, 'get').mockImplementation(
      async (mediaId): Promise<ApiMediaAsset> => {
        if (mediaId === 'm_avatar0001') {
          return {
            id: mediaId,
            spaceId: 'space-1',
            purpose: 'user_avatar',
            width: 200,
            height: 200,
            createdAt,
            display: { url: 'https://cdn.test/avatar-display.jpg', expiresAt: updatedAt },
            thumb: { url: 'https://cdn.test/avatar-thumb.jpg', expiresAt: updatedAt },
          }
        }
        throw new MediaGatewayError('MEDIA_NOT_FOUND', '图片不存在')
      },
    )
    const gateway = new HttpJournalGateway()

    const list = await gateway.list({ query: '头像' })
    const detail = await gateway.get('journal-author')
    const broken = await gateway.get('journal-avatar-broken')
    const plain = await gateway.get('journal-1')

    expect(list[0]?.authorAvatarUrl).toBe('https://cdn.test/avatar-thumb.jpg')
    expect(list[0]?.authorInitial).toBe('小')
    expect(detail?.authorAvatarUrl).toBe('https://cdn.test/avatar-thumb.jpg')
    expect(broken?.authorAvatarUrl).toBeUndefined()
    expect(broken?.authorInitial).toBe('小')
    expect(plain?.authorInitial).toBe('小')
    expect(getMedia).toHaveBeenCalled()
  })

  it('图片签名失败时清空地址，页面回退 system-image 占位', async () => {
    vi.spyOn(mediaGateway, 'get').mockRejectedValue(
      new MediaGatewayError('MEDIA_NOT_FOUND', '图片不存在'),
    )
    const gateway = new HttpJournalGateway()

    const item = await gateway.get('journal-images')

    expect(item?.images).toHaveLength(2)
    expect(item?.images?.[0]).toMatchObject({ mediaId: 'media-1', src: '' })
    expect(item?.images?.[0]?.thumbSrc).toBeUndefined()
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
