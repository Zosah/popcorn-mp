import type {
  DemoMealType,
  DemoTodoChecklistItem,
  DemoTodoInput,
  DemoTodoItem,
  DemoTodoKind,
} from '../domain/demo-todo'
import { readStoredApiSession } from '../stores/session'
import type {
  ApiMealType,
  ApiTodoItem,
  ApiTodoKind,
  ApiTodoList,
  ApiTodoSummary,
  ApiTodoWriteRequest,
} from '../types/api'
import { requestApiResponse } from './http'
import {
  TodoGatewayError,
  type TodoGateway,
  type TodoItem,
  type TodoListFilters,
  type TodoSummary,
} from './todo-gateway'
import { TransportError, type TransportResponse } from './transport'

const PAGE_LIMIT = 100
const MAX_PAGE_COUNT = 20
const TODO_KINDS = new Set<DemoTodoKind>([
  'travel',
  'plan',
  'fitness',
  'meal',
  'expense',
])
const MEAL_TYPES = new Set<DemoMealType>([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
])

interface TodoContext {
  token: string
  spaceId: string
}

export class HttpTodoGateway implements TodoGateway {
  private readonly etags = new Map<string, string>()

  async list(filters: TodoListFilters = {}): Promise<TodoItem[]> {
    const context = todoContext()
    const items: ApiTodoItem[] = []
    let cursor = ''

    try {
      for (let pageIndex = 0; pageIndex < MAX_PAGE_COUNT; pageIndex += 1) {
        const page = await retryNetwork(() => requestApiResponse<ApiTodoList>(
          todoListPath(context.spaceId, filters, cursor),
          { token: context.token },
        ))
        items.push(...page.data.items)
        if (!page.data.nextCursor) {
          for (const item of items) this.rememberVersion(item)
          return items.map(toTodoItem)
        }
        cursor = page.data.nextCursor
      }
      throw new TodoGatewayError(
        'TOO_MANY_PAGES',
        '待办记录过多，请缩小筛选范围后重试',
      )
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async summary(): Promise<TodoSummary> {
    const context = todoContext()
    try {
      const summary = await retryNetwork(() => requestApiResponse<ApiTodoSummary>(
        `/spaces/${encodeURIComponent(context.spaceId)}/todos/summary`,
        { token: context.token },
      ))
      return {
        total: summary.data.total,
        pending: summary.data.pending,
        completed: summary.data.completed,
        pendingByKind: { ...summary.data.pendingByKind },
      }
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async get(id: string): Promise<TodoItem | null> {
    const context = todoContext()
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiTodoItem>(
        todoItemPath(context.spaceId, id),
        { token: context.token },
      ))
      this.rememberResponseETag(id, response)
      return toTodoItem(response.data)
    } catch (error) {
      if (error instanceof TransportError && error.code === 'NOT_FOUND') return null
      throw toGatewayError(error)
    }
  }

  async create(input: DemoTodoInput): Promise<TodoItem> {
    const context = todoContext()
    const key = createIdempotencyKey('create')
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiTodoItem>(
        `/spaces/${encodeURIComponent(context.spaceId)}/todos`,
        {
          method: 'POST',
          token: context.token,
          body: toApiInput(input),
          headers: { 'Idempotency-Key': key },
        },
      ))
      this.rememberResponseETag(response.data.id, response)
      return toTodoItem(response.data)
    } catch (error) {
      throw toGatewayError(error)
    }
  }

  async update(
    id: string,
    input: DemoTodoInput,
    currentVersion: number,
  ): Promise<TodoItem> {
    const context = todoContext()
    const key = createIdempotencyKey('update')
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiTodoItem>(
        todoItemPath(context.spaceId, id),
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
      return toTodoItem(response.data)
    } catch (error) {
      throw this.writeError(error, id)
    }
  }

  async remove(id: string, currentVersion: number): Promise<void> {
    const context = todoContext()
    const key = createIdempotencyKey('delete')
    try {
      await retryNetwork(() => requestApiResponse<void>(
        todoItemPath(context.spaceId, id),
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

  async setDone(
    id: string,
    done: boolean,
    currentVersion: number,
  ): Promise<TodoItem> {
    const context = todoContext()
    const action = done ? 'complete' : 'reopen'
    const key = createIdempotencyKey(action)
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiTodoItem>(
        `${todoItemPath(context.spaceId, id)}/${action}`,
        {
          method: 'POST',
          token: context.token,
          headers: {
            'If-Match': this.ifMatch(id, currentVersion),
            'Idempotency-Key': key,
          },
        },
      ))
      this.rememberResponseETag(id, response)
      return toTodoItem(response.data)
    } catch (error) {
      throw this.writeError(error, id)
    }
  }

  async setChecklistDone(
    id: string,
    checklistItemId: string,
    done: boolean,
    currentVersion: number,
  ): Promise<TodoItem> {
    const context = todoContext()
    const action = done ? 'complete' : 'reopen'
    const key = createIdempotencyKey(`checklist-${action}`)
    try {
      const response = await retryNetwork(() => requestApiResponse<ApiTodoItem>(
        `${todoItemPath(context.spaceId, id)}/checklist-items/${encodeURIComponent(checklistItemId)}/${action}`,
        {
          method: 'POST',
          token: context.token,
          headers: {
            'If-Match': this.ifMatch(id, currentVersion),
            'Idempotency-Key': key,
          },
        },
      ))
      this.rememberResponseETag(id, response)
      return toTodoItem(response.data)
    } catch (error) {
      throw this.writeError(error, id)
    }
  }

  private ifMatch(id: string, currentVersion: number): string {
    const cached = this.etags.get(id)
    return cached === `"${currentVersion}"` ? cached : `"${currentVersion}"`
  }

  private rememberVersion(item: ApiTodoItem): void {
    this.etags.set(item.id, `"${item.version}"`)
  }

  private rememberResponseETag(
    fallbackId: string,
    response: TransportResponse<ApiTodoItem>,
  ): void {
    const id = response.data.id || fallbackId
    const etag = response.headers.etag
    this.etags.set(id, etag || `"${response.data.version}"`)
  }

  private writeError(error: unknown, todoId: string): TodoGatewayError {
    if (error instanceof TransportError && error.code === 'VERSION_CONFLICT') {
      this.etags.delete(todoId)
    }
    return toGatewayError(error)
  }
}

function todoContext(): TodoContext {
  const stored = readStoredApiSession()
  if (!stored?.token) {
    throw new TodoGatewayError('UNAUTHENTICATED', '请先登录')
  }
  if (!stored.session.activeSpaceId) {
    throw new TodoGatewayError('NO_ACTIVE_SPACE', '还没有可用的共同空间')
  }
  return {
    token: stored.token,
    spaceId: stored.session.activeSpaceId,
  }
}

function todoListPath(
  spaceId: string,
  filters: TodoListFilters,
  cursor: string,
): string {
  const params: string[] = []
  const add = (name: string, value: string) => {
    params.push(`${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
  }
  for (const kind of filters.kinds ?? []) add('kind', kind)
  if (filters.status && filters.status !== 'all') add('status', filters.status)
  const query = filters.query?.trim()
  if (query) add('query', query)
  if (cursor) add('cursor', cursor)
  add('limit', String(PAGE_LIMIT))
  return `/spaces/${encodeURIComponent(spaceId)}/todos?${params.join('&')}`
}

function todoItemPath(spaceId: string, todoId: string): string {
  return `/spaces/${encodeURIComponent(spaceId)}/todos/${encodeURIComponent(todoId)}`
}

function toTodoItem(item: ApiTodoItem): TodoItem {
  return {
    id: item.id,
    kind: normalizeKind(item.kind),
    title: item.title,
    note: item.note,
    done: item.done,
    dueDate: item.dueDate ?? '',
    destination: item.destination,
    checklist: item.checklist.map((entry): DemoTodoChecklistItem => ({
      id: entry.id,
      text: entry.text,
      done: entry.done,
    })),
    exercise: item.exercise,
    durationMinutes: item.durationMinutes,
    calories: item.calories,
    mealType: normalizeMealType(item.mealType),
    amount: parseAmount(item.amount),
    merchant: item.merchant,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    version: item.version,
  }
}

function toApiInput(input: DemoTodoInput): ApiTodoWriteRequest {
  const request: ApiTodoWriteRequest = {
    kind: input.kind,
    title: input.title.trim(),
    note: input.note?.trim() ?? '',
    dueDate: input.dueDate?.trim() || null,
  }

  switch (input.kind) {
    case 'travel':
      request.destination = input.destination?.trim() ?? ''
      request.checklist = (input.checklist ?? []).map((item) => ({
        ...(item.id ? { id: item.id } : {}),
        text: item.text.trim(),
        done: item.done === true,
      }))
      break
    case 'fitness':
      request.exercise = input.exercise?.trim() ?? ''
      request.durationMinutes = normalizeNonNegativeInteger(input.durationMinutes)
      request.calories = normalizeNonNegativeInteger(input.calories)
      break
    case 'meal':
      request.mealType = normalizeApiMealType(input.mealType)
      break
    case 'expense':
      request.amount = formatAmount(input.amount)
      request.merchant = input.merchant?.trim() ?? ''
      break
    case 'plan':
      break
  }
  return request
}

function normalizeKind(value: string): DemoTodoKind {
  return TODO_KINDS.has(value as DemoTodoKind) ? (value as DemoTodoKind) : 'plan'
}

function normalizeMealType(value: string): DemoMealType | '' {
  return MEAL_TYPES.has(value as DemoMealType) ? (value as DemoMealType) : ''
}

function normalizeApiMealType(value: DemoMealType | '' | undefined): ApiMealType {
  return MEAL_TYPES.has(value as DemoMealType) ? (value as ApiMealType) : 'dinner'
}

function normalizeNonNegativeInteger(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0
}

function parseAmount(value: string): number {
  const amount = Number(value)
  return Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) / 100 : 0
}

function formatAmount(value: number | undefined): string {
  const amount = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return Math.max(0, amount).toFixed(2)
}

function createIdempotencyKey(action: string): string {
  const timestamp = Date.now().toString(36)
  const random = Math.random().toString(36).slice(2, 12)
  return `todo_${action}_${timestamp}_${random}`.slice(0, 64)
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

function toGatewayError(error: unknown): TodoGatewayError {
  if (error instanceof TodoGatewayError) return error
  if (error instanceof TransportError) {
    return new TodoGatewayError(error.code, error.message)
  }
  return new TodoGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '待办操作没有完成',
  )
}
