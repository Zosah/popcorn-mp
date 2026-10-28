import {
  formatDemoJournalEntry,
  type DemoJournalEntryInput,
  type DemoJournalKind,
  type DemoJournalVisibility,
  type DemoNoteCategory,
} from '../domain/demo-journal'
import { readStoredApiSession } from '../stores/session'
import type {
  ApiJournalItem,
  ApiJournalList,
  ApiJournalSummary,
  ApiJournalWriteRequest,
} from '../types/api'
import { requestApiResponse } from './http'
import {
  JournalGatewayError,
  type JournalGateway,
  type JournalItem,
  type JournalListFilters,
  type JournalSummary,
} from './journal-gateway'
import { TransportError, type TransportResponse } from './transport'

const PAGE_LIMIT = 100
const MAX_PAGE_COUNT = 20

interface JournalContext {
  token: string
  spaceId: string
}

export class HttpJournalGateway implements JournalGateway {
  private readonly etags = new Map<string, string>()

  async list(filters: JournalListFilters = {}): Promise<JournalItem[]> {
    const context = journalContext()
    const items: ApiJournalItem[] = []
    let cursor = ''

    try {
      for (let pageIndex = 0; pageIndex < MAX_PAGE_COUNT; pageIndex += 1) {
        const page = await retryNetwork(() => requestApiResponse<ApiJournalList>(
          journalListPath(context.spaceId, filters, cursor),
          { token: context.token },
        ))
        items.push(...page.data.items)
        if (!page.data.nextCursor) {
          for (const item of items) this.rememberVersion(item)
          return items.map(toJournalItem)
        }
        cursor = page.data.nextCursor
      }
      throw new JournalGatewayError(
        'TOO_MANY_PAGES',
        '生活记录过多，请缩小筛选范围后重试',
      )
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async summary(): Promise<JournalSummary> {
    const context = journalContext()
    try {
      const summary = await retryNetwork(() => requestApiResponse<ApiJournalSummary>(
        `/spaces/${encodeURIComponent(context.spaceId)}/journals/summary`,
        { token: context.token },
      ))
      return { ...summary.data }
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async get(id: string): Promise<JournalItem | null> {
    const context = journalContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiJournalItem>(
        journalItemPath(context.spaceId, id),
        { token: context.token },
      ))
      this.rememberResponseETag(id, response)
      return toJournalItem(response.data)
    } catch (error) {
      if (error instanceof TransportError && error.code === 'NOT_FOUND') return null
      throw toGatewayError(error)
    }
  }

  async create(input: DemoJournalEntryInput): Promise<JournalItem> {
    const context = journalContext()
    const key = createIdempotencyKey('create')
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiJournalItem>(
        `/spaces/${encodeURIComponent(context.spaceId)}/journals`,
        {
          method: 'POST',
          token: context.token,
          body: toApiInput(input),
          headers: { 'Idempotency-Key': key },
        },
      ))
      this.rememberResponseETag(response.data.id, response)
      return toJournalItem(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async update(
    id: string,
    input: DemoJournalEntryInput,
    currentVersion: number,
  ): Promise<JournalItem> {
    const context = journalContext()
    const key = createIdempotencyKey('update')
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiJournalItem>(
        journalItemPath(context.spaceId, id),
        {
          method: 'PUT',
          token: context.token,
          body: toApiInput(input),
          headers: {
            'If-Match': this.ifMatch(id, currentVersion),
            'Idempotency-Key': key,
          },
        },
      ))
      this.rememberResponseETag(id, response)
      return toJournalItem(response.data)
    } catch (error) {
      throw this.writeError(error, id)
    }
  }

  async remove(id: string, currentVersion: number): Promise<void> {
    const context = journalContext()
    const key = createIdempotencyKey('delete')
    try {
      await retryNetwork(() => requestApiResponse<void>(
        journalItemPath(context.spaceId, id),
        {
          method: 'DELETE',
          token: context.token,
          headers: {
            'If-Match': this.ifMatch(id, currentVersion),
            'Idempotency-Key': key,
          },
        },
      ))
      this.etags.delete(id)
    } catch (error) {
      throw this.writeError(error, id)
    }
  }

  private ifMatch(id: string, currentVersion: number): string {
    const cached = this.etags.get(id)
    return cached === `"${currentVersion}"` ? cached : `"${currentVersion}"`
  }

  private rememberVersion(item: ApiJournalItem): void {
    this.etags.set(item.id, `"${item.version}"`)
  }

  private rememberResponseETag(
    fallbackId: string,
    response: TransportResponse<ApiJournalItem>,
  ): void {
    const id = response.data.id || fallbackId
    const etag = response.headers.etag
    this.etags.set(id, etag || `"${response.data.version}"`)
  }

  private writeError(error: unknown, journalId: string): JournalGatewayError {
    if (error instanceof TransportError && error.code === 'VERSION_CONFLICT') {
      this.etags.delete(journalId)
    }
    return toGatewayError(error)
  }
}

function journalContext(): JournalContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new JournalGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new JournalGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
  }
}

function journalListPath(
  spaceId: string,
  filters: JournalListFilters,
  cursor: string,
): string {
  const params: string[] = []
  const add = (name: string, value: string) => {
    params.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
  }
  for (const kind of filters.kinds ?? []) add('kind', kind)
  if (filters.category) add('category', filters.category)
  if (filters.visibility) add('visibility', filters.visibility)
  const query = filters.query?.trim()
  if (query) add('query', query)
  if (cursor) add('cursor', cursor)
  add('limit', String(PAGE_LIMIT))
  return `/spaces/${encodeURIComponent(spaceId)}/journals?${params.join('&')}`
}

function journalItemPath(spaceId: string, entryId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/journals/${encodeURIComponent(entryId)}`
}

function toJournalItem(item: ApiJournalItem): JournalItem {
  const kind = normalizeKind(item.kind)
  const category = kind === 'note' ? normalizeCategory(item.category) : undefined
  const formatted = formatDemoJournalEntry({
    id: item.id,
    kind,
    ...(category ? { category } : {}),
    title: item.title,
    content: item.content,
    visibility: normalizeVisibility(item.visibility),
    kindLabel: '',
    authorName: item.authorName,
    visibilityLabel: '',
    day: '',
    month: '',
    monthLabel: '',
    dateLabel: '',
    timeLabel: '',
    createdAt: item.createdAt,
    ...(wasEdited(item.createdAt, item.updatedAt) ? { updatedAt: item.updatedAt } : {}),
  })
  return {
    ...formatted,
    version: item.version,
    createdBy: item.createdBy,
  }
}

function toApiInput(input: DemoJournalEntryInput): ApiJournalWriteRequest {
  const kind = normalizeKind(input.kind ?? 'moment')
  return {
    kind,
    title: input.title.trim(),
    content: input.content.trim(),
    category: kind === 'note' ? normalizeCategory(input.category) : '',
    visibility: normalizeVisibility(input.visibility),
  }
}

function normalizeKind(value: string): DemoJournalKind {
  return value === 'note' ? 'note' : 'moment'
}

function normalizeVisibility(value: string): DemoJournalVisibility {
  return value === 'private' ? 'private' : 'space'
}

function normalizeCategory(value: string | undefined): DemoNoteCategory {
  switch (value) {
    case 'home':
    case 'health':
    case 'pet':
      return value
    case 'other':
    default:
      return 'other'
  }
}

function wasEdited(createdAt: string, updatedAt: string): boolean {
  const created = Date.parse(createdAt)
  const updated = Date.parse(updatedAt)
  return Number.isFinite(created) && Number.isFinite(updated) && updated - created > 500
}

function createIdempotencyKey(action: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `journal_${action}_${timestamp}_${random}`.slice(0, 64)
}

async function retryNetwork<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    if (!(error instanceof TransportError) || error.code !== 'NETWORK_ERROR') {
      throw error
    }
    return operation()
  }
}

function toGatewayError(error: unknown): JournalGatewayError {
  if (error instanceof JournalGatewayError) return error
  if (error instanceof TransportError) {
    return new JournalGatewayError(error.code, error.message)
  }
  return new JournalGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '生活记录操作没有完成',
  )
}
