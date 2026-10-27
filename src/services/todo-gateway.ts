import type {
  DemoTodoInput,
  DemoTodoItem,
  DemoTodoKind,
} from '../domain/demo-todo'

export type TodoStatus = 'all' | 'pending' | 'completed'

export interface TodoListFilters {
  kinds?: DemoTodoKind[]
  status?: TodoStatus
  query?: string
}

export interface TodoSummary {
  total: number
  pending: number
  completed: number
  pendingByKind: Record<DemoTodoKind, number>
}

/** HTTP 模式下的待办额外带乐观锁版本；Demo 模式也用相同形状兼容页面。 */
export interface TodoItem extends DemoTodoItem {
  version: number
}

export interface TodoGateway {
  list(filters?: TodoListFilters): Promise<TodoItem[]>
  summary(): Promise<TodoSummary>
  get(id: string): Promise<TodoItem | null>
  create(input: DemoTodoInput): Promise<TodoItem>
  update(id: string, input: DemoTodoInput, currentVersion: number): Promise<TodoItem>
  remove(id: string, currentVersion: number): Promise<void>
  setDone(id: string, done: boolean, currentVersion: number): Promise<TodoItem>
  setChecklistDone(
    id: string,
    checklistItemId: string,
    done: boolean,
    currentVersion: number,
  ): Promise<TodoItem>
}

export class TodoGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TodoGatewayError'
  }
}

export function isTodoVersionConflict(error: unknown): boolean {
  return error instanceof TodoGatewayError && error.code === 'VERSION_CONFLICT'
}

export function getTodoErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof TodoGatewayError)) return fallback
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已失效，请重新登录'
    case 'NO_ACTIVE_SPACE':
      return '还没有可用的共同空间'
    case 'VERSION_CONFLICT':
      return '内容已在别处更新，请刷新后再试'
    case 'NETWORK_ERROR':
      return '网络不太稳定，请稍后再试'
    case 'NOT_FOUND':
      return '这条待办已经不存在'
    default:
      return error.message || fallback
  }
}
