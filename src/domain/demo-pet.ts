import { getShanghaiDateOnly } from './expiry'

export type PetEventType =
  | 'vaccine'
  | 'neuter'
  | 'grooming'
  | 'illness'
  | 'visit'
  | 'outing'
  | 'internal-deworm'
  | 'external-deworm'

export type PetCareType =
  | 'vaccine'
  | 'grooming'
  | 'internal-deworm'
  | 'external-deworm'

export type PetDailyLogType =
  | 'meal'
  | 'water'
  | 'stool'
  | 'urine'
  | 'litter-change'
  | 'water-change'

export type PetSpecies = 'cat' | 'dog' | 'other'

export type BuiltInPetSupplyCategory =
  | 'kibble'
  | 'can'
  | 'freeze-dried'
  | 'soup'
  | 'litter'

export type PetSupplyCategory = BuiltInPetSupplyCategory | 'custom'

export type PetSupplyPreference = 'loved' | 'neutral' | 'dropped'

/** @deprecated 旧数据兼容，页面统一使用 preference。 */
export type PetSupplyStatus =
  | 'current'
  | 'loved'
  | 'tried'
  | 'wishlist'
  | 'dropped'
  | 'neutral'

export type PetBackgroundKey = 'sage' | 'apricot' | 'mist'

export interface DemoPetProfile {
  id: string
  name: string
  species: PetSpecies
  breed: string
  sex: 'female' | 'male'
  birthday: string
  homeOn: string
  neuteredOn: string | null
  status: string
  version?: number
  avatarMediaId?: string
  avatarUrl?: string
  backgroundKey: PetBackgroundKey
  backgroundMediaId?: string
  backgroundUrl?: string
}

export interface DemoPetEvent {
  id: string
  type: PetEventType
  occurredOn: string
  title: string
  note: string
  provider?: string
  cost?: string
  nextOn?: string | null
  recurrenceDays?: number
  createdAt: string
  version?: number
}

export interface DemoPetSupply {
  id: string
  category: PetSupplyCategory
  categoryLabel: string
  name: string
  brand: string
  preference: PetSupplyPreference
  note: string
  mediaId?: string
  mediaUrl?: string
  recordedOn: string
  version?: number
}

export interface DemoPetWeight {
  id: string
  value: string
  recordedOn: string
}

export interface DemoPetDailyLog {
  id: string
  type: PetDailyLogType
  summary: string
  note: string
  recordedAt: string
}

export interface DemoPetState {
  profile: DemoPetProfile
  events: DemoPetEvent[]
  supplies: DemoPetSupply[]
  weights: DemoPetWeight[]
  dailyLogs: DemoPetDailyLog[]
}

export interface PetTimelineItem {
  id: string
  type: PetEventType | 'birthday' | 'home'
  occurredOn: string
  title: string
  note: string
  typeLabel: string
}

export interface PetCareCard {
  type: PetCareType
  title: string
  lastOn: string | null
  elapsedLabel: string
  nextOn: string | null
  status: 'unrecorded' | 'overdue' | 'due-soon' | 'normal'
  statusLabel: string
}

export interface PetDailySummaryItem {
  type: PetDailyLogType
  label: string
  count: number
  done: boolean
  latestSummary: string
  latestTime: string
  elapsedLabel: string
}

export interface PetDailyTimelineItem {
  id: string
  type: PetDailyLogType
  label: string
  summary: string
  note: string
  recordedOn: string
  yearLabel: string
  dateLabel: string
  timeLabel: string
  elapsedLabel: string
}

export interface PetCalendarCell {
  date: string
  day: number
  inCurrentMonth: boolean
  isToday: boolean
  eventCount: number
}

export interface PetHomeActivity {
  id: string
  title: string
  copy: string
  occurredOn: string
  typeLabel: string
  icon: string
  target: 'event' | 'profile' | 'daily'
  eventId?: string
}

export const PET_EVENT_LABELS: Record<PetEventType, string> = {
  vaccine: '疫苗',
  neuter: '绝育',
  grooming: '洗澡',
  illness: '生病',
  visit: '就诊',
  outing: '外出',
  'internal-deworm': '体内驱虫',
  'external-deworm': '体外驱虫',
}

export const PET_SUPPLY_CATEGORY_LABELS: Record<PetSupplyCategory, string> = {
  kibble: '主粮',
  can: '罐头',
  'freeze-dried': '冻干',
  soup: '汤包',
  litter: '猫砂',
  custom: '自定义',
}

export const PET_SUPPLY_PREFERENCE_LABELS: Record<PetSupplyPreference, string> = {
  loved: '超爱',
  neutral: '还行',
  dropped: '不爱',
}

export const PET_SUPPLY_PREFERENCE_HEARTS: Record<PetSupplyPreference, string> = {
  loved: '♥♥♥',
  neutral: '♥♥',
  dropped: '♥',
}

export const PET_DAILY_LOG_LABELS: Record<PetDailyLogType, string> = {
  meal: '吃饭',
  water: '喝水',
  stool: '便便',
  urine: '尿尿',
  'litter-change': '换猫砂',
  'water-change': '换水',
}

export const PET_BACKGROUND_LABELS: Record<PetBackgroundKey, string> = {
  sage: '浅粉',
  apricot: '奶杏',
  mist: '雾蓝',
}

export const PET_DAILY_LOG_TYPES: readonly PetDailyLogType[] = [
  'meal',
  'water',
  'stool',
  'urine',
  'litter-change',
  'water-change',
]

export function getPetSupplyPreferenceLabel(
  preference: PetSupplyPreference,
): string {
  return PET_SUPPLY_PREFERENCE_LABELS[preference]
}

export function getPetSupplyPreferenceHearts(
  preference: PetSupplyPreference,
): string {
  return PET_SUPPLY_PREFERENCE_HEARTS[preference]
}

export const PET_CARE_TYPES: readonly PetCareType[] = [
  'grooming',
  'internal-deworm',
  'external-deworm',
]

export function isPetCareType(type: PetEventType): type is PetCareType {
  return PET_CARE_TYPES.includes(type as PetCareType)
}

function parseDateOnly(value: string): number {
  return Date.parse(`${value}T00:00:00.000Z`)
}

export function formatPetAge(birthday: string, today: string): string {
  const [birthYear, birthMonth, birthDay] = birthday.split('-').map(Number)
  const [year, month, day] = today.split('-').map(Number)
  if (!birthYear || !birthMonth || !birthDay || !year || !month || !day) {
    return '年龄待补充'
  }

  let months = (year - birthYear) * 12 + month - birthMonth
  if (day < birthDay) months -= 1
  if (months < 0) return '还未出生'

  const years = Math.floor(months / 12)
  const remainingMonths = months % 12
  if (years === 0) return `${remainingMonths} 个月`
  if (remainingMonths === 0) return `${years} 岁`
  return `${years} 岁 ${remainingMonths} 个月`
}

export function formatPetWeight(value: string): string {
  const weight = Number(value)
  return Number.isFinite(weight) ? String(weight) : value
}

function wholeMonthsBetween(from: string, to: string): number {
  const [fromYear, fromMonth, fromDay] = from.split('-').map(Number)
  const [toYear, toMonth, toDay] = to.split('-').map(Number)
  if (!fromYear || !fromMonth || !fromDay || !toYear || !toMonth || !toDay) return 0
  let months = (toYear - fromYear) * 12 + toMonth - fromMonth
  if (toDay < fromDay) months -= 1
  return Math.max(0, months)
}

export function formatPetElapsed(from: string, to: string): string {
  const fromMs = parseDateOnly(from)
  const toMs = parseDateOnly(to)
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) return '还没有记录'
  const days = Math.floor((toMs - fromMs) / 86400000)
  if (days === 0) return '今天'
  const months = wholeMonthsBetween(from, to)
  if (months <= 0) return `${days} 天`
  const anchor = new Date(`${from}T00:00:00.000Z`)
  anchor.setUTCMonth(anchor.getUTCMonth() + months)
  const remainder = Math.max(0, Math.floor((toMs - anchor.getTime()) / 86400000))
  return remainder > 0 ? `${months} 个月 ${remainder} 天` : `${months} 个月`
}

export function formatPetElapsedHours(from: string, nowMs = Date.now()): string {
  const fromMs = Date.parse(from)
  if (!Number.isFinite(fromMs) || nowMs < fromMs) return '还没有记录'
  const totalHours = Math.floor((nowMs - fromMs) / 3600000)
  if (totalHours < 1) return '刚刚'
  const days = Math.floor(totalHours / 24)
  const hours = totalHours % 24
  if (days === 0) return `${hours} 小时`
  return hours > 0 ? `${days} 天 ${hours} 小时` : `${days} 天`
}

export function buildPetTimeline(state: DemoPetState): PetTimelineItem[] {
  const milestones: PetTimelineItem[] = [
    {
      id: 'profile-birthday',
      type: 'birthday',
      occurredOn: state.profile.birthday,
      title: `${state.profile.name}出生`,
      note: '故事从这一天开始',
      typeLabel: '出生',
    },
    {
      id: 'profile-home',
      type: 'home',
      occurredOn: state.profile.homeOn,
      title: '来到我们家',
      note: '成为共同生活的一员',
      typeLabel: '到家',
    },
  ]

  const events = state.events.map<PetTimelineItem>((event) => ({
    ...event,
    typeLabel: PET_EVENT_LABELS[event.type],
  }))

  return [...milestones, ...events].sort(
    (left, right) =>
      right.occurredOn.localeCompare(left.occurredOn) ||
      right.id.localeCompare(left.id),
  )
}

export function buildPetHomeActivities(
  state: DemoPetState,
  today: string,
  limit = 3,
): PetHomeActivity[] {
  const activities: PetHomeActivity[] = []
  const todayLogs = state.dailyLogs
    .filter((log) => getShanghaiDateOnly(Date.parse(log.recordedAt)) === today)
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))

  if (todayLogs.length) {
    const labels = Array.from(
      new Set(todayLogs.map((log) => PET_DAILY_LOG_LABELS[log.type])),
    )
    activities.push({
      id: `daily-summary-${today}`,
      title: '今天的照护已记录',
      copy: `${labels.join('、')} · ${todayLogs.length} 条记录`,
      occurredOn: today,
      typeLabel: '日常',
      icon: 'pet-tab-daily',
      target: 'daily',
    })
  }

  const weights = [...state.weights].sort((left, right) =>
    left.recordedOn.localeCompare(right.recordedOn),
  )
  const latestWeight = weights[weights.length - 1]
  if (latestWeight) {
    const previousWeight = weights[weights.length - 2]
    const delta = previousWeight
      ? Number(latestWeight.value) - Number(previousWeight.value)
      : null
    activities.push({
      id: latestWeight.id,
      title: `${state.profile.name}更新了体重`,
      copy:
        delta === null || Math.abs(delta) < 0.05
          ? `现在 ${latestWeight.value} kg`
          : `现在 ${latestWeight.value} kg · 较上次 ${delta > 0 ? '+' : ''}${delta.toFixed(1)} kg`,
      occurredOn: latestWeight.recordedOn,
      typeLabel: '体重',
      icon: 'pet-metric-weight',
      target: 'profile',
    })
  }

  const latestEvent = [...state.events].sort((left, right) =>
    right.occurredOn.localeCompare(left.occurredOn),
  )[0]
  if (latestEvent) {
    activities.push({
      id: latestEvent.id,
      title: latestEvent.title,
      copy: latestEvent.note || PET_EVENT_LABELS[latestEvent.type],
      occurredOn: latestEvent.occurredOn,
      typeLabel: PET_EVENT_LABELS[latestEvent.type],
      icon:
        latestEvent.type === 'grooming'
          ? 'pet-care-grooming'
          : latestEvent.type === 'vaccine'
            ? 'pet-care-vaccine'
            : 'pet-tab-care',
      target: 'event',
      eventId: latestEvent.id,
    })
  }

  return activities
    .sort(
      (left, right) =>
        right.occurredOn.localeCompare(left.occurredOn) ||
        right.id.localeCompare(left.id),
    )
    .slice(0, Math.max(0, limit))
}

export function buildPetCareCards(
  events: readonly DemoPetEvent[],
  today: string,
): PetCareCard[] {
  return PET_CARE_TYPES.map((type) => {
    const latest = events
      .filter((event) => event.type === type)
      .sort((left, right) =>
        right.occurredOn.localeCompare(left.occurredOn) ||
        right.createdAt.localeCompare(left.createdAt),
      )[0]
    if (!latest) {
      return {
        type,
        title: PET_EVENT_LABELS[type],
        lastOn: null,
        elapsedLabel: '还没有记录',
        nextOn: null,
        status: 'unrecorded',
        statusLabel: '还没有记录',
      }
    }

    const nextOn = latest.nextOn || null
    const days = nextOn
      ? Math.round((parseDateOnly(nextOn) - parseDateOnly(today)) / 86400000)
      : null
    const status = days === null ? 'normal' : days < 0 ? 'overdue' : days <= 7 ? 'due-soon' : 'normal'
    const statusLabel =
      days === null
        ? '由你安排'
        : days < 0
          ? `计划日已过 ${Math.abs(days)} 天`
          : days === 0
            ? '计划在今天'
            : `${days} 天后`

    return {
      type,
      title: PET_EVENT_LABELS[type],
      lastOn: latest.occurredOn,
      elapsedLabel: formatPetElapsed(latest.occurredOn, today),
      nextOn,
      status,
      statusLabel,
    }
  })
}

export function filterPetSupplies(
  supplies: readonly DemoPetSupply[],
  category: PetSupplyCategory | 'all',
): DemoPetSupply[] {
  return supplies
    .filter((item) => category === 'all' || item.category === category)
    .sort((left, right) => {
      const weight: Record<PetSupplyPreference, number> = {
        loved: 0,
        neutral: 1,
        dropped: 2,
      }
      return weight[left.preference] - weight[right.preference]
        || right.recordedOn.localeCompare(left.recordedOn)
    })
    .map((item) => ({ ...item }))
}

export function getCurrentPetSupplies(
  supplies: readonly DemoPetSupply[],
): DemoPetSupply[] {
  return supplies
    .filter((item) => item.preference === 'loved')
    .slice(0, 4)
    .map((item) => ({ ...item }))
}

function formatShanghaiTime(timestamp: number): string {
  const date = new Date(timestamp + 8 * 60 * 60 * 1000)
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes(),
  ).padStart(2, '0')}`
}

export function buildPetDailySummary(
  logs: readonly DemoPetDailyLog[],
  today: string,
): PetDailySummaryItem[] {
  const nowMs = getShanghaiDateOnly(Date.now()) === today
    ? Date.now()
    : Date.parse(`${today}T23:59:59+08:00`)
  return PET_DAILY_LOG_TYPES.map((type) => {
    const matchingLogs = logs
      .filter((log) => log.type === type)
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    const todayLogs = matchingLogs.filter(
      (log) => getShanghaiDateOnly(Date.parse(log.recordedAt)) === today,
    )
    const latest = matchingLogs[0]
    const latestToday = todayLogs[0]
    return {
      type,
      label: PET_DAILY_LOG_LABELS[type],
      count: todayLogs.length,
      done: todayLogs.length > 0,
      latestSummary: latestToday?.summary ?? '今天还没记录',
      latestTime: latestToday
        ? formatShanghaiTime(Date.parse(latestToday.recordedAt))
        : '待记录',
      elapsedLabel: latest
        ? formatPetElapsedHours(latest.recordedAt, nowMs)
        : '还没有记录',
    }
  })
}

export function buildPetDailyTimeline(
  logs: readonly DemoPetDailyLog[],
  nowMs = Date.now(),
): PetDailyTimelineItem[] {
  return [...logs]
    .filter((log) => Number.isFinite(Date.parse(log.recordedAt)))
    .sort((left, right) =>
      right.recordedAt.localeCompare(left.recordedAt)
      || right.id.localeCompare(left.id),
    )
    .map((log) => {
      const timestamp = Date.parse(log.recordedAt)
      const recordedOn = getShanghaiDateOnly(timestamp)
      const [year, month, day] = recordedOn.split('-')
      return {
        id: log.id,
        type: log.type,
        label: PET_DAILY_LOG_LABELS[log.type],
        summary: log.summary,
        note: log.note,
        recordedOn,
        yearLabel: year ? `${year}年` : '日期未知',
        dateLabel: month && day ? `${Number(month)}月${Number(day)}日` : '日期未知',
        timeLabel: formatShanghaiTime(timestamp),
        elapsedLabel: formatPetElapsedHours(log.recordedAt, nowMs),
      }
    })
}

export function shiftPetCalendarMonth(
  yearMonth: string,
  delta: number,
): string {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return yearMonth
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

export function buildPetCalendar(
  events: readonly DemoPetEvent[],
  yearMonth: string,
  today: string,
  dailyLogs: readonly DemoPetDailyLog[] = [],
): PetCalendarCell[] {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return []
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const start = Date.UTC(year, month - 1, 1 - firstDay)
  const recordDates = [
    ...events.map((event) => event.occurredOn),
    ...dailyLogs
      .map((log) => Date.parse(log.recordedAt))
      .filter(Number.isFinite)
      .map((timestamp) => getShanghaiDateOnly(timestamp)),
  ]

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start + index * 86400000)
    const dateOnly = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    return {
      date: dateOnly,
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === month - 1,
      isToday: dateOnly === today,
      eventCount: recordDates.filter((recordDate) => recordDate === dateOnly).length,
    }
  })
}
