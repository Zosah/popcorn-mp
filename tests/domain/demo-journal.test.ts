import { describe, expect, it } from 'vitest'

import { createDemoJournalEntry } from '../../src/domain/demo-journal'

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
      title: '今天一起散步',
      content: '风很舒服。',
      visibility: 'space',
      visibilityLabel: '空间成员可见',
      day: '27',
      month: 'AUG',
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
    expect(entry.timeLabel).toBe('10:05')
  })
})
