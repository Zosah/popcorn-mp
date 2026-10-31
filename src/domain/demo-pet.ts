import { addCalendarDays, getShanghaiDateOnly } from './expiry'

export type PetEventType =
  | 'vaccine'
  | 'neuter'
  | 'grooming'
  | 'illness'
  | 'visit'
  | 'outing'
  | 'internal-deworm'
  | 'external-deworm'

export type PetCareType = 'internal-deworm' | 'external-deworm'

export type PetDailyLogType = 'meal' | 'water' | 'stool' | 'urine'

export type PetSpecies = 'cat' | 'dog' | 'other'

export type PetSupplyCategory =
  | 'kibble'
  | 'can'
  | 'freeze-dried'
  | 'soup'
  | 'litter'

export type PetSupplyStatus =
  | 'current'
  | 'loved'
  | 'tried'
  | 'wishlist'
  | 'dropped'

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
  createdAt: string
  version?: number
}

export interface DemoPetSupply {
  id: string
  category: PetSupplyCategory
  name: string
  status: PetSupplyStatus
  note: string
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
  intervalLabel: string
  lastOn: string | null
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
  grooming: '洗护',
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
}

export const PET_SUPPLY_STATUS_LABELS: Record<PetSupplyStatus, string> = {
  current: '正在用',
  loved: '爱吃',
  tried: '吃过',
  wishlist: '种草',
  dropped: '拔草',
}

export const PET_DAILY_LOG_LABELS: Record<PetDailyLogType, string> = {
  meal: '吃饭',
  water: '喝水',
  stool: '便便',
  urine: '尿尿',
}

export function getPetSupplyStatusLabel(
  category: PetSupplyCategory,
  status: PetSupplyStatus,
): string {
  if (category !== 'litter') return PET_SUPPLY_STATUS_LABELS[status]
  if (status === 'loved') return '好用'
  if (status === 'tried') return '用过'
  return PET_SUPPLY_STATUS_LABELS[status]
}

const CARE_INTERVALS: Record<PetCareType, number> = {
  'internal-deworm': 90,
  'external-deworm': 30,
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
      icon: 'heart-pulse',
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
      icon: 'chart-no-axes-column',
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
          ? 'droplets'
          : latestEvent.type === 'vaccine'
            ? 'droplet'
            : 'paw-print',
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
  return (['internal-deworm', 'external-deworm'] as const).map((type) => {
    const interval = CARE_INTERVALS[type]
    const latest = events
      .filter((event) => event.type === type)
      .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))[0]
    const nextOn = latest ? addCalendarDays(latest.occurredOn, interval) : null

    if (!latest || !nextOn) {
      return {
        type,
        title: PET_EVENT_LABELS[type],
        intervalLabel: `每 ${interval} 天`,
        lastOn: null,
        nextOn: null,
        status: 'unrecorded',
        statusLabel: '还没有记录',
      }
    }

    const days = Math.round((parseDateOnly(nextOn) - parseDateOnly(today)) / 86400000)
    const status = days < 0 ? 'overdue' : days <= 7 ? 'due-soon' : 'normal'
    const statusLabel =
      days < 0
        ? `已超期 ${Math.abs(days)} 天`
        : days === 0
          ? '今天该做'
          : days <= 7
            ? `${days} 天后`
            : `下次 ${nextOn}`

    return {
      type,
      title: PET_EVENT_LABELS[type],
      intervalLabel: `每 ${interval} 天`,
      lastOn: latest.occurredOn,
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
    .sort(
      (left, right) =>
        Number(right.status === 'current') - Number(left.status === 'current') ||
        right.recordedOn.localeCompare(left.recordedOn),
    )
    .map((item) => ({ ...item }))
}

export function getCurrentPetSupplies(
  supplies: readonly DemoPetSupply[],
): DemoPetSupply[] {
  return supplies.filter((item) => item.status === 'current').map((item) => ({ ...item }))
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
  return (['meal', 'water', 'stool', 'urine'] as const).map((type) => {
    const todayLogs = logs
      .filter(
        (log) =>
          log.type === type &&
          getShanghaiDateOnly(Date.parse(log.recordedAt)) === today,
      )
      .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    const latest = todayLogs[0]
    return {
      type,
      label: PET_DAILY_LOG_LABELS[type],
      count: todayLogs.length,
      done: todayLogs.length > 0,
      latestSummary: latest?.summary ?? '今天还没记录',
      latestTime: latest ? formatShanghaiTime(Date.parse(latest.recordedAt)) : '待记录',
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
): PetCalendarCell[] {
  const [year, month] = yearMonth.split('-').map(Number)
  if (!year || !month) return []
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  const start = Date.UTC(year, month - 1, 1 - firstDay)

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start + index * 86400000)
    const dateOnly = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
    return {
      date: dateOnly,
      day: date.getUTCDate(),
      inCurrentMonth: date.getUTCMonth() === month - 1,
      isToday: dateOnly === today,
      eventCount: events.filter((event) => event.occurredOn === dateOnly).length,
    }
  })
}
