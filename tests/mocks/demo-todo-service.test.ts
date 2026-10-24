import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addDemoTodoItem,
  getDemoTodoItem,
  listDemoTodoItems,
  removeDemoTodoItem,
  resetDemoTodoData,
  toggleDemoTodoChecklistItem,
  toggleDemoTodoItem,
  updateDemoTodoItem,
} from '../../src/services/demo-todo'

const STORAGE_KEY = 'popcorn_demo_todo_v1'
const SEEDED_KEY = 'popcorn_demo_todo_seeded_v1'

describe('待办本地存储', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map<string, unknown>()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('首次读取时写入五类示例，之后不重复初始化', () => {
    const firstRead = listDemoTodoItems()

    expect(firstRead).toHaveLength(5)
    expect(storage.get(SEEDED_KEY)).toBe(true)
    expect(new Set(firstRead.map((item) => item.kind)).size).toBe(5)

    const secondRead = listDemoTodoItems()
    expect(secondRead).toHaveLength(5)
  })

  it('支持新增、编辑、勾选和删除待办', () => {
    const created = addDemoTodoItem({
      kind: 'plan',
      title: ' 预约体检 ',
      dueDate: '2026-11-01',
      note: '记得空腹',
    })

    expect(getDemoTodoItem(created.id)).toMatchObject({
      title: '预约体检',
      dueDate: '2026-11-01',
      done: false,
    })

    const updated = updateDemoTodoItem(created.id, {
      kind: 'plan',
      title: '预约周六体检',
      dueDate: '2026-11-02',
      note: '带上身份证',
    })
    expect(updated.title).toBe('预约周六体检')

    const toggled = toggleDemoTodoItem(created.id)
    expect(toggled.done).toBe(true)
    expect(getDemoTodoItem(created.id)?.done).toBe(true)
    expect(removeDemoTodoItem(created.id)).toBe(true)
    expect(getDemoTodoItem(created.id)).toBeUndefined()
  })

  it('旅行准备项勾选会持久化', () => {
    const travel = listDemoTodoItems().find((item) => item.kind === 'travel')
    if (!travel?.checklist[0]) throw new Error('旅行示例不存在')

    const updated = toggleDemoTodoChecklistItem(
      travel.id,
      travel.checklist[0].id,
    )

    expect(updated.checklist[0]?.done).toBe(true)
    expect(getDemoTodoItem(travel.id)?.checklist[0]?.done).toBe(true)
  })

  it('账单保存为已记账，不占用待办数量', () => {
    const expense = addDemoTodoItem({
      kind: 'expense',
      title: '晚饭买菜',
      amount: 52.8,
      merchant: '菜市场',
    })

    expect(expense.done).toBe(true)
    expect(listDemoTodoItems().filter((item) => !item.done)).toHaveLength(4)
  })

  it('重置后恢复五条示例待办', () => {
    for (const item of listDemoTodoItems()) removeDemoTodoItem(item.id)
    expect(listDemoTodoItems()).toEqual([])

    resetDemoTodoData()
    expect(listDemoTodoItems()).toHaveLength(5)
    expect(storage.has(STORAGE_KEY)).toBe(true)
  })
})
