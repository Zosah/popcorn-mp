import { getCategoryLabel, getLocationLabel } from '../../constants/inventory'
import { INVENTORY_CATEGORY_ICON_NAMES } from '../../constants/icon-names'
import { resolveInventoryLifecycleActions } from '../../domain/demo-interactions'
import {
  formatChineseDate,
  formatShanghaiDateTime,
  getShanghaiDateOnly,
  resolveExpiry,
} from '../../domain/expiry'
import type { InventoryItem, InventoryLifecycleStatus } from '../../domain/inventory'
import { inventoryGateway } from '../../services/inventory'
import { resolveInventoryIcon } from '../../services/inventory-icon'
import type { InventoryEvent } from '../../domain/inventory'
import { mediaGateway } from '../../services/media'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { getInventoryErrorMessage } from '../../utils/inventory-error'

const LIFECYCLE_LABELS: Record<InventoryLifecycleStatus, string> = {
  active: '正在库存中',
  consumed: '已用完',
  discarded: '已丢弃',
  archived: '已归档',
}

const ACTION_LABELS = {
  consume: '用完',
  discard: '丢弃',
  archive: '归档',
  restore: '恢复',
} as const

interface ItemDetailView extends InventoryItem {
  iconName: string
  iconUrl: string
  fallbackText: string
  fallbackColor: string
  categoryLabel: string
  locationLabel: string
  expiry: ReturnType<typeof resolveExpiry>
  statusLabel: string
  updatedAtLabel: string
  expiresOnLabel: string
  imageSrc: string
  timeline: Array<{
    id: string
    icon: string
    tone: string
    label: string
    summary: string
    detail: string
  }>
  actions: Array<{
    key: keyof typeof ACTION_LABELS
    label: string
    nextStatus: InventoryLifecycleStatus
  }>
}

const EVENT_ICONS: Record<string, string> = {
  created: 'system-add',
  quantity: 'inventory-status-active',
  updated: 'system-edit',
  status: 'system-check',
}

const EVENT_TONES: Record<string, string> = {
  created: 'green',
  quantity: 'orange',
  updated: 'blue',
  status: 'ink',
}

/** 操作流水按时间倒序；标题说「做了什么」，副行说「具体变了什么、谁动的」。 */
function buildTimeline(
  events: InventoryEvent[],
  item: { createdAt: string; updatedAt: string; unit?: string; quantity?: string },
) {
  if (events.length) {
    return events.map((event) => {
      const who = event.userName || '有人'
      const unit = item.unit ?? ''
      if (event.kind === 'created') {
        return {
          id: event.id,
          icon: EVENT_ICONS.created ?? 'system-add',
          tone: EVENT_TONES.created ?? 'green',
          label: formatShanghaiDateTime(event.createdAt),
          summary: '创建了这件物品',
          detail: `${who} 创建，库存 ${event.quantityTo || item.quantity || '0'} ${unit}`,
        }
      }
      if (event.kind === 'quantity') {
        return {
          id: event.id,
          icon: EVENT_ICONS.quantity ?? 'inventory-status-active',
          tone: EVENT_TONES.quantity ?? 'orange',
          label: formatShanghaiDateTime(event.createdAt),
          summary: '更新了库存',
          detail: `${who} 调整：${event.quantityFrom || '0'} → ${event.quantityTo || '0'} ${unit}`,
        }
      }
      return {
        id: event.id,
        icon: EVENT_ICONS[event.kind] ?? 'system-refresh',
        tone: EVENT_TONES[event.kind] ?? 'muted',
        label: formatShanghaiDateTime(event.createdAt),
        summary: event.summary,
        detail: [who, event.detail].filter(Boolean).join(' · '),
      }
    })
  }
  // 老数据没有流水时，至少给出创建时间这一条快照
  return [{
    id: 'fallback-created',
    icon: 'system-add',
    tone: 'green',
    label: formatShanghaiDateTime(item.createdAt),
    summary: '创建了这件物品',
    detail: `库存 ${item.quantity || '0'} ${item.unit ?? ''}`,
  }]
}

Page({
  data: {
    adjusting: false,
    generating: false,
    id: '',
    loading: true,
    hasShownOnce: false,
    errorMessage: '',
    item: null as ItemDetailView | null,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    this.setData({ id })
    if (id) void this.loadItem(id)
  },

  onShow() {
    if (!this.data.hasShownOnce) {
      this.setData({ hasShownOnce: true })
      return
    }
    if (this.data.id) void this.loadItem()
  },

  async loadItem(id?: string) {
    const itemId = id ?? this.data.id
    this.setData({ loading: true, errorMessage: '', item: null })
    try {
      const item = await inventoryGateway.get(itemId)
      if (!item) {
        wx.showToast({ title: '物品不存在', icon: 'none' })
        navigateBackOrTab('/pages/inventory/index')
        return
      }
      let imageSrc = ''
      if (item.imageMediaId) {
        try {
          const asset = await mediaGateway.get(item.imageMediaId)
          imageSrc = asset.display.url
        } catch {
          // 图片失效时仍保留物品详情，分类图标作为兜底。
        }
      }
      const today = getShanghaiDateOnly(Date.now())
      this.setData({
        item: {
          ...item,
          iconName: INVENTORY_CATEGORY_ICON_NAMES[item.category],
          ...resolveInventoryIcon({ name: item.name, category: item.category }),
          categoryLabel: getCategoryLabel(item.category),
          locationLabel: getLocationLabel(item.location),
          expiry: resolveExpiry(item.expiresOn, today),
          statusLabel: LIFECYCLE_LABELS[item.status],
          updatedAtLabel: formatShanghaiDateTime(item.updatedAt),
          expiresOnLabel: formatChineseDate(item.expiresOn),
          timeline: buildTimeline(item.events ?? [], item),
          imageSrc,
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

  async onQuickAdjust(event: { currentTarget: { dataset: { delta?: number | string } } }) {
    const delta = Number(event.currentTarget.dataset.delta ?? 0)
    const item = this.data.item
    if (!delta || !item || this.data.adjusting) return

    const base = Number(item.quantity)
    const current = Number.isFinite(base) ? base : 0
    const next = Math.max(0, Math.round((current + delta) * 100) / 100)
    if (next === current) return

    const previous = item.quantity
    this.setData({ adjusting: true, 'item.quantity': String(next) })
    try {
      const updated = await inventoryGateway.update(
        item.id,
        {
          name: item.name,
          category: item.category,
          quantity: String(next),
          unit: item.unit,
          location: item.location,
          purchasedOn: item.purchasedOn,
          openedOn: item.openedOn,
          expiresOn: item.expiresOn,
          note: item.note,
          imageMediaId: item.imageMediaId,
          iconKey: item.iconKey ?? '',
        },
        item.version,
      )
      this.setData({
        adjusting: false,
        'item.quantity': updated.quantity,
        'item.version': updated.version,
      })
      wx.showToast({ title: '库存已更新', icon: 'success', duration: 1200 })
    } catch (error) {
      this.setData({ adjusting: false, 'item.quantity': previous })
      wx.showToast({ title: '库存没有调整成功', icon: 'none' })
    }
  },

  onRetry() {
    void this.loadItem(this.data.id)
  },

  onBack() {
    navigateBackOrTab('/pages/inventory/index')
  },

  onEdit() {
    wx.navigateTo({ url: `/pages/item-form/index?id=${this.data.id}` })
  },

  onPreviewImage() {
    const src = this.data.item?.imageSrc
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
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
