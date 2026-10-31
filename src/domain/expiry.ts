import type { ExpiryInfo } from './inventory'

const DAY_MS = 24 * 60 * 60 * 1000
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function parseDateOnly(value: string): number {
  const matched = DATE_ONLY_PATTERN.exec(value)
  if (!matched) {
    throw new Error(`无效日期：${value}`)
  }

  const year = Number(matched[1])
  const month = Number(matched[2])
  const day = Number(matched[3])
  const timestamp = Date.UTC(year, month - 1, day)
  const checked = new Date(timestamp)

  if (
    checked.getUTCFullYear() !== year ||
    checked.getUTCMonth() !== month - 1 ||
    checked.getUTCDate() !== day
  ) {
    throw new Error(`无效日期：${value}`)
  }

  return timestamp
}

function formatDateOnly(timestamp: number): string {
  const date = new Date(timestamp)
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`
}

export function getShanghaiDateOnly(nowMs: number): string {
  return formatDateOnly(nowMs + SHANGHAI_OFFSET_MS)
}

export function formatShanghaiDateTime(value: string): string {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return '时间未知'

  const date = new Date(timestamp + SHANGHAI_OFFSET_MS)
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日 ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())}`
}

export function resolveExpiry(
  expiresOn: string | null,
  today: string,
): ExpiryInfo {
  const todayTimestamp = parseDateOnly(today)
  if (expiresOn === null) {
    return {
      status: 'none',
      daysRemaining: null,
      label: '未设置有效期',
    }
  }

  const daysRemaining = Math.round(
    (parseDateOnly(expiresOn) - todayTimestamp) / DAY_MS,
  )

  if (daysRemaining < 0) {
    return {
      status: 'expired',
      daysRemaining,
      label: `已过期 ${Math.abs(daysRemaining)} 天`,
    }
  }
  if (daysRemaining === 0) {
    return { status: 'today', daysRemaining, label: '今日到期' }
  }
  if (daysRemaining <= 3) {
    return {
      status: 'urgent',
      daysRemaining,
      label: `还剩 ${daysRemaining} 天`,
    }
  }
  if (daysRemaining <= 7) {
    return {
      status: 'soon',
      daysRemaining,
      label: `还剩 ${daysRemaining} 天`,
    }
  }
  return {
    status: 'normal',
    daysRemaining,
    label: `还剩 ${daysRemaining} 天`,
  }
}

export function addCalendarDays(dateOnly: string, days: number): string {
  return formatDateOnly(parseDateOnly(dateOnly) + days * DAY_MS)
}
