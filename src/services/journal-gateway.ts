import type {
  DemoJournalEntry,
  DemoJournalEntryInput,
  DemoJournalKind,
  DemoJournalVisibility,
  DemoNoteCategory,
} from '../domain/demo-journal'

export interface JournalListFilters {
  kinds?: DemoJournalKind[]
  category?: DemoNoteCategory
  visibility?: DemoJournalVisibility
  query?: string
}

/** HTTP 模式额外携带乐观锁版本；Demo 模式保持相同形状供页面复用。 */
export interface JournalItem extends DemoJournalEntry {
  version: number
  createdBy: string
}

export interface JournalSummary {
  total: number
  moments: number
  notes: number
  private: number
}

export interface JournalGateway {
  list(filters?: JournalListFilters): Promise<JournalItem[]>
  summary(): Promise<JournalSummary>
  get(id: string): Promise<JournalItem | null>
  create(input: DemoJournalEntryInput): Promise<JournalItem>
  update(
    id: string,
    input: DemoJournalEntryInput,
    currentVersion: number,
  ): Promise<JournalItem>
  remove(id: string, currentVersion: number): Promise<void>
}

export class JournalGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'JournalGatewayError'
  }
}

export function isJournalVersionConflict(error: unknown): boolean {
  return error instanceof JournalGatewayError && error.code === 'VERSION_CONFLICT'
}

export function isJournalNotFound(error: unknown): boolean {
  return error instanceof JournalGatewayError && error.code === 'NOT_FOUND'
}

export function getJournalErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof JournalGatewayError)) return fallback
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已失效，请重新登录'
    case 'NO_ACTIVE_SPACE':
      return '还没有可用的共同空间'
    case 'VERSION_CONFLICT':
      return '记录已在别处更新，请刷新后再试'
    case 'NETWORK_ERROR':
      return '网络不太稳定，请稍后再试'
    case 'NOT_FOUND':
      return '这条记录已经不存在'
    default:
      return error.message || fallback
  }
}
