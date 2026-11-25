import { pullRefreshBehavior } from '../../utils/pull-refresh'
import { appConfig } from '../../config/env'
import { CATEGORY_OPTIONS, getCategoryLabel, getLocationLabel } from '../../constants/inventory'
import { INVENTORY_CATEGORY_ICON_NAMES } from '../../constants/icon-names'
import {
  resolveInventoryLifecycleStatuses,
  type InventoryViewMode,
} from '../../domain/demo-interactions'
import { formatChineseDate, getShanghaiDateOnly, resolveExpiry } from '../../domain/expiry'
import type {
  ExpiryStatus,
  InventoryCategory,
  InventoryItem,
  InventoryLifecycleStatus,
} from '../../domain/inventory'
import {
  summarizeInventory,
  type InventoryFilters,
  type InventorySummary,
} from '../../domain/inventory-query'
import { inventoryGateway } from '../../services/inventory'
import { mediaGateway } from '../../services/media'
import { getAuthState, hydrateAuthState } from '../../services/auth'
import { promptAuthGateIfNeeded, requireAuthForWrite } from '../../services/auth-preview'
import { readPageCache, writePageCache as persistPageCache } from '../../services/page-cache'
import { getInventoryErrorMessage } from '../../utils/inventory-error'
import { waitForMinimumLoading } from '../../utils/loading'
import { createDebouncer, createRequestGate } from '../../utils/request-control'
import { appToastBehavior, showToast } from '../../utils/app-toast'

type DemoExpiryFilter = 'all' | 'expired' | 'due' | 'soon' | 'normal' | 'none'

interface InventoryItemView extends InventoryItem {
  placeholder: string
  generating: boolean
  generateFailed: boolean
  iconName: string
  categoryLabel: string
  locationLabel: string
  expiry: ReturnType<typeof resolveExpiry>
  lifecycleLabel: string
  imageSrc: string
  dateDay: string
  dateHint: string
  dateTone: string
  adjusting: boolean
}

interface InventorySection {
  key: string
  title: string
  hint: string
  items: InventoryItemView[]
}

const EMPTY_SUMMARY: InventorySummary = {
  total: 0,
  expired: 0,
  today: 0,
  urgent: 0,
  soon: 0,
  normal: 0,
  none: 0,
  dueWithin3Days: 0,
}

const inventoryRequestGate = createRequestGate()
const inventoryPageGate = createRequestGate()
const inventorySearchDebouncer = createDebouncer(300)
const PAGE_REFRESH_INTERVAL_MS = 500
const INVENTORY_PAGE_CACHE_KEY = 'inventory:overview'

function toExpiryStatuses(filter: DemoExpiryFilter): ExpiryStatus[] | undefined {
  const mapping: Record<Exclude<DemoExpiryFilter, 'all'>, ExpiryStatus[]> = {
    expired: ['expired'],
    due: ['today', 'urgent'],
    soon: ['soon'],
    normal: ['normal'],
    none: ['none'],
  }
  return filter === 'all' ? undefined : mapping[filter]
}

function toView(item: InventoryItem, today: string): InventoryItemView {
  const lifecycleLabels: Record<InventoryLifecycleStatus, string> = {
    active: '在库',
    consumed: '已用完',
    discarded: '已丢弃',
    archived: '已归档',
  }
  const imageState = (item.imageState ?? '') as string
  return {
    ...item,
    imageState,
    placeholder: imageState === 'failed'
      ? '/images/inventory-failed.png'
      : '/images/inventory-placeholder.png',
    generating: imageState === 'pending',
    generateFailed: imageState === 'failed',
    iconName: INVENTORY_CATEGORY_ICON_NAMES[item.category],
    categoryLabel: getCategoryLabel(item.category),
    locationLabel: getLocationLabel(item.location),
    expiry: resolveExpiry(item.expiresOn, today),
    lifecycleLabel: lifecycleLabels[item.status],
    imageSrc: '',
    adjusting: false,
    ...buildDateColumn(item, resolveExpiry(item.expiresOn, today)),
  }
}

/** 左列只做「时间感」提示：日期弱化，相对期限用颜色区分轻重。 */
function buildDateColumn(
  item: InventoryItem,
  expiry: ReturnType<typeof resolveExpiry>,
): { dateDay: string; dateHint: string; dateTone: string } {
  if (!item.expiresOn) {
    return { dateDay: '—', dateHint: '无期限', dateTone: 'none' }
  }
  const dayLabel = formatChineseDate(item.expiresOn) || '—'
  const tone =
    expiry.status === 'expired' ? 'danger'
      : expiry.status === 'today' || expiry.status === 'urgent' ? 'warn'
        : expiry.status === 'soon' ? 'soon'
          : 'normal'
  const days = expiry.daysRemaining
  const hint =
    days === null ? '无期限'
      : days < 0 ? `已过期 ${Math.abs(days)} 天`
        : days === 0 ? '今天到期'
          : `还剩 ${days} 天`
  return { dateDay: dayLabel, dateHint: hint, dateTone: tone }
}

/** 一次批量取签名，避免 N 件物品各发一次请求。 */
async function resolveItemImages(views: InventoryItemView[]): Promise<InventoryItemView[]> {
  const ids = views.map((view) => view.imageMediaId).filter(Boolean)
  if (!ids.length) return views
  let assets: Record<string, { thumb: { url: string } }> = {}
  try {
    assets = await mediaGateway.getMany(ids)
  } catch {
    return views
  }
  return views.map((view) => {
    const asset = assets[view.imageMediaId]
    return asset ? { ...view, imageSrc: asset.thumb.url } : view
  })
}

interface ExpiryCounts {
  all: number
  expired: number
  due: number
  soon: number
  none: number
}

function buildExpiryCounts(views: InventoryItemView[]): ExpiryCounts {
  const counts: ExpiryCounts = { all: views.length, expired: 0, due: 0, soon: 0, none: 0 }
  for (const view of views) {
    switch (view.expiry.status) {
      case 'expired':
        counts.expired += 1
        break
      case 'today':
      case 'urgent':
        counts.due += 1
        break
      case 'soon':
        counts.soon += 1
        break
      case 'none':
        counts.none += 1
        break
      default:
        break
    }
  }
  return counts
}

function filterByExpiry(
  views: InventoryItemView[],
  filter: DemoExpiryFilter,
): InventoryItemView[] {
  if (filter === 'all') return views
  const statuses = toExpiryStatuses(filter)
  if (!statuses) return views
  return views.filter((view) => statuses.includes(view.expiry.status))
}

function buildCategoryTabs(views: InventoryItemView[]): Array<{ value: string; label: string; count: number }> {
  const counts = new Map<string, number>()
  for (const view of views) {
    counts.set(view.category, (counts.get(view.category) ?? 0) + 1)
  }
  const tabs = [{ value: 'all', label: '全部分类', count: views.length }]
  for (const option of CATEGORY_OPTIONS) {
    const count = counts.get(option.value) ?? 0
    if (count > 0) tabs.push({ value: option.value, label: option.label, count })
  }
  return tabs
}

function buildSections(
  items: InventoryItemView[],
  mode: InventoryViewMode,
): InventorySection[] {
  if (mode === 'history') {
    const historyDefinitions = [
      { key: 'consumed', title: '已经用完', hint: '需要时可以恢复', status: 'consumed' },
      { key: 'discarded', title: '已经丢弃', hint: '留下一点记录', status: 'discarded' },
      { key: 'archived', title: '已经归档', hint: '暂时收起来', status: 'archived' },
    ] as const

    return historyDefinitions
      .map((definition) => ({
        key: definition.key,
        title: definition.title,
        hint: definition.hint,
        items: items
          .filter((item) => item.status === definition.status)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)),
      }))
      .filter((section) => section.items.length > 0)
  }

  const definitions = [
    { key: 'expired', title: '已过期', hint: '优先处理', statuses: ['expired'] },
    {
      key: 'due',
      title: '近期到期',
      hint: '今天至未来 7 天',
      statuses: ['today', 'urgent', 'soon'],
    },
    { key: 'normal', title: '安心库存', hint: '有效期充足', statuses: ['normal'] },
    { key: 'none', title: '长期存放', hint: '未设置有效期', statuses: ['none'] },
  ]

  return definitions
    .map((definition) => ({
      key: definition.key,
      title: definition.title,
      hint: definition.hint,
      items: items
        .filter((item) => definition.statuses.includes(item.expiry.status))
        .sort(
          (left, right) =>
            (left.expiry.daysRemaining ?? Number.MAX_SAFE_INTEGER) -
              (right.expiry.daysRemaining ?? Number.MAX_SAFE_INTEGER) ||
            left.name.localeCompare(right.name),
        ),
    }))
    .filter((section) => section.items.length > 0)
}

Page({
  /** 最近一次加载的视图（已按分类/搜索过滤），时间筛选在本地切，不再发请求 */
  loadedViews: [] as InventoryItemView[],


  behaviors: [appToastBehavior, pullRefreshBehavior],
  data: {
    loading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    errorMessage: '',
    spaceName: '我们的家',
    today: '',
    query: '',
    searchFocused: false,
    viewMode: 'active' as InventoryViewMode,
    selectedExpiry: 'all' as DemoExpiryFilter,
    selectedCategory: 'all' as InventoryCategory | 'all',
    categoryTabs: [] as Array<{ value: string; label: string; count: number }>,
    expiryCounts: { all: 0, expired: 0, due: 0, soon: 0, none: 0 },
    summary: EMPTY_SUMMARY,
    sections: [] as InventorySection[],
    hasResults: false,
    syncState: appConfig.demoMode ? 'local' : 'pending',
    syncText: appConfig.demoMode ? '只在本机' : '正在同步',
    lastRefreshAt: 0,
  },

  onLoad() {
    const cached = readPageCache<Record<string, unknown>>(INVENTORY_PAGE_CACHE_KEY)
    if (cached) {
      const cachedSections = (cached.value as { sections?: InventorySection[] }).sections ?? []
      this.loadedViews = cachedSections.flatMap((section) => section.items)

      this.setData({
        ...cached.value,
        loading: false,
        hasLoaded: true,
        cacheFresh: cached.fresh,
        hasShown: false,
      })
    }
  },

  onShow() {
    promptAuthGateIfNeeded()
    const firstShow = !this.data.hasShown
    if (firstShow) this.setData({ hasShown: true })
    if (firstShow && this.data.cacheFresh) return
    void this.refreshPage(!firstShow)
  },

  onPullRefreshTask() {
    inventoryPageGate.invalidate()
    inventorySearchDebouncer.cancel()
    void this.loadInventory(true, true)
  },

  onRetry() {
    inventorySearchDebouncer.cancel()
    void this.loadInventory()
  },

  async refreshPage(force = false) {
    const now = Date.now()
    if (!force && now - this.data.lastRefreshAt < PAGE_REFRESH_INTERVAL_MS) return
    this.setData({ lastRefreshAt: now })
    const sequence = inventoryPageGate.begin()
    const auth = await hydrateAuthState()
    if (!inventoryPageGate.isCurrent(sequence)) return
    this.setData({ spaceName: auth.spaceName })
    inventorySearchDebouncer.cancel()
    void this.loadInventory(false, force)
  },

  async loadInventory(fromPullDown = false, force = false) {
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    const auth = getAuthState()
    if (!appConfig.demoMode && !auth.isLoggedIn) {
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.setData({
        spaceName: auth.spaceName,
        loading: false,
        hasLoaded: true,
        cacheFresh: false,
        errorMessage: '',
        syncState: 'local',
        syncText: '登录后同步',
      })
      if (fromPullDown) wx.stopPullDownRefresh()
      promptAuthGateIfNeeded()
      return
    }
    const sequence = inventoryRequestGate.begin()
    this.setData({
      loading: !fromPullDown && !this.data.hasLoaded,
      errorMessage: '',
      syncState: appConfig.demoMode ? 'local' : 'pending',
      syncText: appConfig.demoMode ? '只在本机' : '正在同步',
    })
    try {
      const today = getShanghaiDateOnly(Date.now())
      const filters: InventoryFilters = {
        query: this.data.query,
        lifecycleStatuses: resolveInventoryLifecycleStatuses(this.data.viewMode),

      }
      const [summaryResult, listResult] = await Promise.allSettled([
        inventoryGateway.summary(today),
        inventoryGateway.list(filters, today),
      ])
      if (!inventoryRequestGate.isCurrent(sequence)) return

      const errors: string[] = []
      if (summaryResult.status === 'rejected') {
        errors.push(getInventoryErrorMessage(
          summaryResult.reason,
          '库存摘要暂时没有加载出来',
        ))
      }
      if (listResult.status === 'rejected') {
        errors.push(getInventoryErrorMessage(
          listResult.reason,
          '库存列表暂时没有加载出来',
        ))
      }

      const visibleItems = listResult.status === 'fulfilled' ? listResult.value : []
      const views = await resolveItemImages(visibleItems.map((item) => toView(item, today)))
      if (!inventoryRequestGate.isCurrent(sequence)) return
      this.loadedViews = views
      const categoryTabs = buildCategoryTabs(views)
      // 计数与列表都基于当前分类范围，分类/时间切换后口径一致
      const categoryViews = this.data.selectedCategory === 'all'
        ? views
        : views.filter((view) => view.category === this.data.selectedCategory)
      const expiryCounts = buildExpiryCounts(categoryViews)
      const expiryFiltered = this.data.viewMode === 'active'
        ? filterByExpiry(categoryViews, this.data.selectedExpiry)
        : categoryViews
      const hasListLoaded = listResult.status === 'fulfilled'
      const hasLoaded = this.data.hasLoaded || hasListLoaded
      const hasError = errors.length > 0
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!inventoryRequestGate.isCurrent(sequence)) return
      this.setData({
        loading: false,
        hasLoaded,
        cacheFresh: true,
        today,
        summary: summaryResult.status === 'fulfilled'
          ? summaryResult.value
          : this.data.summary,
        categoryTabs,
        expiryCounts,
        sections: hasListLoaded
          ? buildSections(expiryFiltered, this.data.viewMode)
          : this.data.sections,
        hasResults: hasListLoaded ? views.length > 0 : this.data.hasResults,
        errorMessage: errors[0] ?? '',
        syncState: hasError ? 'pending' : appConfig.demoMode ? 'local' : 'synced',
        syncText: hasError
          ? '部分未同步'
          : appConfig.demoMode ? '只在本机' : '已同步',
      }, () => this.cacheCurrentPage())
    } catch (error) {
      if (!inventoryRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!inventoryRequestGate.isCurrent(sequence)) return
      this.setData({
        errorMessage: getInventoryErrorMessage(
          error,
          '库存暂时没有加载出来，请稍后再试',
        ),
        syncState: 'pending',
        syncText: appConfig.demoMode ? '本机读取失败' : '同步失败',
        hasLoaded: true,
      })
    } finally {
      if (inventoryRequestGate.isCurrent(sequence)) {
        this.setData({ loading: false })
      }
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  cacheCurrentPage() {
    const data = this.data as unknown as Record<string, unknown>
    const {
      loading: _loading,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      ...snapshot
    } = data
    persistPageCache(INVENTORY_PAGE_CACHE_KEY, snapshot)
  },

  onSearchInput(event: { detail: { value: string } }) {
    inventoryRequestGate.invalidate()
    this.setData({ query: event.detail.value })
    inventorySearchDebouncer.schedule(() => {
      void this.loadInventory()
    })
  },

  onClearSearch() {
    inventorySearchDebouncer.cancel()
    this.setData({ query: '' })
    void this.loadInventory()
  },

  onSearchFocus() {
    this.setData({ searchFocused: true })
  },

  onSearchBlur() {
    this.setData({ searchFocused: false })
  },

  onSelectCategory(event: { currentTarget: { dataset: { value?: string } } }) {
    const value = (event.currentTarget.dataset.value ?? 'all') as InventoryCategory | 'all'
    if (value === this.data.selectedCategory) return
    this.applyLocalFilters({ category: value })
  },

  /** 分类与时间都在本地切：不重新请求，一次 setData 完成，列表不闪 */
  applyLocalFilters(next: { category?: InventoryCategory | 'all'; expiry?: DemoExpiryFilter } = {}) {
    const category = next.category ?? this.data.selectedCategory
    const expiry = next.expiry ?? this.data.selectedExpiry
    const categoryViews = category === 'all'
      ? this.loadedViews
      : this.loadedViews.filter((item) => item.category === category)
    const sections = buildSections(
      filterByExpiry(categoryViews, expiry),
      this.data.viewMode,
    )
    this.setData({
      selectedCategory: category,
      selectedExpiry: expiry,
      expiryCounts: buildExpiryCounts(categoryViews),
      sections,
      hasResults: sections.some((section) => section.items.length > 0),
    })
  },

  async onQuickAdjust(event: { detail?: { id?: string; delta?: number } }) {
    const id = event?.detail?.id ?? ''
    const delta = Number(event?.detail?.delta ?? 0)
    if (!id || !delta) return
    const target = this.findItemView(id)
    if (!target || target.adjusting) return

    const current = Number(target.quantity)
    const base = Number.isFinite(current) ? current : 0
    const next = Math.round((base + delta) * 100) / 100
    if (next === base) return

    // 减到 0 是高风险动作：先问一句，避免误触把库存抹掉。
    if (next <= 0) {
      const confirmed = await this.confirmConsume(target)
      if (!confirmed) return
      await this.markConsumed(target)
      return
    }

    this.patchItemView(id, { quantity: String(next), adjusting: true })
    try {
      const updated = await inventoryGateway.update(
        id,
        {
          name: target.name,
          category: target.category,
          quantity: String(next),
          unit: target.unit,
          location: target.location,
          purchasedOn: target.purchasedOn,
          openedOn: target.openedOn,
          expiresOn: target.expiresOn,
          note: target.note,
          imageMediaId: target.imageMediaId,
          iconKey: target.iconKey ?? '',
        },
        target.version,
      )
      this.patchItemView(id, {
        quantity: updated.quantity,
        version: updated.version,
        adjusting: false,
      })
      showToast(this, '库存已更新')
    } catch (error) {
      this.patchItemView(id, {
        quantity: target.quantity,
        adjusting: false,
      })
      wx.showToast({
        title: getInventoryErrorMessage(error, '库存没有调整成功'),
        icon: 'none',
      })
    }
  },

  confirmConsume(item: InventoryItemView): Promise<boolean> {
    return new Promise((resolve) => {
      wx.showModal({
        title: `「${item.name}」用完了？`,
        content: '数量会清零，并移到历史记录里。之后可以随时恢复。',
        confirmText: '用完了',
        cancelText: '再想想',
        confirmColor: '#b96a5c',
        cancelColor: '#837f76',
        success: (result) => resolve(Boolean(result.confirm)),
        fail: () => resolve(false),
      })
    })
  },

  async markConsumed(item: InventoryItemView) {
    this.patchItemView(item.id, { adjusting: true })
    try {
      await inventoryGateway.changeStatus(item.id, 'consumed', item.version)
      wx.showToast({ title: '已记作用完', icon: 'success' })
      await this.refreshPage(true)
    } catch (error) {
      this.patchItemView(item.id, { adjusting: false })
      wx.showToast({
        title: getInventoryErrorMessage(error, '没有标记成功'),
        icon: 'none',
      })
    }
  },

  findItemView(id: string): InventoryItemView | null {
    for (const section of this.data.sections) {
      const found = section.items.find((item) => item.id === id)
      if (found) return found
    }
    return null
  },

  patchItemView(id: string, patch: Partial<InventoryItemView>) {
    this.data.sections.forEach((section, sectionIndex) => {
      const itemIndex = section.items.findIndex((item) => item.id === id)
      if (itemIndex < 0) return
      const updates: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(patch)) {
        updates[`sections[${sectionIndex}].items[${itemIndex}].${key}`] = value
      }
      this.setData(updates)
    })
  },

  onSelectExpiry(event: { currentTarget: { dataset: { value: DemoExpiryFilter } } }) {
    const value = event.currentTarget.dataset.value
    const next = this.data.selectedExpiry === value ? 'all' : value
    this.applyLocalFilters({ expiry: next })
  },

  onSwitchView(event: {
    currentTarget: { dataset: { value: InventoryViewMode } }
  }) {
    inventorySearchDebouncer.cancel()
    const viewMode = event.currentTarget.dataset.value
    if (viewMode === this.data.viewMode) return
    this.setData({ viewMode, selectedExpiry: 'all' })
    void this.loadInventory()
  },

  onOpenItem(event: { detail: { id: string } }) {
    wx.navigateTo({ url: `/pages/item-detail/index?id=${event.detail.id}` })
  },

  onAddItem() {
    if (!requireAuthForWrite()) return
    wx.navigateTo({ url: '/pages/item-form/index' })
  },

  onUnload() {
    inventorySearchDebouncer.cancel()
    inventoryPageGate.invalidate()
    inventoryRequestGate.invalidate()
  },
})
