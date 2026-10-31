import { addCalendarDays, getShanghaiDateOnly } from './expiry'

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

interface DateParts {
  year: number
  month: number
  day: number
}

function parseDateParts(value: string): DateParts | undefined {
  const matched = DATE_ONLY_PATTERN.exec(value)
  if (!matched) return undefined

  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const checked = new Date(Date.UTC(year, month - 1, day))
  if (
    checked.getUTCFullYear() !== year ||
    checked.getUTCMonth() !== month - 1 ||
    checked.getUTCDate() !== day
  ) {
    return undefined
  }
  return { year, month, day }
}

export function getTodoTodayKey(nowMs = Date.now()): string {
  return getShanghaiDateOnly(nowMs)
}

export function formatTodoDateLabel(value: string, nowMs = Date.now()): string {
  if (!value) return ''
  const parts = parseDateParts(value)
  if (!parts) return value

  const today = getTodoTodayKey(nowMs)
  if (value === today) return '今天'
  if (value === addCalendarDays(today, 1)) return '明天'

  const prefix = value.slice(0, 4) === today.slice(0, 4)
    ? ''
    : `${parts.year}年`
  return `${prefix}${parts.month}月${parts.day}日`
}

export function formatTodoDateDisplay(value: string): string {
  if (!value) return '选择日期'
  const parts = parseDateParts(value)
  if (!parts) return value
  return `${parts.year}年${parts.month}月${parts.day}日`
}

export function isTodoOverdue(
  value: string,
  done: boolean,
  nowMs = Date.now(),
): boolean {
  if (!value || done || !parseDateParts(value)) return false
  return value < getTodoTodayKey(nowMs)
}
