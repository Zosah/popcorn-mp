import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DemoJournalEntry } from '../../src/domain/demo-journal'
import {
  addDemoJournalEntry,
  getDemoJournalEntry,
  listDemoJournalEntries,
  removeDemoJournalEntry,
  updateDemoJournalEntry,
} from '../../src/services/demo-journal'

const STORAGE_KEY = 'popcorn_demo_journal_v1'
const SEEDED_KEY = 'popcorn_demo_journal_seeded_v1'

describe('生活记录本地存储', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map<string, unknown>()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('首次读取时写入生活与重要记录示例且只初始化一次', () => {
    const firstRead = listDemoJournalEntries()

    expect(firstRead).toHaveLength(5)
    expect(firstRead[0]?.id).toBe('demo-journal-flowers')
    expect(firstRead.filter((entry) => entry.kind === 'note')).toHaveLength(3)
    expect(storage.get(SEEDED_KEY)).toBe(true)

    const secondRead = listDemoJournalEntries()
    expect(secondRead).toHaveLength(5)
  })

  it('新增后可读取并更新内容与可见范围', () => {
    const created = addDemoJournalEntry({
      title: ' 一起做晚饭 ',
      content: '番茄锅很好吃',
      visibility: 'space',
    })

    expect(getDemoJournalEntry(created.id)).toMatchObject({
      title: '一起做晚饭',
      content: '番茄锅很好吃',
    })

    const updated = updateDemoJournalEntry(created.id, {
      title: '一起做番茄锅',
      content: '下次少放一点盐',
      visibility: 'private',
    })

    expect(updated).toMatchObject({
      id: created.id,
      title: '一起做番茄锅',
      visibility: 'private',
      visibilityLabel: '仅自己可见',
      createdAt: created.createdAt,
    })
    expect(updated.updatedAt).toBeTruthy()
  })

  it('新增重要记录并更新归档分类', () => {
    const created = addDemoJournalEntry({
      kind: 'note',
      category: 'home',
      title: '网络与电器信息',
      content: '路由器在玄关',
      visibility: 'space',
    })

    const updated = updateDemoJournalEntry(created.id, {
      kind: 'note',
      category: 'other',
      title: '家里的网络信息',
      content: '路由器在玄关柜',
      visibility: 'private',
    })

    expect(updated).toMatchObject({
      kind: 'note',
      category: 'other',
      categoryLabel: '其他资料',
      visibility: 'private',
    })
  })

  it('删除后不再返回记录，也不会重新注入示例', () => {
    for (const entry of listDemoJournalEntries()) {
      expect(removeDemoJournalEntry(entry.id)).toBe(true)
    }

    expect(listDemoJournalEntries()).toEqual([])
    expect(storage.get(STORAGE_KEY)).toEqual([])
  })

  it('兼容旧记录缺失的展示字段与可见范围', () => {
    const legacyEntry = {
      id: 'legacy-journal',
      title: '旧记录',
      content: '仍然保留',
      createdAt: '2026-10-20T02:30:00.000Z',
    } as DemoJournalEntry
    storage.set(STORAGE_KEY, [legacyEntry])
    storage.set(SEEDED_KEY, true)

    expect(getDemoJournalEntry('legacy-journal')).toMatchObject({
      title: '旧记录',
      visibility: 'space',
      visibilityLabel: '空间成员可见',
      authorName: '我',
      dateLabel: '10月20日',
      timeLabel: '10:30',
    })
  })
})
