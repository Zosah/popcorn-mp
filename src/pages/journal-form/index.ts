import {
  DEMO_NOTE_CATEGORY_LABELS,
  type DemoJournalEntryInput,
  type DemoJournalKind,
  type DemoJournalVisibility,
  type DemoNoteCategory,
} from '../../domain/demo-journal'
import {
  addDemoJournalEntry,
  getDemoJournalEntry,
  updateDemoJournalEntry,
} from '../../services/demo-journal'
import { navigateBackOrTab } from '../../utils/demo-navigation'

const NOTE_CATEGORY_OPTIONS = Object.entries(DEMO_NOTE_CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as DemoNoteCategory, label }),
)

Page({
  data: {
    saving: false,
    editingEntryId: '',
    kind: 'moment' as DemoJournalKind,
    pageTitle: '今天，想记下什么？',
    pageCopy: '不用写得完整，一句话也能把这个瞬间留下来。',
    saveText: '把这一刻记下来',
    category: 'home' as DemoNoteCategory,
    categoryIndex: 0,
    categoryLabels: NOTE_CATEGORY_OPTIONS.map((item) => item.label),
    visibility: 'space' as DemoJournalVisibility,
    form: {
      title: '',
      content: '',
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    const requestedKind: DemoJournalKind = options.kind === 'note' ? 'note' : 'moment'
    const entry = id ? getDemoJournalEntry(id) : undefined
    if (id && !entry) {
      wx.showToast({ title: '这条记录不存在', icon: 'none' })
      navigateBackOrTab('/pages/journal/index')
      return
    }

    const kind = entry?.kind ?? requestedKind
    const category = entry?.category ?? 'home'
    const categoryIndex = Math.max(
      0,
      NOTE_CATEGORY_OPTIONS.findIndex((item) => item.value === category),
    )
    const isNote = kind === 'note'
    const pageTitle = entry
      ? isNote
        ? '把这份记录，再写清楚一点'
        : '把这一刻，再写清楚一点'
      : isNote
        ? '把重要的事，收在这里'
        : '今天，想记下什么？'
    const pageCopy = isNote
      ? '写下需要长期保存的信息，之后仍可以修改或删除。'
      : '不用写得完整，一句话也能把这个瞬间留下来。'

    this.setData({
      editingEntryId: entry?.id ?? '',
      kind,
      pageTitle,
      pageCopy,
      saveText: entry ? '保存修改' : isNote ? '保存重要记录' : '把这一刻记下来',
      category,
      categoryIndex,
      visibility: entry?.visibility ?? 'space',
      form: {
        title: entry?.title ?? '',
        content: entry?.content ?? '',
      },
    })
    wx.setNavigationBarTitle({
      title: entry ? (isNote ? '编辑重要记录' : '编辑记录') : isNote ? '存一份' : '记一下',
    })
  },

  onBack() {
    navigateBackOrTab('/pages/journal/index')
  },

  onTitleInput(event: { detail: { value: string } }) {
    this.setData({ 'form.title': event.detail.value })
  },

  onContentInput(event: { detail: { value: string } }) {
    this.setData({ 'form.content': event.detail.value })
  },

  onCategoryChange(event: { detail: { value: string } }) {
    const categoryIndex = Number(event.detail.value)
    const option = NOTE_CATEGORY_OPTIONS[categoryIndex]
    if (!option) return
    this.setData({ categoryIndex, category: option.value })
  },

  onVisibilityChange(event: {
    currentTarget: { dataset: { value: DemoJournalVisibility } }
  }) {
    this.setData({ visibility: event.currentTarget.dataset.value })
  },

  onSave() {
    const title = this.data.form.title.trim()
    if (!title) {
      wx.showToast({ title: '先写一句标题吧', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    const input: DemoJournalEntryInput = {
      title,
      content: this.data.form.content,
      visibility: this.data.visibility,
      kind: this.data.kind,
      ...(this.data.kind === 'note' ? { category: this.data.category } : {}),
    }
    if (this.data.editingEntryId) {
      updateDemoJournalEntry(this.data.editingEntryId, input)
    } else {
      addDemoJournalEntry(input)
    }
    wx.showToast({
      title: this.data.editingEntryId ? '修改已保存' : '已经记下来了',
      icon: 'success',
    })
    navigateBackOrTab('/pages/journal/index')
  },
})
