import { getShanghaiDateOnly } from './expiry'

export type DemoJournalVisibility = 'space' | 'private'

export interface DemoJournalEntryInput {
  title: string
  content: string
  visibility: DemoJournalVisibility
}

export interface DemoJournalEntry extends DemoJournalEntryInput {
  id: string
  visibilityLabel: string
  day: string
  month: string
  timeLabel: string
  createdAt: string
}

const MONTH_LABELS = [
  'JAN',
  'FEB',
  'MAR',
  'APR',
  'MAY',
  'JUN',
  'JUL',
  'AUG',
  'SEP',
  'OCT',
  'NOV',
  'DEC',
] as const

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

export function createDemoJournalEntry(
  input: DemoJournalEntryInput,
  nowMs = Date.now(),
  idGenerator = () => `journal-${nowMs}`,
): DemoJournalEntry {
  const shanghaiTime = new Date(nowMs + 8 * 60 * 60 * 1000)
  const [, month, day] = getShanghaiDateOnly(nowMs).split('-').map(Number)

  return {
    id: idGenerator(),
    title: input.title.trim(),
    content: input.content.trim(),
    visibility: input.visibility,
    visibilityLabel:
      input.visibility === 'space' ? '空间成员可见' : '仅自己可见',
    day: pad(day ?? 1),
    month: MONTH_LABELS[(month ?? 1) - 1] ?? 'JAN',
    timeLabel: `${pad(shanghaiTime.getUTCHours())}:${pad(shanghaiTime.getUTCMinutes())}`,
    createdAt: new Date(nowMs).toISOString(),
  }
}
