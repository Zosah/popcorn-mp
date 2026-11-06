import { pullRefreshBehavior } from '../../utils/pull-refresh'
import { appConfig } from '../../config/env'
import {
  formatTravelDateRange,
  formatTravelDuration,
  resolveTravelTripStatus,
  travelStatusLabel,
  type TravelTripStatus,
} from '../../domain/travel'
import { hydrateAuthState } from '../../services/auth'
import { promptAuthGateIfNeeded, requireAuthForWrite } from '../../services/auth-preview'
import {
  invalidatePageCache,
  readPageCache,
  writePageCache,
} from '../../services/page-cache'
import { travelGateway } from '../../services/travel'
import {
  getTravelErrorMessage,
  isTravelVersionConflict,
  type TravelTemplate,
  type TravelTrip,
  type TravelTripItem,
} from '../../services/travel-gateway'
import { decodeQueryValue } from '../../utils/app-navigation'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

interface TravelTripItemView extends TravelTripItem {
  stateLabel: string
}

interface TravelTripView extends Omit<TravelTrip, 'items'> {
  items: TravelTripItemView[]
  dateRange: string
  durationLabel: string
  status: TravelTripStatus
  statusLabel: string
  packedCount: number
  itemCount: number
  unpackedCount: number
  packingPercent: number
}

interface TravelTemplateView extends TravelTemplate {
  itemCount: number
  itemPreview: string
}

interface TravelDetailCache {
  trip: TravelTrip
}

const DETAIL_CACHE_PREFIX = 'travel:detail:v1:'
const detailRequestGate = createRequestGate()

function cacheKey(id: string): string {
  return `${DETAIL_CACHE_PREFIX}${id}`
}

function toTripView(trip: TravelTrip): TravelTripView {
  const items = [...trip.items]
    .sort((left, right) => {
      if (left.packed !== right.packed) return left.packed ? 1 : -1
      return left.sortOrder - right.sortOrder
    })
    .map((item) => ({
      ...item,
      stateLabel: item.packed ? '已装好' : '待装',
    }))
  const itemCount = items.length
  const packedCount = items.filter((item) => item.packed).length
  const status = resolveTravelTripStatus(trip.departAt, trip.returnAt)
  return {
    ...trip,
    items,
    dateRange: formatTravelDateRange(trip.departAt, trip.returnAt),
    durationLabel: formatTravelDuration(trip.days, trip.nights),
    status,
    statusLabel: travelStatusLabel(status),
    packedCount,
    itemCount,
    unpackedCount: itemCount - packedCount,
    packingPercent: itemCount ? Math.round((packedCount / itemCount) * 100) : 0,
  }
}

function toTemplateView(template: TravelTemplate): TravelTemplateView {
  return {
    ...template,
    itemCount: template.items.length,
    itemPreview: template.items.length
      ? template.items.slice(0, 5).map((item) => item.name).join(' · ')
      : '这份清单还没有物品',
  }
}

function sortTemplates(templates: TravelTemplate[]): TravelTemplate[] {
  return [...templates].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  })
}

Page({
  behaviors: [pullRefreshBehavior],
  data: {
    id: '',
    trip: null as TravelTripView | null,
    loading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    loadError: '',
    mutating: false,
    activeItemId: '',
    quickAddName: '',
    quickAddFocused: false,
    templateSheetOpen: false,
    templateLoading: false,
    templateError: '',
    templates: [] as TravelTemplateView[],
    selectedTemplateId: '',
    importingTemplate: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = decodeQueryValue(options.id ?? '')
    this.setData({ id })
    if (!id) {
      wx.showToast({ title: '缺少行程信息', icon: 'none' })
      navigateBackOrTab('/pages/travel/index')
      return
    }
    const cached = readPageCache<TravelDetailCache>(cacheKey(id))
    if (!cached) return
    this.applyTrip(cached.value.trip, {
      loading: false,
      hasLoaded: true,
      cacheFresh: cached.fresh,
    })
  },

  onShow() {
    promptAuthGateIfNeeded()
    const firstShow = !this.data.hasShown
    if (firstShow) this.setData({ hasShown: true })
    if (firstShow && this.data.cacheFresh) return
    if (this.data.id) void this.refresh()
  },

  onPullRefreshTask() {
    void this.refresh(true)
  },

  onUnload() {
    detailRequestGate.invalidate()
  },

  async refresh(fromPullDown = false) {
    if (!this.data.id) return
    const sequence = detailRequestGate.begin()
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    const auth = await hydrateAuthState()
    if (!detailRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    if (!appConfig.demoMode && !auth.isLoggedIn) {
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.setData({
        trip: null,
        loading: false,
        hasLoaded: true,
        cacheFresh: false,
        loadError: '',
      })
      if (fromPullDown) wx.stopPullDownRefresh()
      promptAuthGateIfNeeded()
      return
    }

    this.setData({
      loading: !this.data.trip,
      loadError: '',
    })
    try {
      const trip = await travelGateway.getTrip(this.data.id)
      if (!detailRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!detailRequestGate.isCurrent(sequence)) return
      if (!trip) {
        wx.showToast({ title: '这次出行已经不存在', icon: 'none' })
        navigateBackOrTab('/pages/travel/index')
        return
      }
      this.applyTrip(trip, {
        loading: false,
        hasLoaded: true,
        cacheFresh: true,
        loadError: '',
      })
      wx.setNavigationBarTitle({ title: trip.title })
    } catch (error) {
      if (!detailRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!detailRequestGate.isCurrent(sequence)) return
      this.setData({
        loading: false,
        hasLoaded: true,
        loadError: getTravelErrorMessage(error, '行程暂时没有加载出来'),
      })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  applyTrip(trip: TravelTrip, extra: Record<string, unknown> = {}) {
    this.setData({
      trip: toTripView(trip),
      ...extra,
    })
    writePageCache<TravelDetailCache>(cacheKey(trip.id), { trip })
  },

  onRetryLoad() {
    void this.refresh()
  },

  onBack() {
    navigateBackOrTab('/pages/travel/index')
  },

  async onToggleItem(event: {
    currentTarget: { dataset: { id?: string } }
  }) {
    const trip = this.data.trip
    const itemId = event.currentTarget.dataset.id
    if (!trip || !itemId || this.data.mutating) return
    if (!requireAuthForWrite()) return
    const item = trip.items.find((entry) => entry.id === itemId)
    if (!item) return
    this.setData({ mutating: true, activeItemId: itemId })
    detailRequestGate.invalidate()
    try {
      const updated = await travelGateway.updateTripItem(
        trip.id,
        item.id,
        { name: item.name, packed: !item.packed },
        trip.version,
      )
      this.applyWrittenTrip(updated)
    } catch (error) {
      await this.handleWriteError(error)
    } finally {
      this.setData({ mutating: false, activeItemId: '' })
    }
  },

  onFocusQuickAdd() {
    if (!requireAuthForWrite()) return
    this.setData({ quickAddFocused: true })
  },

  onQuickAddInput(event: { detail: { value: string } }) {
    this.setData({ quickAddName: event.detail.value })
  },

  onQuickAddBlur() {
    this.setData({ quickAddFocused: false })
  },

  async onAddItem() {
    const trip = this.data.trip
    const name = this.data.quickAddName.trim()
    if (!trip || !name || this.data.mutating) return
    if (!requireAuthForWrite()) return
    this.setData({ mutating: true, quickAddFocused: false })
    detailRequestGate.invalidate()
    try {
      const updated = await travelGateway.addTripItem(
        trip.id,
        { name, packed: false },
        trip.version,
      )
      this.applyWrittenTrip(updated)
      this.setData({ quickAddName: '' })
      wx.showToast({ title: '已加入随身清单', icon: 'none' })
    } catch (error) {
      await this.handleWriteError(error)
    } finally {
      this.setData({ mutating: false })
    }
  },

  onRemoveItem(event: {
    currentTarget: { dataset: { id?: string } }
  }) {
    const trip = this.data.trip
    const itemId = event.currentTarget.dataset.id
    if (!trip || !itemId || this.data.mutating) return
    if (!requireAuthForWrite()) return
    const item = trip.items.find((entry) => entry.id === itemId)
    if (!item) return
    wx.showModal({
      title: `移除“${item.name}”？`,
      content: '只会从这次行程移除，不影响你的必备清单。',
      confirmText: '移除',
      confirmColor: '#b86757',
      success: (result) => {
        if (result.confirm) void this.removeItem(trip, item)
      },
    })
  },

  async removeItem(trip: TravelTripView, item: TravelTripItemView) {
    this.setData({ mutating: true, activeItemId: item.id })
    detailRequestGate.invalidate()
    try {
      const updated = await travelGateway.removeTripItem(
        trip.id,
        item.id,
        trip.version,
      )
      this.applyWrittenTrip(updated)
      wx.showToast({ title: '已从这次行程移除', icon: 'none' })
    } catch (error) {
      await this.handleWriteError(error)
    } finally {
      this.setData({ mutating: false, activeItemId: '' })
    }
  },

  async onOpenTemplates() {
    if (!requireAuthForWrite()) return
    this.setData({
      templateSheetOpen: true,
      templateLoading: true,
      templateError: '',
      selectedTemplateId: '',
      templates: [],
    })
    detailRequestGate.invalidate()
    try {
      const templates = sortTemplates(await travelGateway.listTemplates())
      const views = templates.map(toTemplateView)
      this.setData({
        templates: views,
        selectedTemplateId: views[0]?.id ?? '',
        templateLoading: false,
      })
    } catch (error) {
      this.setData({
        templateLoading: false,
        templateError: getTravelErrorMessage(error, '必备清单暂时没有加载出来'),
      })
    }
  },

  onCloseTemplates() {
    if (this.data.importingTemplate) return
    this.setData({ templateSheetOpen: false })
  },

  onSelectTemplate(event: {
    currentTarget: { dataset: { id?: string } }
  }) {
    const id = event.currentTarget.dataset.id
    if (!id || this.data.importingTemplate) return
    this.setData({ selectedTemplateId: id })
  },

  async onImportTemplate() {
    const trip = this.data.trip
    const templateId = this.data.selectedTemplateId
    if (!trip || !templateId || this.data.importingTemplate) return
    if (!requireAuthForWrite()) return
    const beforeCount = trip.itemCount
    this.setData({ importingTemplate: true })
    detailRequestGate.invalidate()
    try {
      const updated = await travelGateway.importTemplate(
        trip.id,
        templateId,
        trip.version,
      )
      this.applyWrittenTrip(updated)
      this.setData({ templateSheetOpen: false })
      const added = Math.max(0, updated.items.length - beforeCount)
      wx.showToast({
        title: added ? `已带入 ${added} 件物品` : '清单里的物品都已经在行程中',
        icon: 'none',
      })
    } catch (error) {
      await this.handleWriteError(error)
    } finally {
      this.setData({ importingTemplate: false })
    }
  },

  onEdit() {
    const trip = this.data.trip
    if (!trip || !requireAuthForWrite()) return
    wx.navigateTo({
      url: `/pages/travel-form/index?id=${encodeURIComponent(trip.id)}`,
    })
  },

  onCopy() {
    const trip = this.data.trip
    if (!trip || !requireAuthForWrite()) return
    wx.navigateTo({
      url: `/pages/travel-form/index?mode=copy&id=${encodeURIComponent(trip.id)}`,
    })
  },

  onDelete() {
    const trip = this.data.trip
    if (!trip || this.data.mutating) return
    if (!requireAuthForWrite()) return
    wx.showModal({
      title: '删除这次行程？',
      content: '行程和本次随身清单都会移除，必备清单会保留。',
      confirmText: '删除',
      confirmColor: '#b86757',
      success: (result) => {
        if (result.confirm) void this.removeTrip(trip)
      },
    })
  },

  async removeTrip(trip: TravelTripView) {
    this.setData({ mutating: true })
    detailRequestGate.invalidate()
    try {
      await travelGateway.removeTrip(trip.id, trip.version)
      invalidatePageCache('travel:')
      wx.showToast({ title: '行程已删除', icon: 'none' })
      setTimeout(() => navigateBackOrTab('/pages/travel/index'), 260)
    } catch (error) {
      await this.handleWriteError(error)
    } finally {
      this.setData({ mutating: false })
    }
  },

  applyWrittenTrip(trip: TravelTrip) {
    this.applyTrip(trip)
    invalidatePageCache('travel:overview')
  },

  async handleWriteError(error: unknown) {
    if (isTravelVersionConflict(error)) {
      const reload = await showModal(
        '行程已经在别处更新',
        '重新取回最新内容后再继续操作。',
        '重新载入',
      )
      if (reload) void this.refresh()
      return
    }
    wx.showToast({
      title: getTravelErrorMessage(error, '刚才的操作没有完成'),
      icon: 'none',
    })
  },

  noop() {},
})

function showModal(title: string, content: string, confirmText: string): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText,
      cancelText: '稍后',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
}
