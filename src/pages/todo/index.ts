import { appConfig } from '../../config/env'
import type { DemoTodoInput, DemoTodoKind, DemoTodoItem } from '../../domain/demo-todo'
import { getFeatureDefinition } from '../../domain/feature-catalog'
import { formatTodoDateLabel, isTodoOverdue } from '../../domain/todo-date'
import { hydrateAuthState } from '../../services/auth'
import { promptAuthGateIfNeeded, requireAuthForWrite } from '../../services/auth-preview'
import { readPageCache, writePageCache } from '../../services/page-cache'
import { todoGateway } from '../../services/todo'
import {
  getTodoErrorMessage,
  isTodoVersionConflict,
  type TodoItem,
  type TodoStatus,
} from '../../services/todo-gateway'
import { decodeQueryValue } from '../../utils/app-navigation'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

type TodoTagFilter = {
  value: string
  label: string
  count: number
  manageable: boolean
}

type TodoItemView = {
  id: string
  title: string
  note: string
  tag: string
  tagLabel: string
  done: boolean
  dateLabel: string
  overdue: boolean
}

type TodoTagGroup = {
  key: string
  label: string
  count: number
  items: TodoItemView[]
}

const ALL_TAGS = '__all__'
const UNTAGGED = '__untagged__'
const TODO_KINDS = new Set<DemoTodoKind>([
  'travel',
  'plan',
  'fitness',
  'meal',
  'expense',
])
const KIND_COPY: Record<DemoTodoKind, { title: string; copy: string; create: string }> = {
  plan: {
    title: '待办',
    copy: '想到的事，用自己的标签收好',
    create: '新建待办',
  },
  travel: {
    title: '旅行',
    copy: '目的地、出发准备和清单',
    create: '新建旅行',
  },
  fitness: {
    title: '健身',
    copy: '运动、时长和热量',
    create: '记一次运动',
  },
  meal: {
    title: '下厨',
    copy: '今天吃什么，收在厨房里',
    create: '记一餐',
  },
  expense: {
    title: '账单',
    copy: '花了多少，买了什么',
    create: '记一笔',
  },
}

const todoRequestGate = createRequestGate()
const TODO_PAGE_CACHE_KEY = 'todo:overview'

function normalizeKind(value: string | undefined): DemoTodoKind {
  return value && TODO_KINDS.has(value as DemoTodoKind)
    ? (value as DemoTodoKind)
    : 'plan'
}

function itemToView(item: TodoItem, showTag: boolean): TodoItemView {
  return {
    id: item.id,
    title: item.title,
    note: item.note,
    tag: item.tag,
    tagLabel: showTag ? item.tag || '未分类' : '',
    done: item.done,
    dateLabel: formatTodoDateLabel(item.dueDate),
    overdue: isTodoOverdue(item.dueDate, item.done),
  }
}

function toTodoInput(item: TodoItem, tag: string): DemoTodoInput {
  return {
    kind: item.kind,
    title: item.title,
    note: item.note,
    tag,
    dueDate: item.dueDate,
    destination: item.destination,
    checklist: item.checklist.map((entry) => ({
      id: entry.id,
      text: entry.text,
      done: entry.done,
    })),
    exercise: item.exercise,
    durationMinutes: item.durationMinutes,
    calories: item.calories,
    mealType: item.mealType,
    amount: item.amount,
    merchant: item.merchant,
  }
}

function computeTagFilters(items: TodoItem[], status: TodoStatus): TodoTagFilter[] {
  const statusItems = items.filter((item) =>
    status === 'completed' ? item.done : !item.done,
  )
  const counts = new Map<string, number>()
  let untagged = 0
  for (const item of statusItems) {
    if (item.tag) counts.set(item.tag, (counts.get(item.tag) ?? 0) + 1)
    else untagged += 1
  }
  return [
    { value: ALL_TAGS, label: '全部', count: statusItems.length, manageable: false },
    ...[...counts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([tag, count]) => ({
        value: tag,
        label: tag,
        count,
        manageable: true,
      })),
    ...(untagged
      ? [{ value: UNTAGGED, label: '未分类', count: untagged, manageable: false }]
      : []),
  ]
}

function buildTagGroups(items: TodoItem[]): TodoTagGroup[] {
  const grouped = new Map<string, TodoItem[]>()
  for (const item of items) {
    const key = item.tag || UNTAGGED
    const group = grouped.get(key) ?? []
    group.push(item)
    grouped.set(key, group)
  }
  return [...grouped.entries()]
    .map(([tag, groupItems]) => ({
      key: tag,
      label: tag === UNTAGGED ? '未分类' : tag,
      count: groupItems.length,
      items: groupItems.map((item) => itemToView(item, false)),
    }))
    .sort((left, right) => {
      if (left.key === UNTAGGED) return 1
      if (right.key === UNTAGGED) return -1
      return right.count - left.count || left.label.localeCompare(right.label)
    })
}

Page({
  data: {
    activeKind: 'plan' as DemoTodoKind,
    isPlanMode: true,
    pageTitle: KIND_COPY.plan.title,
    pageCopy: KIND_COPY.plan.copy,
    createText: KIND_COPY.plan.create,
    activeTag: ALL_TAGS,
    statusFilter: 'pending' as TodoStatus,
    tagFilters: [] as TodoTagFilter[],
    tagGroups: [] as TodoTagGroup[],
    flatItems: [] as TodoItemView[],
    allItems: [] as TodoItem[],
    loading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    loadError: '',
    mutating: false,
    totalCount: 0,
    pendingCount: 0,
    completedCount: 0,
    progressPercent: 0,
    visibleCount: 0,
    emptyTitle: '还没有待办',
    emptyCopy: '先记下一件想到的小事。',
  },

  onLoad(options: Record<string, string | undefined>) {
    const kind = normalizeKind(options.kind)
    const cached = readPageCache<Record<string, unknown>>(TODO_PAGE_CACHE_KEY)
    if (cached && (cached.value as { activeKind?: string }).activeKind === kind) {
      this.setData({
        ...cached.value,
        loading: false,
        hasLoaded: true,
        cacheFresh: cached.fresh,
        hasShown: false,
        mutating: false,
      })
    }
    const copy = KIND_COPY[kind]
    const feature = getFeatureDefinition(kind === 'plan' ? 'todo' : kind)
    const incomingTag = decodeQueryValue(options.tag ?? '').trim()
    this.setData({
      activeKind: kind,
      isPlanMode: kind === 'plan',
      pageTitle: feature?.label ?? copy.title,
      pageCopy: copy.copy,
      createText: copy.create,
      activeTag: kind === 'plan' ? incomingTag || ALL_TAGS : ALL_TAGS,
    })
  },

  onShow() {
    promptAuthGateIfNeeded()
    const firstShow = !this.data.hasShown
    if (firstShow) this.setData({ hasShown: true })
    if (firstShow && this.data.cacheFresh) return
    void this.refresh()
  },

  onPullDownRefresh() {
    void this.refresh(true)
  },

  async refresh(fromPullDown = false) {
    const sequence = todoRequestGate.begin()
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    const auth = await hydrateAuthState()
    if (!todoRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    if (!appConfig.demoMode && !auth.isLoggedIn) {
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.setData({
        tagFilters: [],
        tagGroups: [],
        flatItems: [],
        allItems: [],
        totalCount: 0,
        pendingCount: 0,
        completedCount: 0,
        progressPercent: 0,
        visibleCount: 0,
        loading: false,
        hasLoaded: true,
        cacheFresh: false,
        loadError: '',
        emptyTitle: '登录后同步待办',
        emptyCopy: '登录后，空间里的待办会来到这里。',
      })
      if (fromPullDown) wx.stopPullDownRefresh()
      promptAuthGateIfNeeded()
      return
    }

    const hasExistingData = this.data.allItems.length > 0
    this.setData({ loading: !hasExistingData, loadError: '' })
    try {
      const items = await todoGateway.list({ kinds: [this.data.activeKind] })
      if (!todoRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!todoRequestGate.isCurrent(sequence)) return
      this.render(items)
      this.setData({
        loading: false,
        hasLoaded: true,
        cacheFresh: true,
        loadError: '',
      }, () => this.cacheCurrentPage())
    } catch (error) {
      if (!todoRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!todoRequestGate.isCurrent(sequence)) return
      const message = getTodoErrorMessage(error, '待办暂时没有加载出来')
      this.setData({
        loading: false,
        hasLoaded: true,
        loadError: message,
      })
      if (this.data.allItems.length) {
        wx.showToast({ title: message, icon: 'none' })
      }
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  onRetryLoad() {
    void this.refresh()
  },

  render(
    items: TodoItem[],
    activeTag?: string,
    statusFilter?: TodoStatus,
  ) {
    const nextTag = activeTag ?? this.data.activeTag
    const nextStatus = statusFilter ?? this.data.statusFilter as TodoStatus
    const tagFilters = this.data.isPlanMode
      ? computeTagFilters(items, nextStatus)
      : []
    const validTag = nextTag === ALL_TAGS
      || tagFilters.some((filter) => filter.value === nextTag)
      ? nextTag
      : ALL_TAGS
    const statusItems = items.filter((item) =>
      nextStatus === 'completed' ? item.done : !item.done,
    )
    const visible = statusItems.filter((item) => {
      if (!this.data.isPlanMode || validTag === ALL_TAGS) return true
      if (validTag === UNTAGGED) return !item.tag
      return item.tag === validTag
    })
    const pendingCount = items.filter((item) => !item.done).length
    const completedCount = items.filter((item) => item.done).length
    const totalCount = items.length
    const activeFilter = tagFilters.find((filter) => filter.value === validTag)
    const emptyTitle = nextStatus === 'completed'
      ? '还没有完成的待办'
      : activeFilter && validTag !== ALL_TAGS
        ? `${activeFilter.label}还是空的`
        : '还没有待办'
    const emptyCopy = nextStatus === 'completed'
      ? '完成一件事之后，会收在这里。'
      : '先记下一件想到的小事。'

    this.setData({
      activeTag: validTag,
      tagFilters,
      tagGroups: this.data.isPlanMode && validTag === ALL_TAGS
        ? buildTagGroups(visible)
        : [],
      flatItems: !this.data.isPlanMode || validTag !== ALL_TAGS
        ? visible.map((item) => itemToView(item, this.data.isPlanMode && validTag === ALL_TAGS))
        : [],
      allItems: items,
      totalCount,
      pendingCount,
      completedCount,
      progressPercent: totalCount ? Math.round((completedCount / totalCount) * 100) : 0,
      visibleCount: visible.length,
      emptyTitle,
      emptyCopy,
    }, () => this.cacheCurrentPage())
  },

  cacheCurrentPage() {
    const data = this.data as unknown as Record<string, unknown>
    const {
      loading: _loading,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      mutating: _mutating,
      ...snapshot
    } = data
    writePageCache(TODO_PAGE_CACHE_KEY, {
      ...snapshot,
      mutating: false,
    })
  },

  onSelectTag(event: { currentTarget: { dataset: { tag?: string } } }) {
    const tag = event.currentTarget.dataset.tag
    if (!tag || this.data.mutating) return
    this.render(this.data.allItems, tag, this.data.statusFilter as TodoStatus)
  },

  onSelectStatus(event: { currentTarget: { dataset: { status?: TodoStatus } } }) {
    const status = event.currentTarget.dataset.status
    if (!status || status === this.data.statusFilter || this.data.mutating) return
    this.setData({ statusFilter: status })
    this.render(this.data.allItems, this.data.activeTag, status)
  },

  onCreate() {
    if (!requireAuthForWrite()) return
    const params = [`kind=${this.data.activeKind}`]
    if (
      this.data.isPlanMode
      && this.data.activeTag !== ALL_TAGS
      && this.data.activeTag !== UNTAGGED
    ) {
      params.push(`tag=${encodeURIComponent(this.data.activeTag)}`)
    }
    wx.navigateTo({ url: `/pages/todo-form/index?${params.join('&')}` })
  },

  onCreateTag() {
    if (!requireAuthForWrite() || this.data.mutating) return
    wx.showModal({
      title: '新标签',
      editable: true,
      placeholderText: '例如：突然想到',
      confirmText: '下一步',
      success: (result) => {
        if (!result.confirm) return
        const tag = (result.content ?? '').trim()
        if (!tag) return
        if (tag.length > 20) {
          wx.showToast({ title: '标签最多 20 个字符', icon: 'none' })
          return
        }
        wx.navigateTo({
          url: `/pages/todo-form/index?kind=plan&tag=${encodeURIComponent(tag)}`,
        })
      },
    })
  },

  onLongPressTag(event: { currentTarget: { dataset: { tag?: string } } }) {
    const tag = event.currentTarget.dataset.tag
    if (!tag || tag === ALL_TAGS || tag === UNTAGGED || this.data.mutating) return
    if (!requireAuthForWrite()) return
    wx.showActionSheet({
      itemList: ['重命名标签', '删除标签'],
      success: (result) => {
        if (result.tapIndex === 0) this.renameTag(tag)
        if (result.tapIndex === 1) this.deleteTag(tag)
      },
    })
  },

  renameTag(tag: string) {
    wx.showModal({
      title: '重命名标签',
      editable: true,
      placeholderText: tag,
      confirmText: '保存',
      success: (result) => {
        if (!result.confirm) return
        const nextTag = (result.content ?? '').trim()
        if (!nextTag || nextTag === tag) return
        if (nextTag.length > 20) {
          wx.showToast({ title: '标签最多 20 个字符', icon: 'none' })
          return
        }
        void this.bulkUpdateTag(tag, nextTag)
      },
    })
  },

  deleteTag(tag: string) {
    wx.showModal({
      title: `删除「${tag}」？`,
      content: '标签会移除，里面的待办仍会保留。',
      confirmText: '删除标签',
      confirmColor: '#b86e7d',
      success: (result) => {
        if (result.confirm) void this.bulkUpdateTag(tag, '')
      },
    })
  },

  async bulkUpdateTag(fromTag: string, toTag: string) {
    if (this.data.mutating) return
    const targets = this.data.allItems.filter((item) => item.tag === fromTag)
    if (!targets.length) return
    todoRequestGate.invalidate()
    this.setData({ mutating: true })
    try {
      const updatedItems: TodoItem[] = []
      for (const item of targets) {
        updatedItems.push(await todoGateway.update(
          item.id,
          toTodoInput(item, toTag),
          item.version,
        ))
      }
      const updateMap = new Map(updatedItems.map((item) => [item.id, item]))
      const items = this.data.allItems.map((item) => updateMap.get(item.id) ?? item)
      const nextActiveTag = this.data.activeTag === fromTag
        ? toTag || ALL_TAGS
        : this.data.activeTag
      this.render(items, nextActiveTag, this.data.statusFilter as TodoStatus)
      wx.showToast({ title: toTag ? '标签已更新' : '标签已删除', icon: 'success' })
    } catch (error) {
      this.handleMutationError(error, '标签没有更新成功')
    } finally {
      this.setData({ mutating: false })
    }
  },

  onEditItem(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id || this.data.mutating) return
    if (!requireAuthForWrite()) return
    wx.navigateTo({ url: `/pages/todo-form/index?id=${encodeURIComponent(id)}` })
  },

  async onToggleItem(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id || this.data.mutating) return
    if (!requireAuthForWrite()) return
    const item = this.findItem(id)
    if (!item) return
    todoRequestGate.invalidate()
    this.setData({ mutating: true })
    try {
      const updated = await todoGateway.setDone(id, !item.done, item.version)
      this.applyUpdatedItem(updated)
    } catch (error) {
      this.handleMutationError(error, '这条待办没有保存成功')
    } finally {
      this.setData({ mutating: false })
    }
  },

  onLongPressItem(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id || this.data.mutating) return
    if (!requireAuthForWrite()) return
    wx.showActionSheet({
      itemList: ['编辑', '删除'],
      success: (result) => {
        if (result.tapIndex === 0) {
          wx.navigateTo({ url: `/pages/todo-form/index?id=${encodeURIComponent(id)}` })
          return
        }
        const item = this.findItem(id)
        if (!item) return
        wx.showModal({
          title: '删除这条待办？',
          content: '删除后会从共同空间隐藏。',
          confirmText: '删除',
          confirmColor: '#b86e7d',
          success: (modal) => {
            if (modal.confirm) void this.deleteItem(id, item.version)
          },
        })
      },
    })
  },

  async deleteItem(id: string, version: number) {
    if (this.data.mutating) return
    todoRequestGate.invalidate()
    this.setData({ mutating: true })
    try {
      await todoGateway.remove(id, version)
      const remaining = this.data.allItems.filter((item) => item.id !== id)
      this.render(remaining)
      wx.showToast({ title: '已删除', icon: 'success' })
    } catch (error) {
      this.handleMutationError(error, '删除没有完成')
    } finally {
      this.setData({ mutating: false })
    }
  },

  findItem(id: string): TodoItem | undefined {
    return this.data.allItems.find((item) => item.id === id)
  },

  applyUpdatedItem(updated: TodoItem) {
    const items = this.data.allItems.map((item) =>
      item.id === updated.id ? updated : item,
    )
    this.render(items)
  },

  handleMutationError(error: unknown, fallback: string) {
    if (isTodoVersionConflict(error)) {
      wx.showToast({ title: '内容已更新，正在刷新', icon: 'none' })
      void this.refresh()
      return
    }
    wx.showToast({
      title: getTodoErrorMessage(error, fallback),
      icon: 'none',
    })
  },

  onUnload() {
    todoRequestGate.invalidate()
  },
})
