export type DemoTodoKind = 'travel' | 'plan' | 'fitness' | 'meal' | 'expense'
export type DemoMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface DemoTodoChecklistItem {
  id: string
  text: string
  done: boolean
}

export interface DemoTodoInput {
  kind: DemoTodoKind
  title: string
  note?: string
  dueDate?: string
  destination?: string
  checklist?: Array<{ id?: string; text: string; done?: boolean }>
  exercise?: string
  durationMinutes?: number
  calories?: number
  mealType?: DemoMealType | ''
  amount?: number
  merchant?: string
}

export interface DemoTodoItem {
  id: string
  kind: DemoTodoKind
  title: string
  note: string
  done: boolean
  dueDate: string
  destination: string
  checklist: DemoTodoChecklistItem[]
  exercise: string
  durationMinutes: number
  calories: number
  mealType: DemoMealType | ''
  amount: number
  merchant: string
  createdAt: string
  updatedAt?: string
}

export const DEMO_TODO_KIND_OPTIONS: Array<{
  value: DemoTodoKind
  label: string
  icon: string
  hint: string
}> = [
  { value: 'travel', label: '旅行准备', icon: 'plane', hint: '目的地、清单和物品' },
  { value: 'plan', label: '小计划', icon: 'list-todo', hint: '什么时候做什么' },
  { value: 'fitness', label: '健身', icon: 'dumbbell', hint: '运动、时长和热量' },
  { value: 'meal', label: '今天吃什么', icon: 'utensils', hint: '菜单、记录和推荐' },
  { value: 'expense', label: '我们的账单', icon: 'wallet', hint: '花了多少、买了什么' },
]

export const DEMO_TODO_KIND_LABELS: Record<DemoTodoKind, string> = {
  travel: '旅行准备',
  plan: '小计划',
  fitness: '健身',
  meal: '今天吃什么',
  expense: '我们的账单',
}

export const DEMO_MEAL_TYPE_OPTIONS: Array<{
  value: DemoMealType
  label: string
}> = [
  { value: 'breakfast', label: '早餐' },
  { value: 'lunch', label: '午餐' },
  { value: 'dinner', label: '晚餐' },
  { value: 'snack', label: '加餐' },
]

export const DEMO_MEAL_TYPE_LABELS: Record<DemoMealType, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

const TODO_KINDS = new Set<DemoTodoKind>([
  'travel',
  'plan',
  'fitness',
  'meal',
  'expense',
])
const MEAL_TYPES = new Set<DemoMealType>([
  'breakfast',
  'lunch',
  'dinner',
  'snack',
])
const DAY_MS = 24 * 60 * 60 * 1000

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeKind(value: unknown): DemoTodoKind {
  return typeof value === 'string' && TODO_KINDS.has(value as DemoTodoKind)
    ? (value as DemoTodoKind)
    : 'plan'
}

function normalizeMealType(value: unknown): DemoMealType | '' {
  return typeof value === 'string' && MEAL_TYPES.has(value as DemoMealType)
    ? (value as DemoMealType)
    : ''
}

function normalizeDate(value: unknown): string {
  const text = normalizeText(value)
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : ''
}

function normalizePositiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value)
    : 0
}

function normalizeAmount(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.round(value * 100) / 100
    : 0
}

function normalizeChecklist(
  items: DemoTodoInput['checklist'],
  idPrefix: string,
  nowMs: number,
): DemoTodoChecklistItem[] {
  if (!Array.isArray(items)) return []

  const seen = new Set<string>()
  return items
    .map((item, index) => ({
      id: `${idPrefix}-check-${nowMs}-${index}`,
      text: normalizeText(item.text),
      done: item.done === true,
    }))
    .filter((item) => {
      if (!item.text || seen.has(item.text)) return false
      seen.add(item.text)
      return true
    })
}

function normalizeInput(
  input: DemoTodoInput,
  idPrefix: string,
  nowMs: number,
): Omit<DemoTodoItem, 'id' | 'createdAt' | 'updatedAt'> {
  const kind = normalizeKind(input.kind)
  return {
    kind,
    title: normalizeText(input.title),
    note: normalizeText(input.note),
    done: kind === 'expense',
    dueDate: normalizeDate(input.dueDate),
    destination: kind === 'travel' ? normalizeText(input.destination) : '',
    checklist:
      kind === 'travel'
        ? normalizeChecklist(input.checklist, idPrefix, nowMs)
        : [],
    exercise: kind === 'fitness' ? normalizeText(input.exercise) : '',
    durationMinutes:
      kind === 'fitness' ? normalizePositiveInteger(input.durationMinutes) : 0,
    calories: kind === 'fitness' ? normalizePositiveInteger(input.calories) : 0,
    mealType: kind === 'meal' ? normalizeMealType(input.mealType) : '',
    amount: kind === 'expense' ? normalizeAmount(input.amount) : 0,
    merchant: kind === 'expense' ? normalizeText(input.merchant) : '',
  }
}

export function createDemoTodoItem(
  input: DemoTodoInput,
  nowMs = Date.now(),
  idGenerator = () => `todo-${nowMs}`,
): DemoTodoItem {
  const id = idGenerator()
  return {
    id,
    ...normalizeInput(input, id, nowMs),
    createdAt: new Date(nowMs).toISOString(),
  }
}

export function updateDemoTodoItem(
  item: DemoTodoItem,
  input: DemoTodoInput,
  nowMs = Date.now(),
): DemoTodoItem {
  const previousChecklist = new Map(
    item.checklist.map((checklistItem) => [checklistItem.text, checklistItem]),
  )
  const next = normalizeInput(input, item.id, nowMs)
  next.checklist = next.checklist.map((checklistItem) => {
    const previous = previousChecklist.get(checklistItem.text)
    return previous
      ? { ...checklistItem, id: previous.id, done: previous.done }
      : checklistItem
  })

  return {
    ...next,
    id: item.id,
    done:
      next.kind === item.kind
        ? item.done
        : next.kind === 'expense',
    createdAt: item.createdAt,
    updatedAt: new Date(nowMs).toISOString(),
  }
}

export function normalizeDemoTodoItem(
  item: DemoTodoItem,
  nowMs = Date.now(),
): DemoTodoItem {
  const id = item.id || `todo-${nowMs}`
  const normalized = normalizeInput(
    {
      kind: item.kind,
      title: item.title,
      note: item.note,
      dueDate: item.dueDate,
      destination: item.destination,
      checklist: Array.isArray(item.checklist) ? item.checklist : [],
      exercise: item.exercise,
      durationMinutes: item.durationMinutes,
      calories: item.calories,
      mealType: item.mealType,
      amount: item.amount,
      merchant: item.merchant,
    },
    id,
    nowMs,
  )
  const previousChecklist = new Map(
    (Array.isArray(item.checklist) ? item.checklist : []).map((checklistItem) => [
      normalizeText(checklistItem.text),
      checklistItem,
    ]),
  )

  return {
    ...normalized,
    id,
    done: normalized.kind === 'expense' ? item.done !== false : item.done === true,
    checklist: normalized.checklist.map((checklistItem) => {
      const previous = previousChecklist.get(checklistItem.text)
      return previous
        ? { ...checklistItem, id: previous.id || checklistItem.id, done: previous.done === true }
        : checklistItem
    }),
    createdAt: item.createdAt || new Date(nowMs).toISOString(),
    ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}),
  }
}

export function estimateDemoTodoCalories(
  exercise: string,
  durationMinutes: number,
): number {
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) return 0

  const normalized = exercise.trim().toLowerCase()
  const rate = normalized.includes('跳绳')
    ? 10
    : normalized.includes('跑')
      ? 8
      : normalized.includes('游泳')
        ? 7
        : normalized.includes('骑') || normalized.includes('单车')
          ? 6
          : normalized.includes('力量') || normalized.includes('训练')
            ? 5
            : normalized.includes('快走') || normalized.includes('走')
              ? 4
              : normalized.includes('瑜伽')
                ? 3
                : 4.5

  return Math.round(durationMinutes * rate)
}

export function parseDemoTodoChecklist(text: string): Array<{ text: string }> {
  return text
    .split('\n')
    .map((line) => line.replace(/^[-*•]\s*/, '').trim())
    .filter(Boolean)
    .map((item) => ({ text: item }))
}

export function formatDemoTodoChecklist(items: DemoTodoChecklistItem[]): string {
  return items.map((item) => item.text).join('\n')
}

export function createDemoTodoSeedItems(nowMs = Date.now()): DemoTodoItem[] {
  const dateKey = (offset: number) =>
    new Date(nowMs + offset * DAY_MS).toISOString().slice(0, 10)

  return [
    createDemoTodoItem(
      {
        kind: 'travel',
        title: '去大理前，把行李收好',
        destination: '大理',
        dueDate: dateKey(7),
        note: '不赶行程，留一点时间在洱海边发呆。',
        checklist: [
          { text: '身份证和驾驶证' },
          { text: '充电器 / 充电宝' },
          { text: '常用药和创可贴' },
          { text: '防晒和薄外套' },
        ],
      },
      nowMs - 5 * DAY_MS,
      () => 'demo-todo-dali',
    ),
    createDemoTodoItem(
      {
        kind: 'plan',
        title: '周末把换季衣服整理出来',
        dueDate: dateKey(2),
        note: '厚的收进储物箱，留两件薄外套。',
      },
      nowMs - 4 * DAY_MS,
      () => 'demo-todo-closet',
    ),
    createDemoTodoItem(
      {
        kind: 'fitness',
        title: '晚饭前快走 30 分钟',
        exercise: '快走',
        durationMinutes: 30,
        calories: 180,
        dueDate: dateKey(0),
        note: '只作日常记录，不是医学建议。',
      },
      nowMs - 3 * DAY_MS,
      () => 'demo-todo-walk',
    ),
    createDemoTodoItem(
      {
        kind: 'meal',
        title: '今晚吃番茄牛腩',
        mealType: 'dinner',
        note: '冰箱里有牛腩和番茄，再买一把小葱。',
        dueDate: dateKey(0),
      },
      nowMs - 2 * DAY_MS,
      () => 'demo-todo-dinner',
    ),
    createDemoTodoItem(
      {
        kind: 'expense',
        title: '盒马采购',
        amount: 126.5,
        merchant: '盒马',
        note: '牛奶、鸡蛋、番茄、猫砂。',
        dueDate: dateKey(-1),
      },
      nowMs - DAY_MS,
      () => 'demo-todo-grocery',
    ),
  ]
}
