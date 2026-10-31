import { describe, expect, it } from 'vitest'

import {
  formatTodoDateDisplay,
  formatTodoDateLabel,
  getTodoTodayKey,
  isTodoOverdue,
} from '../../src/domain/todo-date'

describe('todo date helpers', () => {
  const shanghaiFirstDay = Date.parse('2026-10-31T16:30:00.000Z')

  it('按上海自然日计算今天', () => {
    expect(getTodoTodayKey(shanghaiFirstDay)).toBe('2026-11-01')
  })

  it('使用上海自然日展示今天、明天和跨年日期', () => {
    expect(formatTodoDateLabel('2026-11-01', shanghaiFirstDay)).toBe('今天')
    expect(formatTodoDateLabel('2026-11-02', shanghaiFirstDay)).toBe('明天')
    expect(formatTodoDateLabel('2027-01-03', shanghaiFirstDay)).toBe('2027年1月3日')
  })

  it('展示完整日期并容忍空值和非法值', () => {
    expect(formatTodoDateDisplay('2026-11-08')).toBe('2026年11月8日')
    expect(formatTodoDateDisplay('')).toBe('选择日期')
    expect(formatTodoDateDisplay('2026-02-31')).toBe('2026-02-31')
  })

  it('仅未完成且早于上海今天的事项视为过期', () => {
    expect(isTodoOverdue('2026-10-31', false, shanghaiFirstDay)).toBe(true)
    expect(isTodoOverdue('2026-11-01', false, shanghaiFirstDay)).toBe(false)
    expect(isTodoOverdue('2026-10-31', true, shanghaiFirstDay)).toBe(false)
    expect(isTodoOverdue('bad-date', false, shanghaiFirstDay)).toBe(false)
  })
})
