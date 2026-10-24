import {
  DEMO_MEAL_TYPE_LABELS,
  DEMO_TODO_KIND_LABELS,
  DEMO_TODO_KIND_OPTIONS,
  type DemoTodoChecklistItem,
  type DemoTodoItem,
  type DemoTodoKind,
} from '../../domain/demo-todo'
import {
  listDemoTodoItems,
  removeDemoTodoItem,
  toggleDemoTodoChecklistItem,
  toggleDemoTodoItem,
} from '../../services/demo-todo'
import { navigateBackOrTab } from '../../utils/demo-navigation'

type TodoFilterValue = DemoTodoKind | 'all'

interface TodoFilterView {
  value: TodoFilterValue
  label: string
  icon: string
  count: number
}

interface TodoChecklistView extends DemoTodoChecklistItem {
  number: string
}

interface TodoItemView {
  id: string
  kind: DemoTodoKind
  kindLabel: string
  kindIcon: string
  title: string
  note: string
  done: boolean
  meta: string
  dateLabel: string
  overdue: boolean
  checklist: TodoChecklistView[]
  checklistDone: number
  checklistTotal: number
  checklistText: string
}

const MEAL_IDEAS = [
  '番茄牛腩配米饭',
  '葱油拌面和一盘小青菜',
  '番茄鸡蛋面',
  '清炒时蔬配煎蛋',
  '一锅热汤和烤面包',
] as const

const ALL_FILTER: TodoFilterView = {
  value: 'all',
  label: '全部',
  icon: 'notebook-tabs',
  count: 0,
}

function localDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseDateKey(value: string): Date | undefined {
  const parts = value.split('-').map(Number)
  if (parts.length !== 3) return undefined
  const [year, month, day] = parts
  if (!year || !month || !day) return undefined
  return new Date(year, month - 1, day)
}

function formatDateLabel(value: string): string {
  if (!value) return ''
  const date = parseDateKey(value)
  if (!date) return value

  const today = new Date()
  const todayKey = localDateKey(today)
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1)
  if (value === todayKey) return '今天'
  if (value === localDateKey(tomorrow)) return '明天'

  const prefix = date.getFullYear() === today.getFullYear()
    ? ''
    : `${date.getFullYear()}年`
  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日`
}

function formatAmount(amount: number): string {
  return amount > 0 ? `¥${amount.toFixed(2)}` : '未记金额'
}

function itemMeta(item: DemoTodoItem): string {
  const dateLabel = formatDateLabel(item.dueDate)
  switch (item.kind) {
    case 'travel': {
      const parts = [
        item.destination ? `去${item.destination}` : '旅行准备',
        dateLabel,
        item.checklist.length
          ? `${item.checklist.filter((entry) => entry.done).length}/${item.checklist.length} 已准备`
          : '',
      ]
      return parts.filter(Boolean).join(' · ')
    }
    case 'fitness': {
      const parts = [
        item.exercise || '运动',
        item.durationMinutes ? `${item.durationMinutes} 分钟` : '',
        item.calories ? `${item.calories} kcal` : '',
        dateLabel,
      ]
      return parts.filter(Boolean).join(' · ')
    }
    case 'meal': {
      const parts = [
        item.mealType ? DEMO_MEAL_TYPE_LABELS[item.mealType] : '今天吃什么',
        dateLabel,
      ]
      return parts.filter(Boolean).join(' · ')
    }
    case 'expense': {
      const parts = [formatAmount(item.amount), item.merchant, dateLabel]
      return parts.filter(Boolean).join(' · ')
    }
    case 'plan':
    default:
      return dateLabel || '找时间慢慢做'
  }
}

function itemToView(item: DemoTodoItem): TodoItemView {
  const checklistDone = item.checklist.filter((entry) => entry.done).length
  const dateLabel = formatDateLabel(item.dueDate)
  return {
    id: item.id,
    kind: item.kind,
    kindLabel: DEMO_TODO_KIND_LABELS[item.kind],
    kindIcon:
      DEMO_TODO_KIND_OPTIONS.find((option) => option.value === item.kind)?.icon ??
      'notebook-tabs',
    title: item.title,
    note: item.note,
    done: item.done,
    meta: itemMeta(item),
    dateLabel,
    overdue: !item.done && Boolean(item.dueDate) && item.dueDate < localDateKey(new Date()),
    checklist: item.checklist.map((entry, index) => ({
      ...entry,
      number: String(index + 1).padStart(2, '0'),
    })),
    checklistDone,
    checklistTotal: item.checklist.length,
    checklistText: item.checklist.length
      ? `${checklistDone}/${item.checklist.length} 已准备`
      : '',
  }
}

function buildFilters(items: DemoTodoItem[]): TodoFilterView[] {
  const pendingByKind = new Map<DemoTodoKind, number>()
  for (const item of items) {
    if (item.done) continue
    pendingByKind.set(item.kind, (pendingByKind.get(item.kind) ?? 0) + 1)
  }

  return [
    {
      ...ALL_FILTER,
      count: items.filter((item) => !item.done).length,
    },
    ...DEMO_TODO_KIND_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
      icon: option.icon,
      count: pendingByKind.get(option.value) ?? 0,
    })),
  ]
}

Page({
  data: {
    activeKind: 'all' as TodoFilterValue,
    activeLabel: '全部事项',
    emptyIcon: 'list-todo',
    filters: [] as TodoFilterView[],
    items: [] as TodoItemView[],
    pendingCount: 0,
    completedCount: 0,
    totalCount: 0,
    mealIdea: (MEAL_IDEAS[0] ?? '番茄牛腩配米饭') as string,
    mealIdeaIndex: 0,
    expenseTotalLabel: '¥0.00',
    expenseCount: 0,
    emptyTitle: '这里还没有待办',
    emptyCopy: '先记下一件想做的事，完成一件就少一件。',
  },

  onLoad(options: Record<string, string | undefined>) {
    const kind = options.kind
    const allowed = DEMO_TODO_KIND_OPTIONS.some((option) => option.value === kind)
    if (allowed && kind) {
      this.setData({
        activeKind: kind as DemoTodoKind,
        activeLabel: DEMO_TODO_KIND_LABELS[kind as DemoTodoKind],
      })
    }
  },

  onShow() {
    this.refresh()
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },

  refresh() {
    const allItems = listDemoTodoItems()
    const filters = buildFilters(allItems)
    const selected = filters.find((filter) => filter.value === this.data.activeKind)
    const visible =
      this.data.activeKind === 'all'
        ? allItems
        : allItems.filter((item) => item.kind === this.data.activeKind)
    const expenses = allItems.filter((item) => item.kind === 'expense')
    const expenseTotal = expenses.reduce((total, item) => total + item.amount, 0)

    this.setData({
      filters,
      activeLabel: selected?.label ?? '全部事项',
      emptyIcon: selected && selected.value !== 'all' ? selected.icon : 'list-todo',
      items: visible.map(itemToView),
      pendingCount: allItems.filter((item) => !item.done).length,
      completedCount: allItems.filter((item) => item.done).length,
      totalCount: allItems.length,
      expenseTotalLabel: `¥${expenseTotal.toFixed(2)}`,
      expenseCount: expenses.length,
      emptyTitle: selected && selected.value !== 'all'
        ? `${selected.label}还是空的`
        : '这里还没有待办',
      emptyCopy:
        selected && selected.value !== 'all'
          ? '把想到的一件小事写下来，之后就不会忘记。'
          : '先记下一件想做的事，完成一件就少一件。',
    })
  },

  onSelectFilter(event: {
    currentTarget: { dataset: { kind?: TodoFilterValue } }
  }) {
    const kind = event.currentTarget.dataset.kind
    if (!kind) return
    this.setData({ activeKind: kind })
    this.refresh()
  },

  onShuffleMealIdea() {
    const nextIndex = (this.data.mealIdeaIndex + 1) % MEAL_IDEAS.length
    this.setData({
      mealIdeaIndex: nextIndex,
      mealIdea: MEAL_IDEAS[nextIndex] ?? MEAL_IDEAS[0],
    })
  },

  onUseMealIdea() {
    wx.navigateTo({
      url: `/pages/todo-form/index?kind=meal&title=${encodeURIComponent(this.data.mealIdea)}`,
    })
  },

  onCreate() {
    const kind = this.data.activeKind === 'all' ? 'plan' : this.data.activeKind
    wx.navigateTo({ url: `/pages/todo-form/index?kind=${kind}` })
  },

  onEditItem(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/todo-form/index?id=${encodeURIComponent(id)}` })
  },

  onToggleItem(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    try {
      toggleDemoTodoItem(id)
      this.refresh()
    } catch {
      wx.showToast({ title: '这条待办找不到了', icon: 'none' })
    }
  },

  onToggleChecklist(event: {
    currentTarget: { dataset: { parentId?: string; checklistId?: string } }
  }) {
    const { parentId, checklistId } = event.currentTarget.dataset
    if (!parentId || !checklistId) return
    try {
      toggleDemoTodoChecklistItem(parentId, checklistId)
      this.refresh()
    } catch {
      wx.showToast({ title: '这个准备项找不到了', icon: 'none' })
    }
  },

  onLongPressItem(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (result) => {
        if (result.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/todo-form/index?id=${encodeURIComponent(id)}` })
          return
        }
        wx.showModal({
          title: '删除这条待办？',
          content: '删除后无法恢复。',
          confirmText: '删除',
          confirmColor: '#e8695c',
          success: (modal) => {
            if (!modal.confirm) return
            removeDemoTodoItem(id)
            this.refresh()
            wx.showToast({ title: '已删除', icon: 'success' })
          },
        })
      },
    })
  },
})
