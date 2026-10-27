import type { DemoTodoInput, DemoTodoKind } from '../domain/demo-todo'
import {
  addDemoTodoItem,
  getDemoTodoItem,
  listDemoTodoItems,
  removeDemoTodoItem,
  toggleDemoTodoChecklistItem,
  toggleDemoTodoItem,
  updateDemoTodoItem,
} from './demo-todo'
import {
  TodoGatewayError,
  type TodoGateway,
  type TodoListFilters,
  type TodoItem,
  type TodoSummary,
} from './todo-gateway'

export class DemoTodoGateway implements TodoGateway {
  private readonly versions = new Map<string, number>()

  async list(filters: TodoListFilters = {}): Promise<TodoItem[]> {
    const query = filters.query?.trim().toLocaleLowerCase() ?? ''
    const kinds = new Set(filters.kinds ?? [])
    return listDemoTodoItems()
      .filter((item) => !kinds.size || kinds.has(item.kind))
      .filter((item) => {
        if (filters.status === 'pending') return !item.done
        if (filters.status === 'completed') return item.done
        return true
      })
      .filter((item) => !query || item.title.toLocaleLowerCase().includes(query))
      .map((item) => this.withVersion(item))
  }

  async summary(): Promise<TodoSummary> {
    return summarize(listDemoTodoItems())
  }

  async get(id: string): Promise<TodoItem | null> {
    const item = getDemoTodoItem(id)
    return item ? this.withVersion(item) : null
  }

  async create(input: DemoTodoInput): Promise<TodoItem> {
    const created = addDemoTodoItem(input)
    this.versions.set(created.id, 1)
    return this.withVersion(created)
  }

  async update(
    id: string,
    input: DemoTodoInput,
    _currentVersion: number,
  ): Promise<TodoItem> {
    try {
      const updated = updateDemoTodoItem(id, input)
      this.bumpVersion(id)
      return this.withVersion(updated)
    } catch (error) {
      throw demoError(error)
    }
  }

  async remove(id: string, _currentVersion: number): Promise<void> {
    if (!removeDemoTodoItem(id)) {
      throw new TodoGatewayError('NOT_FOUND', '这条待办已经不存在')
    }
    this.versions.delete(id)
  }

  async setDone(
    id: string,
    done: boolean,
    _currentVersion: number,
  ): Promise<TodoItem> {
    const current = getDemoTodoItem(id)
    if (!current) throw new TodoGatewayError('NOT_FOUND', '这条待办已经不存在')
    if (current.kind === 'expense' && !done) {
      throw new TodoGatewayError('INVALID_STATE', '账单是消费记录，不需要重新打开')
    }
    if (current.done === done) return this.withVersion(current)

    const updated = toggleDemoTodoItem(id)
    this.bumpVersion(id)
    return this.withVersion(updated)
  }

  async setChecklistDone(
    id: string,
    checklistItemId: string,
    done: boolean,
    _currentVersion: number,
  ): Promise<TodoItem> {
    const current = getDemoTodoItem(id)
    if (!current) throw new TodoGatewayError('NOT_FOUND', '这条待办已经不存在')
    const checklistItem = current.checklist.find((item) => item.id === checklistItemId)
    if (!checklistItem) {
      throw new TodoGatewayError('NOT_FOUND', '这个准备项已经不存在')
    }
    if (checklistItem.done === done) return this.withVersion(current)

    const updated = toggleDemoTodoChecklistItem(id, checklistItemId)
    this.bumpVersion(id)
    return this.withVersion(updated)
  }

  private withVersion(item: ReturnType<typeof getDemoTodoItem>): TodoItem {
    if (!item) throw new TodoGatewayError('NOT_FOUND', '这条待办已经不存在')
    return {
      ...item,
      version: this.versions.get(item.id) ?? 1,
    }
  }

  private bumpVersion(id: string): void {
    this.versions.set(id, (this.versions.get(id) ?? 1) + 1)
  }
}

function summarize(items: ReturnType<typeof listDemoTodoItems>): TodoSummary {
  const pendingByKind: Record<DemoTodoKind, number> = {
    travel: 0,
    plan: 0,
    fitness: 0,
    meal: 0,
    expense: 0,
  }
  let pending = 0
  for (const item of items) {
    if (item.done) continue
    pending += 1
    pendingByKind[item.kind] += 1
  }
  return {
    total: items.length,
    pending,
    completed: items.length - pending,
    pendingByKind,
  }
}

function demoError(error: unknown): TodoGatewayError {
  if (error instanceof TodoGatewayError) return error
  return new TodoGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '待办操作没有完成',
  )
}
