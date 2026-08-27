import { getCategoryLabel, getLocationLabel } from '../../constants/inventory'
import { resolveInventoryLifecycleActions } from '../../domain/demo-interactions'
import { getShanghaiDateOnly, resolveExpiry } from '../../domain/expiry'
import type { InventoryItem, InventoryLifecycleStatus } from '../../domain/inventory'
import { inventoryGateway } from '../../services/demo-inventory'
import { navigateBackOrTab } from '../../utils/demo-navigation'

const LIFECYCLE_LABELS: Record<InventoryLifecycleStatus, string> = {
  active: '正在库存中',
  consumed: '已用完',
  discarded: '已丢弃',
  archived: '已归档',
}

const ACTION_LABELS = {
  consume: '标记用完',
  discard: '标记丢弃',
  archive: '归档记录',
  restore: '恢复到库存',
} as const

interface ItemDetailView extends InventoryItem {
  iconText: string
  categoryLabel: string
  locationLabel: string
  expiry: ReturnType<typeof resolveExpiry>
  statusLabel: string
  actions: Array<{
    key: keyof typeof ACTION_LABELS
    label: string
    nextStatus: InventoryLifecycleStatus
  }>
}

Page({
  data: {
    id: '',
    loading: true,
    item: null as ItemDetailView | null,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    this.setData({ id })
  },

  onShow() {
    if (this.data.id) void this.loadItem()
  },

  async loadItem() {
    const item = await inventoryGateway.get(this.data.id)
    if (!item) {
      wx.showToast({ title: '物品不存在', icon: 'none' })
      navigateBackOrTab('/pages/inventory/index')
      return
    }
    const today = getShanghaiDateOnly(Date.now())
    this.setData({
      loading: false,
      item: {
        ...item,
        iconText: item.name.slice(0, 1),
        categoryLabel: getCategoryLabel(item.category),
        locationLabel: getLocationLabel(item.location),
        expiry: resolveExpiry(item.expiresOn, today),
        statusLabel: LIFECYCLE_LABELS[item.status],
        actions: resolveInventoryLifecycleActions(item.status).map((action) => ({
          ...action,
          label: ACTION_LABELS[action.key],
        })),
      },
    })
  },

  onBack() {
    navigateBackOrTab('/pages/inventory/index')
  },

  onEdit() {
    wx.navigateTo({ url: `/pages/item-form/index?id=${this.data.id}` })
  },

  async onChangeStatus(event: {
    currentTarget: { dataset: { status: InventoryLifecycleStatus } }
  }) {
    const item = this.data.item
    if (!item) return
    try {
      await inventoryGateway.changeStatus(
        item.id,
        event.currentTarget.dataset.status,
        item.version,
      )
      wx.showToast({ title: '状态已更新', icon: 'success' })
      navigateBackOrTab('/pages/inventory/index')
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '操作失败',
        icon: 'none',
      })
    }
  },

  onDelete() {
    const item = this.data.item
    if (!item) return
    wx.showModal({
      title: '删除这件物品？',
      content: 'Demo 中会从库存列表移除，但仍采用软删除逻辑。',
      confirmText: '删除',
      confirmColor: '#c64d42',
      success: (result) => {
        if (!result.confirm) return
        void inventoryGateway.remove(item.id, item.version).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' })
          navigateBackOrTab('/pages/inventory/index')
        })
      },
    })
  },
})
