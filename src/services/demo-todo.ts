import type { DemoTodoInput, DemoTodoItem } from '../domain/demo-todo'
import {
  createDemoTodoItem,
  createDemoTodoSeedItems,
  normalizeDemoTodoItem,
  updateDemoTodoItem as applyDemoTodoUpdate,
} from '../domain/demo-todo'

const STORAGE_KEY = 'popcorn_demo_todo_v1'
const SEEDED_KEY = 'popcorn_demo_todo_seeded_v1'

export const DEMO_TODO_STORAGE_KEYS = [STORAGE_KEY, SEEDED_KEY] as const

function sortItems(items: DemoTodoItem[]): DemoTodoItem[] {
  return items.slice().sort((left, right) => {
    if (left.done !== right.done) return left.done ? 1 : -1

    const leftDate = left.dueDate || '9999-12-31'
    const rightDate = right.dueDate || '9999-12-31'
    if (leftDate !== rightDate) return leftDate.localeCompare(rightDate)
    return right.createdAt.localeCompare(left.createdAt)
  })
}

function readStoredItems(): DemoTodoItem[] {
  const items = wx.getStorageSync<DemoTodoItem[] | ''>(STORAGE_KEY)
  if (!Array.isArray(items)) return []
  return sortItems(
    items
      .filter((item) => item && typeof item.id === 'string')
      .map((item) => normalizeDemoTodoItem(item)),
  )
}

function writeStoredItems(items: DemoTodoItem[]): void {
  wx.setStorageSync(STORAGE_KEY, sortItems(items))
}

function ensureSeedItems(): void {
  const seeded = wx.getStorageSync<boolean | ''>(SEEDED_KEY)
  if (seeded === true) return

  if (readStoredItems().length === 0) {
    wx.setStorageSync(STORAGE_KEY, sortItems(createDemoTodoSeedItems()))
  }
  wx.setStorageSync(SEEDED_KEY, true)
}

export function listDemoTodoItems(): DemoTodoItem[] {
  ensureSeedItems()
  return readStoredItems()
}

export function getDemoTodoItem(id: string): DemoTodoItem | undefined {
  ensureSeedItems()
  return readStoredItems().find((item) => item.id === id)
}

export function addDemoTodoItem(input: DemoTodoInput): DemoTodoItem {
  ensureSeedItems()
  const item = createDemoTodoItem(input)
  writeStoredItems([item, ...readStoredItems()])
  return item
}

export function updateDemoTodoItem(
  id: string,
  input: DemoTodoInput,
): DemoTodoItem {
  ensureSeedItems()
  const items = readStoredItems()
  const index = items.findIndex((item) => item.id === id)
  const current = items[index]
  if (!current) throw new Error('这条待办不存在')

  const updated = applyDemoTodoUpdate(current, input)
  items[index] = updated
  writeStoredItems(items)
  return updated
}

export function toggleDemoTodoItem(id: string): DemoTodoItem {
  ensureSeedItems()
  const items = readStoredItems()
  const index = items.findIndex((item) => item.id === id)
  const current = items[index]
  if (!current) throw new Error('这条待办不存在')

  const updated: DemoTodoItem = {
    ...current,
    done: !current.done,
    updatedAt: new Date().toISOString(),
  }
  items[index] = updated
  writeStoredItems(items)
  return updated
}

export function toggleDemoTodoChecklistItem(
  id: string,
  checklistId: string,
): DemoTodoItem {
  ensureSeedItems()
  const items = readStoredItems()
  const index = items.findIndex((item) => item.id === id)
  const current = items[index]
  if (!current) throw new Error('这条待办不存在')
  if (!current.checklist.some((item) => item.id === checklistId)) {
    throw new Error('这个准备事项不存在')
  }

  const updated: DemoTodoItem = {
    ...current,
    checklist: current.checklist.map((item) =>
      item.id === checklistId ? { ...item, done: !item.done } : item,
    ),
    updatedAt: new Date().toISOString(),
  }
  items[index] = updated
  writeStoredItems(items)
  return updated
}

export function removeDemoTodoItem(id: string): boolean {
  ensureSeedItems()
  const items = readStoredItems()
  const next = items.filter((item) => item.id !== id)
  if (next.length === items.length) return false
  writeStoredItems(next)
  return true
}

export function resetDemoTodoData(): void {
  for (const key of DEMO_TODO_STORAGE_KEYS) wx.removeStorageSync(key)
  ensureSeedItems()
}
