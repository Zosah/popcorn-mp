import { getCategoryLabel, getLocationLabel } from '../../constants/inventory'
import { INVENTORY_CATEGORY_ICON_NAMES } from '../../constants/icon-names'
import { resolveInventoryLifecycleActions } from '../../domain/demo-interactions'
import {
  formatShanghaiDateTime,
  getShanghaiDateOnly,
  resolveExpiry,
} from '../../domain/expiry'
import type { InventoryItem, InventoryLifecycleStatus } from '../../domain/inventory'
import { inventoryGateway } from '../../services/inventory'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { getInventoryErrorMessage } from '../../utils/inventory-error'

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
  iconName: string
  categoryLabel: string
  locationLabel: string
  expiry: ReturnType<typeof resolveExpiry>
  statusLabel: string
  updatedAtLabel: string
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
    errorMessage: '',
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
    this.setData({ loading: true, errorMessage: '', item: null })
    try {
      const item = await inventoryGateway.get(this.data.id)
      if (!item) {
        wx.showToast({ title: '物品不存在', icon: 'none' })
        navigateBackOrTab('/pages/inventory/index')
        return
      }
      const today = getShanghaiDateOnly(Date.now())
      this.setData({
        item: {
          ...item,
          iconName: INVENTORY_CATEGORY_ICON_NAMES[item.category],
          categoryLabel: getCategoryLabel(item.category),
          locationLabel: getLocationLabel(item.location),
          expiry: resolveExpiry(item.expiresOn, today),
          statusLabel: LIFECYCLE_LABELS[item.status],
          updatedAtLabel: formatShanghaiDateTime(item.updatedAt),
          actions: resolveInventoryLifecycleActions(item.status).map((action) => ({
            ...action,
            label: ACTION_LABELS[action.key],
          })),
        },
      })
    } catch (error) {
      this.setData({
        errorMessage: getInventoryErrorMessage(
          error,
          '物品详情暂时没有加载出来',
        ),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onRetry() {
    void this.loadItem()
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
        title: getInventoryErrorMessage(error, '操作失败'),
        icon: 'none',
      })
    }
  },

  onDelete() {
    const item = this.data.item
    if (!item) return
    wx.showModal({
      title: '删除这件物品？',
      content: '删除后会从库存列表移除，之后仍可恢复。',
      confirmText: '删除',
      confirmColor: '#e8695c',
      success: (result) => {
        if (!result.confirm) return
        void inventoryGateway.remove(item.id, item.version).then(() => {
          wx.showToast({ title: '已删除', icon: 'success' })
          navigateBackOrTab('/pages/inventory/index')
        }).catch((error) => {
          wx.showToast({
            title: getInventoryErrorMessage(error, '删除失败'),
            icon: 'none',
          })
        })
      },
    })
  },
})
