import type { InventoryItem } from './inventory'
import { getShanghaiDateOnly } from './expiry'
import {
  summarizeInventory,
  type InventorySummary,
} from './inventory-query'

export type HomeDayPeriod = 'late-night' | 'morning' | 'afternoon' | 'evening'

export interface HomeSnapshot {
  today: string
  dateLabel: string
  weekdayLabel: string
  period: HomeDayPeriod
  salutation: string
  inventoryNotice: string
  inventoryNoticeCount: number
  inventoryItemCount: number
}

export function buildHomeSnapshot(
  items: readonly InventoryItem[],
  nowMs: number,
): HomeSnapshot {
  return buildHomeSnapshotFromSummary(summarizeInventory(items, getShanghaiDateOnly(nowMs)), nowMs)
}

export function buildHomeSnapshotFromSummary(
  summary: InventorySummary,
  nowMs: number,
): HomeSnapshot {
  const shanghaiDate = new Date(nowMs + 8 * 60 * 60 * 1000)
  const hour = shanghaiDate.getUTCHours()
  const today = getShanghaiDateOnly(nowMs)
  const inventoryNoticeCount = summary.expired + summary.dueWithin3Days

  let period: HomeDayPeriod
  let salutation: string
  if (hour < 5) {
    period = 'late-night'
    salutation = '夜深了'
  } else if (hour < 12) {
    period = 'morning'
    salutation = '早上好'
  } else if (hour < 18) {
    period = 'afternoon'
    salutation = '下午好'
  } else {
    period = 'evening'
    salutation = '我回来啦'
  }

  let inventoryNotice = '家里的库存都还好。'
  if (summary.expired > 0) {
    inventoryNotice = `冰箱里有 ${summary.expired} 件已经过期，先处理一下。`
  } else if (summary.dueWithin3Days > 0) {
    inventoryNotice = `有 ${summary.dueWithin3Days} 件东西三天内到期。`
  }

  const [, month, day] = today.split('-').map(Number)
  const weekdays = [
    '星期日',
    '星期一',
    '星期二',
    '星期三',
    '星期四',
    '星期五',
    '星期六',
  ]

  return {
    today,
    dateLabel: `${month}月${day}日`,
    weekdayLabel: weekdays[shanghaiDate.getUTCDay()] ?? '',
    period,
    salutation,
    inventoryNotice,
    inventoryNoticeCount,
    inventoryItemCount: summary.total,
  }
}
