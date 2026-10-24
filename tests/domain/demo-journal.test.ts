import { describe, expect, it } from 'vitest'

import {
  createDemoJournalEntry,
  createDemoJournalSeedEntries,
  updateDemoJournalEntry,
} from '../../src/domain/demo-journal'

describe('createDemoJournalEntry', () => {
  it('整理输入并生成上海日期展示', () => {
    expect(
      createDemoJournalEntry(
        {
          title: '  今天一起散步  ',
          content: '  风很舒服。  ',
          visibility: 'space',
        },
        Date.UTC(2026, 7, 26, 16, 30),
        () => 'entry-1',
      ),
    ).toEqual({
      id: 'entry-1',
      kind: 'moment',
      kindLabel: '生活点滴',
      title: '今天一起散步',
      content: '风很舒服。',
      visibility: 'space',
      authorName: '我',
      visibilityLabel: '空间成员可见',
      day: '27',
      month: 'AUG',
      monthLabel: '8月',
      dateLabel: '8月27日',
      timeLabel: '00:30',
      createdAt: '2026-08-26T16:30:00.000Z',
    })
  })

  it('支持仅自己可见的记录', () => {
    const entry = createDemoJournalEntry(
      { title: '小秘密', content: '', visibility: 'private' },
      Date.UTC(2026, 0, 1, 2, 5),
      () => 'entry-2',
    )
    expect(entry.visibilityLabel).toBe('仅自己可见')
    expect(entry.month).toBe('JAN')
    expect(entry.dateLabel).toBe('1月1日')
    expect(entry.timeLabel).toBe('10:05')
  })
})

describe('updateDemoJournalEntry', () => {
  it('保留最初记录日期并记录更新时间', () => {
    const entry = createDemoJournalEntry(
      { title: '原来的标题', content: '原来的内容', visibility: 'space' },
      Date.UTC(2026, 7, 26, 16, 30),
      () => 'entry-1',
    )
    const updated = updateDemoJournalEntry(
      entry,
      { title: '  新的标题  ', content: '  新的内容  ', visibility: 'private' },
      Date.UTC(2026, 7, 27, 1, 5),
    )

    expect(updated).toMatchObject({
      id: 'entry-1',
      title: '新的标题',
      content: '新的内容',
      visibility: 'private',
      visibilityLabel: '仅自己可见',
      dateLabel: '8月27日',
      timeLabel: '00:30',
      createdAt: '2026-08-26T16:30:00.000Z',
      updatedAt: '2026-08-27T01:05:00.000Z',
    })
  })
})

describe('createDemoJournalSeedEntries', () => {
  it('提供生活点滴与重要记录的本地示例', () => {
    const entries = createDemoJournalSeedEntries(Date.UTC(2026, 9, 24, 12, 0))

    expect(entries).toHaveLength(5)
    expect(entries[0]).toMatchObject({
      id: 'demo-journal-flowers',
      authorName: '小满',
      image: {
        src: '/images/demo-flowers.jpg',
        caption: '图片为公版艺术示例',
      },
    })
    expect(entries[1]).toMatchObject({
      id: 'demo-journal-pet',
      authorName: '阿屿',
      content: '比上个月重了 0.1 kg\n精神和食欲都很好',
    })
    expect(entries[2]).toMatchObject({
      id: 'demo-note-home',
      kind: 'note',
      kindLabel: '重要记录',
      category: 'home',
      categoryLabel: '家的资料',
    })
  })
})

describe('重要记录字段', () => {
  it('创建时保留归档分类', () => {
    const note = createDemoJournalEntry(
      {
        kind: 'note',
        category: 'health',
        title: '常备药',
        content: '药箱在客厅',
        visibility: 'private',
      },
      Date.UTC(2026, 9, 20),
      () => 'note-1',
    )

    expect(note).toMatchObject({
      kind: 'note',
      kindLabel: '重要记录',
      category: 'health',
      categoryLabel: '健康资料',
    })
  })
})
