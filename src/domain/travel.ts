export type TravelTripStatus = 'upcoming' | 'traveling' | 'ended'

export interface TravelDateTimeParts {
  date: string
  time: string
}

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000
const DAY_MS = 24 * 60 * 60 * 1000

/** 把接口的 RFC3339 时间转成上海时区下的日期、时间选择器值。 */
export function toTravelDateTimeParts(value: string): TravelDateTimeParts {
  const timestamp = Date.parse(value)
  if (Number.isNaN(timestamp)) return { date: '', time: '' }
  const local = new Date(timestamp + SHANGHAI_OFFSET_MS)
  return {
    date: `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}`,
    time: `${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}`,
  }
}

/** 日期和时间选择器属于上海本地时间，提交时显式带上 +08:00。 */
export function toTravelISO(
  date: string,
  time: string,
): string {
  if (!date || !time) return ''
  const timestamp = Date.parse(`${date}T${time}:00+08:00`)
  if (Number.isNaN(timestamp)) return ''
  return new Date(timestamp).toISOString()
}

export function travelDuration(
  departAt: string,
  returnAt: string,
): { days: number; nights: number } {
  const depart = toTravelDateTimeParts(departAt)
  const returnValue = toTravelDateTimeParts(returnAt)
  if (!depart.date || !returnValue.date) return { days: 0, nights: 0 }
  const departDay = Date.parse(`${depart.date}T00:00:00+08:00`)
  const returnDay = Date.parse(`${returnValue.date}T00:00:00+08:00`)
  if (Number.isNaN(departDay) || Number.isNaN(returnDay) || returnDay < departDay) {
    return { days: 0, nights: 0 }
  }
  const nights = Math.round((returnDay - departDay) / DAY_MS)
  return { days: nights + 1, nights }
}

export function formatTravelDuration(days: number, nights: number): string {
  if (days <= 0) return '时间待定'
  if (nights <= 0) return '当天往返'
  return `${days}天${nights}夜`
}

export function resolveTravelTripStatus(
  departAt: string,
  returnAt: string,
  now = Date.now(),
): TravelTripStatus {
  const depart = Date.parse(departAt)
  const returnValue = Date.parse(returnAt)
  if (Number.isNaN(depart) || Number.isNaN(returnValue)) return 'upcoming'
  if (now < depart) return 'upcoming'
  if (now <= returnValue) return 'traveling'
  return 'ended'
}

export function travelStatusLabel(status: TravelTripStatus): string {
  switch (status) {
    case 'traveling':
      return '正在途中'
    case 'ended':
      return '已经结束'
    case 'upcoming':
    default:
      return '即将出发'
  }
}

export function formatTravelDateRange(departAt: string, returnAt: string): string {
  const depart = toTravelDateTimeParts(departAt)
  const returnValue = toTravelDateTimeParts(returnAt)
  if (!depart.date || !returnValue.date) return '时间待定'
  const departText = `${formatMonthDay(depart.date)} ${depart.time}`
  const returnText = depart.date === returnValue.date
    ? returnValue.time
    : `${formatMonthDay(returnValue.date)} ${returnValue.time}`
  return `${departText} — ${returnText}`
}

export function formatTravelCardDate(value: string): string {
  const parts = toTravelDateTimeParts(value)
  if (!parts.date) return '待定'
  return `${formatMonthDay(parts.date)} ${parts.time}`
}

function formatMonthDay(date: string): string {
  const [, month = '', day = ''] = date.split('-')
  if (!month || !day) return date
  return `${Number(month)}月${Number(day)}日`
}

function pad(value: number): string {
  return String(value).padStart(2, '0')
}
