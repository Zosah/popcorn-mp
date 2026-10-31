import { appConfig } from '../../config/env'
import {
  DEMO_MEAL_TYPE_OPTIONS,
  DEMO_TODO_KIND_OPTIONS,
  estimateDemoTodoCalories,
  formatDemoTodoChecklist,
  parseDemoTodoChecklist,
  type DemoMealType,
  type DemoTodoChecklistItem,
  type DemoTodoInput,
  type DemoTodoKind,
} from '../../domain/demo-todo'
import {
  formatTodoDateDisplay,
  getTodoTodayKey,
} from '../../domain/todo-date'
import { todoGateway } from '../../services/todo'
import {
  getTodoErrorMessage,
  isTodoVersionConflict,
} from '../../services/todo-gateway'

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

function backToTodo(): void {
  if (getCurrentPages().length > 1) {
    wx.navigateBack()
    return
  }
  wx.reLaunch({ url: '/pages/todo/index' })
}

Page({
  data: {
    saving: false,
    loading: false,
    loadError: '',
    itemId: '',
    version: 0,
    pageTitle: '记一件要做的事',
    saveText: '放进待办',
    storageCopy: appConfig.demoMode
      ? '所有内容只保存在这台手机。'
      : '保存后会同步给共同空间里的成员。',
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
    currentChecklist: [] as DemoTodoChecklistItem[],
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
      wx.setNavigationBarTitle({ title: '编辑待办' })
      this.setData({
        itemId: id,
        loading: true,
        pageTitle: '把这件事再整理一下',
        saveText: '保存修改',
      })
      void this.loadItem(id)
      return
    }

    const kind = kindAllowed(options.kind) ? options.kind : 'plan'
    const defaultDate =
      kind === 'fitness' || kind === 'meal' || kind === 'expense'
        ? getTodoTodayKey()
        : ''
    this.setData({
      'form.kind': kind,
      'form.title': (options.title ?? '').trim(),
      'form.dueDate': defaultDate,
      dateDisplay: formatTodoDateDisplay(defaultDate),
    })
    this.applyKindCopy(kind)
  },

  async loadItem(id: string) {
    this.setData({ loading: true, loadError: '' })
    try {
      const item = await todoGateway.get(id)
      if (!item) {
        wx.showToast({ title: '这条待办不存在', icon: 'none' })
        backToTodo()
        return
      }

      this.setData({
        itemId: item.id,
        version: item.version,
        currentChecklist: item.checklist,
        pageTitle: '把这件事再整理一下',
        saveText: '保存修改',
        dateDisplay: formatTodoDateDisplay(item.dueDate),
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
          amount: item.amount ? item.amount.toFixed(2) : '',
          merchant: item.merchant,
        },
      })
      this.applyKindCopy(item.kind)
    } catch (error) {
      this.setData({
        loadError: getTodoErrorMessage(error, '这条待办暂时没有加载出来'),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onRetryLoad() {
    if (this.data.itemId) void this.loadItem(this.data.itemId)
  },

  onBack() {
    backToTodo()
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
      dateDisplay: formatTodoDateDisplay(value),
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
    const previousChecklist = new Map(
      this.data.currentChecklist.map((item) => [item.text, item]),
    )
    return {
      kind: form.kind,
      title: form.title,
      note: form.note,
      dueDate: form.dueDate,
      destination: form.destination,
      checklist: parseDemoTodoChecklist(form.checklistText).map((item) => {
        const previous = previousChecklist.get(item.text)
        return {
          ...(previous?.id ? { id: previous.id } : {}),
          text: item.text,
          done: previous?.done === true,
        }
      }),
      exercise: form.exercise,
      durationMinutes: Number(form.durationMinutes || 0),
      calories: Number(form.calories || 0),
      mealType: form.mealType,
      amount: Number(form.amount || 0),
      merchant: form.merchant,
    }
  },

  async onSave() {
    if (this.data.saving || this.data.loading || this.data.loadError) return
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
      (!Number.isFinite(calories) || calories < 0 || calories > 20000)
    ) {
      wx.showToast({ title: '热量请填 0–20000 kcal', icon: 'none' })
      return
    }
    if (
      form.kind === 'expense' &&
      (!Number.isFinite(amount) || amount <= 0 || amount > 999999999)
    ) {
      wx.showToast({ title: '请填写有效金额', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      const input = this.buildInput()
      if (this.data.itemId) {
        await todoGateway.update(this.data.itemId, input, this.data.version)
      } else {
        await todoGateway.create(input)
      }

      wx.showToast({
        title: this.data.itemId
          ? '修改已保存'
          : form.kind === 'expense'
            ? '账单已记下'
            : '已经放进待办',
        icon: 'success',
      })
      backToTodo()
    } catch (error) {
      if (isTodoVersionConflict(error) && this.data.itemId) {
        wx.showToast({ title: '内容已更新，已加载最新版本', icon: 'none' })
        await this.loadItem(this.data.itemId)
      } else {
        wx.showToast({
          title: getTodoErrorMessage(error, '保存失败，请稍后再试'),
          icon: 'none',
        })
      }
    } finally {
      this.setData({ saving: false })
    }
  },

  onDelete() {
    if (!this.data.itemId || this.data.saving) return
    wx.showModal({
      title: '删除这条记录？',
      content: '删除后会从你们的共同空间隐藏。',
      confirmText: '删除',
      confirmColor: '#e8695c',
      success: (result) => {
        if (result.confirm) void this.deleteItem()
      },
    })
  },

  async deleteItem() {
    if (!this.data.itemId) return
    this.setData({ saving: true })
    try {
      await todoGateway.remove(this.data.itemId, this.data.version)
      wx.showToast({ title: '已删除', icon: 'success' })
      backToTodo()
    } catch (error) {
      if (isTodoVersionConflict(error)) {
        wx.showToast({ title: '内容已更新，已加载最新版本', icon: 'none' })
        await this.loadItem(this.data.itemId)
      } else {
        wx.showToast({
          title: getTodoErrorMessage(error, '删除没有完成'),
          icon: 'none',
        })
      }
    } finally {
      this.setData({ saving: false })
    }
  },
})
