import { appConfig } from '../../config/env'
import { getCategoryLabel, getLocationLabel } from '../../constants/inventory'
import { INVENTORY_CATEGORY_ICON_NAMES } from '../../constants/icon-names'
import {
  resolveInventoryLifecycleStatuses,
  type InventoryViewMode,
} from '../../domain/demo-interactions'
import { getShanghaiDateOnly, resolveExpiry } from '../../domain/expiry'
import type {
  ExpiryStatus,
  InventoryItem,
  InventoryLifecycleStatus,
} from '../../domain/inventory'
import {
  summarizeInventory,
  type InventoryFilters,
  type InventorySummary,
} from '../../domain/inventory-query'
import { inventoryGateway } from '../../services/inventory'
import { hydrateAuthState } from '../../services/auth'
import { getInventoryErrorMessage } from '../../utils/inventory-error'
import { createDebouncer, createRequestGate } from '../../utils/request-control'

type DemoExpiryFilter = 'all' | 'expired' | 'due' | 'soon' | 'normal' | 'none'

interface InventoryItemView extends InventoryItem {
  iconName: string
  categoryLabel: string
  locationLabel: string
  expiry: ReturnType<typeof resolveExpiry>
  lifecycleLabel: string
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
  return {
    ...item,
    iconName: INVENTORY_CATEGORY_ICON_NAMES[item.category],
    categoryLabel: getCategoryLabel(item.category),
    locationLabel: getLocationLabel(item.location),
    expiry: resolveExpiry(item.expiresOn, today),
    lifecycleLabel: lifecycleLabels[item.status],
  }
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
  data: {
    loading: true,
    hasLoaded: false,
    errorMessage: '',
    spaceName: '我们的家',
    today: '',
    query: '',
    searchFocused: false,
    viewMode: 'active' as InventoryViewMode,
    selectedExpiry: 'all' as DemoExpiryFilter,
    summary: EMPTY_SUMMARY,
    sections: [] as InventorySection[],
    hasResults: false,
    syncState: appConfig.demoMode ? 'local' : 'pending',
    syncText: appConfig.demoMode ? '只在本机' : '正在同步',
    lastRefreshAt: 0,
  },

  onShow() {
    void this.refreshPage()
  },

  onPullDownRefresh() {
    inventoryPageGate.invalidate()
    inventorySearchDebouncer.cancel()
    void this.loadInventory(true)
  },

  onRetry() {
    inventorySearchDebouncer.cancel()
    void this.loadInventory()
  },

  async refreshPage() {
    const now = Date.now()
    if (now - this.data.lastRefreshAt < PAGE_REFRESH_INTERVAL_MS) return
    this.setData({ lastRefreshAt: now })
    const sequence = inventoryPageGate.begin()
    const auth = await hydrateAuthState()
    if (!inventoryPageGate.isCurrent(sequence)) return
    this.setData({ spaceName: auth.spaceName })
    inventorySearchDebouncer.cancel()
    void this.loadInventory()
  },

  async loadInventory(fromPullDown = false) {
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
        expiryStatuses:
          this.data.viewMode === 'active'
            ? toExpiryStatuses(this.data.selectedExpiry)
            : undefined,
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
      const views = visibleItems.map((item) => toView(item, today))
      const hasListLoaded = listResult.status === 'fulfilled'
      const hasLoaded = this.data.hasLoaded || hasListLoaded
      const hasError = errors.length > 0
      this.setData({
        today,
        summary: summaryResult.status === 'fulfilled'
          ? summaryResult.value
          : this.data.summary,
        sections: hasListLoaded
          ? buildSections(views, this.data.viewMode)
          : this.data.sections,
        hasResults: hasListLoaded ? views.length > 0 : this.data.hasResults,
        hasLoaded,
        errorMessage: errors[0] ?? '',
        syncState: hasError ? 'pending' : appConfig.demoMode ? 'local' : 'synced',
        syncText: hasError
          ? '部分未同步'
          : appConfig.demoMode ? '只在本机' : '已同步',
      })
    } catch (error) {
      if (!inventoryRequestGate.isCurrent(sequence)) return
      this.setData({
        errorMessage: getInventoryErrorMessage(
          error,
          '库存暂时没有加载出来，请稍后再试',
        ),
        syncState: 'pending',
        syncText: appConfig.demoMode ? '本机读取失败' : '同步失败',
      })
    } finally {
      if (inventoryRequestGate.isCurrent(sequence)) {
        this.setData({ loading: false })
      }
      if (fromPullDown) wx.stopPullDownRefresh()
    }
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

  onSelectExpiry(event: { currentTarget: { dataset: { value: DemoExpiryFilter } } }) {
    inventorySearchDebouncer.cancel()
    const value = event.currentTarget.dataset.value
    this.setData({
      selectedExpiry: this.data.selectedExpiry === value ? 'all' : value,
    })
    void this.loadInventory()
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
    wx.navigateTo({ url: '/pages/item-form/index' })
  },

  onUnload() {
    inventorySearchDebouncer.cancel()
    inventoryPageGate.invalidate()
    inventoryRequestGate.invalidate()
  },
})
