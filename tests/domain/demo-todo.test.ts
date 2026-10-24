import { describe, expect, it } from 'vitest'

import {
  createDemoTodoItem,
  createDemoTodoSeedItems,
  estimateDemoTodoCalories,
  formatDemoTodoChecklist,
  normalizeDemoTodoItem,
  parseDemoTodoChecklist,
  updateDemoTodoItem,
} from '../../src/domain/demo-todo'

describe('待办数据规则', () => {
  it('创建旅行待办时整理日期、清单和重复项', () => {
    const item = createDemoTodoItem(
      {
        kind: 'travel',
        title: '  去大理  ',
        destination: ' 大理 ',
        dueDate: '2026-11-02',
        note: ' 慢慢走 ',
        checklist: [
          { text: ' 身份证 ' },
          { text: '充电器' },
          { text: '身份证' },
          { text: '   ' },
        ],
      },
      Date.UTC(2026, 9, 24),
      () => 'todo-travel',
    )

    expect(item).toMatchObject({
      id: 'todo-travel',
      kind: 'travel',
      title: '去大理',
      destination: '大理',
      dueDate: '2026-11-02',
      note: '慢慢走',
      done: false,
    })
    expect(item.checklist.map((entry) => entry.text)).toEqual(['身份证', '充电器'])
  })

  it('账单创建为已记账，并规范化金额与购买地点', () => {
    const item = createDemoTodoItem(
      {
        kind: 'expense',
        title: ' 买菜 ',
        amount: 86.456,
        merchant: ' 菜市场 ',
        dueDate: 'not-a-date',
      },
      Date.UTC(2026, 9, 24),
      () => 'todo-expense',
    )

    expect(item).toMatchObject({
      kind: 'expense',
      done: true,
      amount: 86.46,
      merchant: '菜市场',
      dueDate: '',
    })
  })

  it('编辑旅行待办时按文本保留准备项勾选状态', () => {
    const item = createDemoTodoItem(
      {
        kind: 'travel',
        title: '去大理',
        checklist: [{ text: '身份证' }, { text: '充电器' }],
      },
      Date.UTC(2026, 9, 20),
      () => 'todo-1',
    )
    item.checklist[0]!.done = true

    const updated = updateDemoTodoItem(
      item,
      {
        kind: 'travel',
        title: '去大理前准备',
        checklist: [{ text: '身份证' }, { text: '充电器' }, { text: '防晒' }],
      },
      Date.UTC(2026, 9, 21),
    )

    expect(updated.checklist.map((entry) => [entry.text, entry.done])).toEqual([
      ['身份证', true],
      ['充电器', false],
      ['防晒', false],
    ])
    expect(updated.updatedAt).toBe('2026-10-21T00:00:00.000Z')
  })

  it('按运动类型和时长粗算热量', () => {
    expect(estimateDemoTodoCalories('快走', 30)).toBe(120)
    expect(estimateDemoTodoCalories('慢跑', 30)).toBe(240)
    expect(estimateDemoTodoCalories('瑜伽', 60)).toBe(180)
    expect(estimateDemoTodoCalories('拉伸', 0)).toBe(0)
  })

  it('准备清单支持多行输入与回填', () => {
    const checklist = parseDemoTodoChecklist('- 身份证\n• 充电器\n\n常用药')
    const items = checklist.map((entry, index) => ({
      id: String(index),
      text: entry.text,
      done: false,
    }))

    expect(items.map((entry) => entry.text)).toEqual(['身份证', '充电器', '常用药'])
    expect(formatDemoTodoChecklist(items)).toBe('身份证\n充电器\n常用药')
  })

  it('兼容旧本地数据缺失的扩展字段', () => {
    const legacy = {
      id: 'legacy-todo',
      kind: 'plan',
      title: '旧计划',
      createdAt: '2026-10-20T02:30:00.000Z',
    } as Parameters<typeof normalizeDemoTodoItem>[0]

    expect(normalizeDemoTodoItem(legacy, Date.UTC(2026, 9, 24))).toMatchObject({
      id: 'legacy-todo',
      title: '旧计划',
      note: '',
      done: false,
      dueDate: '',
      checklist: [],
      amount: 0,
    })
  })

  it('提供覆盖五类功能的示例待办', () => {
    const items = createDemoTodoSeedItems(Date.UTC(2026, 9, 24))

    expect(items).toHaveLength(5)
    expect(new Set(items.map((item) => item.kind))).toEqual(
      new Set(['travel', 'plan', 'fitness', 'meal', 'expense']),
    )
    expect(items.find((item) => item.kind === 'travel')?.checklist).toHaveLength(4)
    expect(items.find((item) => item.kind === 'expense')?.done).toBe(true)
  })
})
