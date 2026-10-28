import { getShanghaiDateOnly } from './expiry'

export type DemoJournalVisibility = 'space' | 'private'
export type DemoJournalKind = 'moment' | 'note'
export type DemoNoteCategory = 'home' | 'health' | 'pet' | 'other'

export const DEMO_JOURNAL_KIND_LABELS: Record<DemoJournalKind, string> = {
  moment: '生活点滴',
  note: '重要记录',
}

export const DEMO_NOTE_CATEGORY_LABELS: Record<DemoNoteCategory, string> = {
  home: '家的资料',
  health: '健康资料',
  pet: '宠物资料',
  other: '其他资料',
}

export interface DemoJournalImage {
  src: string
  caption?: string
}

export interface DemoJournalEntryInput {
  title: string
  content: string
  visibility: DemoJournalVisibility
  kind?: DemoJournalKind
  category?: DemoNoteCategory
}

export interface DemoJournalEntry extends DemoJournalEntryInput {
  id: string
  kind: DemoJournalKind
  kindLabel: string
  categoryLabel?: string
  authorName: string
  visibilityLabel: string
  day: string
  month: string
  monthLabel: string
  dateLabel: string
  timeLabel: string
  createdAt: string
  updatedAt?: string
  image?: DemoJournalImage
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

const DAY_MS = 24 * 60 * 60 * 1000

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function visibilityLabel(visibility: DemoJournalVisibility): string {
  return visibility === 'space' ? '空间成员可见' : '仅自己可见'
}

export function formatDemoJournalEntry(entry: DemoJournalEntry): DemoJournalEntry {
  const {
    category: _category,
    categoryLabel: _categoryLabel,
    ...baseEntry
  } = entry
  const kind = entry.kind ?? 'moment'
  const timestamp = Date.parse(entry.createdAt)
  const safeTimestamp = Number.isNaN(timestamp) ? Date.now() : timestamp
  const shanghaiTime = new Date(safeTimestamp + 8 * 60 * 60 * 1000)
  const [, month, day] = getShanghaiDateOnly(safeTimestamp).split('-').map(Number)
  const safeMonth = month ?? 1
  const safeDay = day ?? 1

  return {
    ...baseEntry,
    kind,
    kindLabel: DEMO_JOURNAL_KIND_LABELS[kind],
    ...(kind === 'note'
      ? {
          category: entry.category ?? 'other',
          categoryLabel:
            DEMO_NOTE_CATEGORY_LABELS[entry.category ?? 'other'],
        }
      : {}),
    title: entry.title.trim(),
    content: entry.content.trim(),
    authorName: entry.authorName || '我',
    visibilityLabel: visibilityLabel(entry.visibility),
    day: pad(safeDay),
    month: MONTH_LABELS[safeMonth - 1] ?? 'JAN',
    monthLabel: `${safeMonth}月`,
    dateLabel: `${safeMonth}月${safeDay}日`,
    timeLabel: `${pad(shanghaiTime.getUTCHours())}:${pad(shanghaiTime.getUTCMinutes())}`,
  }
}

/**
 * 创建一条生活记录。展示字段由 createdAt 派生，避免跨页面各自格式化。
 */
export function createDemoJournalEntry(
  input: DemoJournalEntryInput,
  nowMs = Date.now(),
  idGenerator = () => `journal-${nowMs}`,
  authorName = '我',
): DemoJournalEntry {
  return formatDemoJournalEntry({
    id: idGenerator(),
    kind: input.kind ?? 'moment',
    ...(input.kind === 'note' ? { category: input.category ?? 'other' } : {}),
    title: input.title,
    content: input.content,
    visibility: input.visibility,
    kindLabel: '',
    authorName,
    visibilityLabel: '',
    day: '',
    month: '',
    monthLabel: '',
    dateLabel: '',
    timeLabel: '',
    createdAt: new Date(nowMs).toISOString(),
  })
}

/**
 * 编辑时不改变最初记录时间，只刷新内容与更新时间。
 */
export function updateDemoJournalEntry(
  entry: DemoJournalEntry,
  input: DemoJournalEntryInput,
  nowMs = Date.now(),
): DemoJournalEntry {
  return formatDemoJournalEntry({
    ...entry,
    kind: input.kind ?? entry.kind,
    ...(input.kind === 'note' || entry.kind === 'note'
      ? { category: input.category ?? entry.category ?? 'other' }
      : {}),
    title: input.title,
    content: input.content,
    visibility: input.visibility,
    updatedAt: new Date(nowMs).toISOString(),
  })
}

/**
 * 兼容早期本地数据中缺少展示字段的记录。
 */
export function normalizeDemoJournalEntry(
  entry: DemoJournalEntry,
  nowMs = Date.now(),
): DemoJournalEntry {
  return formatDemoJournalEntry({
    ...entry,
    kind: entry.kind ?? 'moment',
    ...(entry.kind === 'note'
      ? { category: entry.category ?? 'other' }
      : {}),
    authorName: entry.authorName || '我',
    visibility: entry.visibility ?? 'space',
    createdAt: entry.createdAt || new Date(nowMs).toISOString(),
  })
}

/**
 * 首次进入 Demo 时的示例记录，让共同空间一开始就有可读内容。
 */
export function createDemoJournalSeedEntries(nowMs = Date.now()): DemoJournalEntry[] {
  return [
    ...createDemoJournalMomentSeedEntries(nowMs),
    ...createDemoJournalNoteSeedEntries(nowMs),
  ]
}

export function createDemoJournalMomentSeedEntries(
  nowMs = Date.now(),
): DemoJournalEntry[] {
  const flowers = createDemoJournalEntry(
    {
      title: '下班路上买了第一束桂花',
      content: '放在餐桌上，屋子突然就有了秋天的味道。',
      visibility: 'space',
    },
    nowMs - DAY_MS,
    () => 'demo-journal-flowers',
    '小满',
  )
  const pet = createDemoJournalEntry(
    {
      title: '糯米今天 3.8 kg',
      content: '比上个月重了 0.1 kg\n精神和食欲都很好',
      visibility: 'space',
    },
    nowMs - 4 * DAY_MS,
    () => 'demo-journal-pet',
    '阿屿',
  )

  return [
    {
      ...flowers,
      image: {
        src: '/images/demo-flowers.jpg',
        caption: '图片为公版艺术示例',
      },
    },
    pet,
  ]
}

export function createDemoJournalNoteSeedEntries(
  nowMs = Date.now(),
): DemoJournalEntry[] {
  return [
    createDemoJournalEntry(
      {
        kind: 'note',
        category: 'home',
        title: '租房交接与水电信息',
        content:
          '门禁卡 2 张，放在玄关抽屉。\n水电燃气户号已备份，退租前一起核对最后一次读数。',
        visibility: 'space',
      },
      nowMs - 2 * DAY_MS,
      () => 'demo-note-home',
      '小满',
    ),
    createDemoJournalEntry(
      {
        kind: 'note',
        category: 'pet',
        title: '糯米的疫苗与驱虫记录',
        content:
          '最近一次体内驱虫已完成。\n下次疫苗时间写在宠物事件里，去医院时带上疫苗本。',
        visibility: 'space',
      },
      nowMs - 6 * DAY_MS,
      () => 'demo-note-pet',
      '阿屿',
    ),
    createDemoJournalEntry(
      {
        kind: 'note',
        category: 'health',
        title: '常备药与过敏信息',
        content:
          '退烧药和肠胃药放在客厅药箱。\n青霉素过敏，就诊时需要主动告知。',
        visibility: 'private',
      },
      nowMs - 9 * DAY_MS,
      () => 'demo-note-health',
      '小满',
    ),
  ]
}
