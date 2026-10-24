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
import { inventoryGateway } from '../../services/demo-inventory'
import { getDemoSpaceName } from '../../services/demo-space'
import { syncDemoTabBar } from '../../utils/demo-tab-bar'

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
    spaceName: '我们的家',
    today: '',
    query: '',
    viewMode: 'active' as InventoryViewMode,
    selectedExpiry: 'all' as DemoExpiryFilter,
    summary: EMPTY_SUMMARY,
    sections: [] as InventorySection[],
    hasResults: false,
  },

  onShow() {
    syncDemoTabBar(this, 1)
    this.setData({ spaceName: getDemoSpaceName() })
    void this.loadInventory()
  },

  onPullDownRefresh() {
    void this.loadInventory(true)
  },

  async loadInventory(fromPullDown = false) {
    this.setData({ loading: !fromPullDown })
    const today = getShanghaiDateOnly(Date.now())
    const allItems = await inventoryGateway.list({}, today)
    const filters: InventoryFilters = {
      query: this.data.query,
      lifecycleStatuses: resolveInventoryLifecycleStatuses(this.data.viewMode),
      expiryStatuses:
        this.data.viewMode === 'active'
          ? toExpiryStatuses(this.data.selectedExpiry)
          : undefined,
    }
    const visibleItems = await inventoryGateway.list(filters, today)
    const views = visibleItems.map((item) => toView(item, today))
    this.setData({
      loading: false,
      today,
      summary: summarizeInventory(allItems, today),
      sections: buildSections(views, this.data.viewMode),
      hasResults: views.length > 0,
    })
    if (fromPullDown) wx.stopPullDownRefresh()
  },

  onSearchInput(event: { detail: { value: string } }) {
    this.setData({ query: event.detail.value })
    void this.loadInventory()
  },

  onClearSearch() {
    this.setData({ query: '' })
    void this.loadInventory()
  },

  onSelectExpiry(event: { currentTarget: { dataset: { value: DemoExpiryFilter } } }) {
    const value = event.currentTarget.dataset.value
    this.setData({
      selectedExpiry: this.data.selectedExpiry === value ? 'all' : value,
    })
    void this.loadInventory()
  },

  onSwitchView(event: {
    currentTarget: { dataset: { value: InventoryViewMode } }
  }) {
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
})
