import {
  DEMO_MEAL_TYPE_OPTIONS,
  DEMO_TODO_KIND_OPTIONS,
  estimateDemoTodoCalories,
  formatDemoTodoChecklist,
  parseDemoTodoChecklist,
  type DemoMealType,
  type DemoTodoInput,
  type DemoTodoKind,
} from '../../domain/demo-todo'
import {
  addDemoTodoItem,
  getDemoTodoItem,
  removeDemoTodoItem,
  updateDemoTodoItem,
} from '../../services/demo-todo'
import { navigateBackOrTab } from '../../utils/demo-navigation'

type TodoFormField =
  | 'title'
  | 'note'
  | 'destination'
  | 'checklistText'
  | 'exercise'
  | 'durationMinutes'
  | 'calories'
  | 'amount'
  | 'merchant'

const KIND_COPY: Record<
  DemoTodoKind,
  {
    titleLabel: string
    titlePlaceholder: string
    dateLabel: string
    noteLabel: string
    notePlaceholder: string
  }
> = {
  travel: {
    titleLabel: '要准备的事',
    titlePlaceholder: '例如：去大理前，把行李收好',
    dateLabel: '出发日期',
    noteLabel: '旅途备注',
    notePlaceholder: '想去哪里、和谁去，或者要留意的安排',
  },
  plan: {
    titleLabel: '想做什么',
    titlePlaceholder: '例如：周末把换季衣服整理出来',
    dateLabel: '计划日期',
    noteLabel: '补充说明',
    notePlaceholder: '为什么想做，或者需要提前准备什么',
  },
  fitness: {
    titleLabel: '这次练什么',
    titlePlaceholder: '例如：晚饭前快走 30 分钟',
    dateLabel: '计划日期',
    noteLabel: '训练备注',
    notePlaceholder: '身体感受、路线或下次想调整的地方',
  },
  meal: {
    titleLabel: '吃什么',
    titlePlaceholder: '例如：今晚吃番茄牛腩',
    dateLabel: '记录日期',
    noteLabel: '这一餐的备注',
    notePlaceholder: '想配什么菜，或者下次想试什么',
  },
  expense: {
    titleLabel: '买了什么',
    titlePlaceholder: '例如：盒马采购',
    dateLabel: '消费日期',
    noteLabel: '账单备注',
    notePlaceholder: '买了牛奶、鸡蛋、番茄和猫砂',
  },
}

function kindAllowed(value: string | undefined): value is DemoTodoKind {
  return DEMO_TODO_KIND_OPTIONS.some((option) => option.value === value)
}

function todayKey(): string {
  const date = new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

function formatDateDisplay(value: string): string {
  if (!value) return '选择日期'
  const parts = value.split('-').map(Number)
  if (parts.length !== 3) return value
  const [year, month, day] = parts
  if (!year || !month || !day) return value
  return `${year}年${month}月${day}日`
}

Page({
  data: {
    saving: false,
    itemId: '',
    pageTitle: '记一件要做的事',
    saveText: '放进待办',
    kindOptions: DEMO_TODO_KIND_OPTIONS,
    mealTypeOptions: DEMO_MEAL_TYPE_OPTIONS,
    kindHint: '旅行准备 · 目的地、清单和物品',
    kindIcon: 'list-todo',
    titleLabel: KIND_COPY.plan.titleLabel,
    titlePlaceholder: KIND_COPY.plan.titlePlaceholder,
    dateLabel: KIND_COPY.plan.dateLabel,
    noteLabel: KIND_COPY.plan.noteLabel,
    notePlaceholder: KIND_COPY.plan.notePlaceholder,
    dateDisplay: '选择日期',
    form: {
      kind: 'plan' as DemoTodoKind,
      title: '',
      note: '',
      dueDate: '',
      destination: '',
      checklistText: '',
      exercise: '',
      durationMinutes: '',
      calories: '',
      mealType: 'dinner' as DemoMealType,
      amount: '',
      merchant: '',
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    if (id) {
      const item = getDemoTodoItem(id)
      if (!item) {
        wx.showToast({ title: '这条待办不存在', icon: 'none' })
        navigateBackOrTab('/pages/profile/index')
        return
      }

      this.setData({
        itemId: item.id,
        pageTitle: '把这件事再整理一下',
        saveText: '保存修改',
        dateDisplay: formatDateDisplay(item.dueDate),
        form: {
          kind: item.kind,
          title: item.title,
          note: item.note,
          dueDate: item.dueDate,
          destination: item.destination,
          checklistText: formatDemoTodoChecklist(item.checklist),
          exercise: item.exercise,
          durationMinutes: item.durationMinutes ? String(item.durationMinutes) : '',
          calories: item.calories ? String(item.calories) : '',
          mealType: item.mealType || 'dinner',
          amount: item.amount ? String(item.amount) : '',
          merchant: item.merchant,
        },
      })
      this.applyKindCopy(item.kind)
      wx.setNavigationBarTitle({ title: '编辑待办' })
      return
    }

    const kind = kindAllowed(options.kind) ? options.kind : 'plan'
    const defaultDate =
      kind === 'fitness' || kind === 'meal' || kind === 'expense'
        ? todayKey()
        : ''
    this.setData({
      'form.kind': kind,
      'form.title': (options.title ?? '').trim(),
      'form.dueDate': defaultDate,
      dateDisplay: formatDateDisplay(defaultDate),
    })
    this.applyKindCopy(kind)
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },

  applyKindCopy(kind: DemoTodoKind) {
    const option = DEMO_TODO_KIND_OPTIONS.find((entry) => entry.value === kind)
    const copy = KIND_COPY[kind]
    this.setData({
      kindHint: option ? `${option.label} · ${option.hint}` : '',
      kindIcon: option?.icon ?? 'list-todo',
      titleLabel: copy.titleLabel,
      titlePlaceholder: copy.titlePlaceholder,
      dateLabel: copy.dateLabel,
      noteLabel: copy.noteLabel,
      notePlaceholder: copy.notePlaceholder,
    })
  },

  onSelectKind(event: {
    currentTarget: { dataset: { kind?: DemoTodoKind } }
  }) {
    const kind = event.currentTarget.dataset.kind
    if (!kind || !kindAllowed(kind)) return
    this.setData({ 'form.kind': kind })
    this.applyKindCopy(kind)
  },

  onFieldInput(event: {
    currentTarget: { dataset: { field?: TodoFormField } }
    detail: { value: string }
  }) {
    const field = event.currentTarget.dataset.field
    if (!field) return
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  onSelectMealType(event: {
    currentTarget: { dataset: { value?: DemoMealType } }
  }) {
    const value = event.currentTarget.dataset.value
    if (!value) return
    this.setData({ 'form.mealType': value })
  },

  onDateChange(event: { detail: { value: string } }) {
    const value = event.detail.value
    this.setData({
      'form.dueDate': value,
      dateDisplay: formatDateDisplay(value),
    })
  },

  onEstimateCalories() {
    const durationMinutes = Number(this.data.form.durationMinutes || 0)
    if (!Number.isFinite(durationMinutes) || durationMinutes <= 0) {
      wx.showToast({ title: '先填写运动时长', icon: 'none' })
      return
    }

    const exercise = this.data.form.exercise || this.data.form.title
    if (!exercise.trim()) {
      wx.showToast({ title: '先填写运动名称', icon: 'none' })
      return
    }

    const calories = estimateDemoTodoCalories(exercise, durationMinutes)
    this.setData({ 'form.calories': String(calories) })
    wx.showToast({ title: '已粗算，可手动调整', icon: 'none' })
  },

  onClearDate() {
    this.setData({
      'form.dueDate': '',
      dateDisplay: '选择日期',
    })
  },

  buildInput(): DemoTodoInput {
    const form = this.data.form
    return {
      kind: form.kind,
      title: form.title,
      note: form.note,
      dueDate: form.dueDate,
      destination: form.destination,
      checklist: parseDemoTodoChecklist(form.checklistText),
      exercise: form.exercise,
      durationMinutes: Number(form.durationMinutes || 0),
      calories: Number(form.calories || 0),
      mealType: form.mealType,
      amount: Number(form.amount || 0),
      merchant: form.merchant,
    }
  },

  onSave() {
    const form = this.data.form
    const durationMinutes = Number(form.durationMinutes || 0)
    const calories = Number(form.calories || 0)
    const amount = Number(form.amount || 0)

    if (!form.title.trim()) {
      wx.showToast({ title: '先写下这件事吧', icon: 'none' })
      return
    }
    if (
      form.kind === 'fitness' &&
      (!Number.isFinite(durationMinutes) ||
        durationMinutes < 0 ||
        durationMinutes > 1440)
    ) {
      wx.showToast({ title: '时长请填 0–1440 分钟', icon: 'none' })
      return
    }
    if (
      form.kind === 'fitness' &&
      (!Number.isFinite(calories) || calories < 0 || calories > 10000)
    ) {
      wx.showToast({ title: '热量请填 0–10000 kcal', icon: 'none' })
      return
    }
    if (
      form.kind === 'expense' &&
      (!Number.isFinite(amount) || amount <= 0 || amount > 9999999)
    ) {
      wx.showToast({ title: '请填写有效金额', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    const input = this.buildInput()
    if (this.data.itemId) {
      updateDemoTodoItem(this.data.itemId, input)
    } else {
      addDemoTodoItem(input)
    }

    wx.showToast({
      title: this.data.itemId
        ? '修改已保存'
        : form.kind === 'expense'
          ? '账单已记下'
          : '已经放进待办',
      icon: 'success',
    })
    navigateBackOrTab('/pages/profile/index')
  },

  onDelete() {
    if (!this.data.itemId) return
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后无法恢复。',
      confirmText: '删除',
      confirmColor: '#e8695c',
      success: (result) => {
        if (!result.confirm) return
        removeDemoTodoItem(this.data.itemId)
        wx.showToast({ title: '已删除', icon: 'success' })
        navigateBackOrTab('/pages/profile/index')
      },
    })
  },
})
