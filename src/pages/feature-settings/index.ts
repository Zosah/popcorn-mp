import { appConfig } from '../../config/env'
import {
  getFeatureCategoryGroups,
  getFeatureDefinition,
  isFeatureAvailableIn,
  type FeatureCategoryDefinition,
  type FeatureDefinition,
  type FeatureId,
  type FeatureTone,
} from '../../domain/feature-catalog'
import {
  moveFeatureWithinSlots,
  placeFeatureInSlots,
  swapFeatureAcrossSlots,
} from '../../domain/feature-layout'
import { hydrateAuthState } from '../../services/auth'
import {
  buildFeatureSettingsOwnerId,
  getFeatureSettingsSnapshot,
  normalizeFeatureSettings,
  type FeatureSettingsConfig,
} from '../../services/feature-settings-config'
import {
  featureSettingsGateway,
  syncFeatureSettings,
} from '../../services/feature-settings'
import {
  getFeatureSettingsErrorMessage,
  isFeatureSettingsVersionConflict,
} from '../../services/feature-settings-gateway'
import { waitForMinimumLoading } from '../../utils/loading'

type ConfigRegion = 'home' | 'tab'
type DragSource = 'pool' | 'slot'
type FeaturePlacement = 'home' | 'tab' | ''

interface FeatureTileView {
  id: FeatureId
  label: string
  shortLabel: string
  description: string
  icon: string
  tone: FeatureTone
  tabEligible: boolean
  placement: FeaturePlacement
  placementLabel: string
  occupied: boolean
}

interface FeatureCategoryView {
  key: string
  category: FeatureCategoryDefinition
  items: FeatureTileView[]
}

interface PlacementSlotView extends FeatureTileView {
  order: number
}

interface DragPending {
  source: DragSource
  id: FeatureId
  sourceRegion: ConfigRegion | ''
  sourceIndex: number
  startX: number
  startY: number
}

interface DropRect {
  region: ConfigRegion
  index: number
  left: number
  top: number
  right: number
  bottom: number
}

const DRAG_ACTIVATION_MS = 280
const DRAG_MOVE_TOLERANCE = 12

let pressTimer: ReturnType<typeof setTimeout> | undefined
let suppressTapTimer: ReturnType<typeof setTimeout> | undefined
let pendingDrag: DragPending | undefined
let dropRects: DropRect[] = []
let suppressTap = false
let dragEndHandled = false

function cloneConfig(config: FeatureSettingsConfig): FeatureSettingsConfig {
  return normalizeFeatureSettings({
    homeSlots: [...config.homeSlots],
    tabSlots: [...config.tabSlots],
  })
}

function defaultConfig(): FeatureSettingsConfig {
  return normalizeFeatureSettings({})
}

function regionSlots(config: FeatureSettingsConfig, region: ConfigRegion): FeatureId[] {
  return region === 'home' ? config.homeSlots : config.tabSlots
}

function withRegionSlots(
  config: FeatureSettingsConfig,
  region: ConfigRegion,
  slots: FeatureId[],
): FeatureSettingsConfig {
  return region === 'home'
    ? { ...config, homeSlots: slots }
    : { ...config, tabSlots: slots }
}

function placementForFeature(config: FeatureSettingsConfig, id: FeatureId): FeaturePlacement {
  if (config.homeSlots.includes(id)) return 'home'
  if (config.tabSlots.includes(id)) return 'tab'
  return ''
}

function toFeatureTile(
  feature: FeatureDefinition,
  config: FeatureSettingsConfig,
): FeatureTileView {
  const placement = placementForFeature(config, feature.id)
  return {
    id: feature.id,
    label: feature.label,
    shortLabel: feature.shortLabel,
    description: feature.description,
    icon: feature.icon,
    tone: feature.tone,
    tabEligible: feature.tabEligible,
    placement,
    placementLabel: placement === 'home' ? '首页' : placement === 'tab' ? '导航' : '',
    occupied: Boolean(placement),
  }
}

function buildFeatureGroups(config: FeatureSettingsConfig): FeatureCategoryView[] {
  return getFeatureCategoryGroups('list').map((group) => ({
    key: group.category.id,
    category: group.category,
    items: group.items.map((feature) => toFeatureTile(feature, config)),
  }))
}

function buildSlots(config: FeatureSettingsConfig, region: ConfigRegion): PlacementSlotView[] {
  return regionSlots(config, region).map((id, index) => {
    const feature = getFeatureDefinition(id)
    if (!feature) throw new Error(`配置引用了未知功能：${id}`)
    return { ...toFeatureTile(feature, config), order: index + 1 }
  })
}

function configChanged(current: FeatureSettingsConfig, saved: FeatureSettingsConfig): boolean {
  return JSON.stringify(current) !== JSON.stringify(saved)
}

Page({
  data: {
    initialLoading: true,
    hasLoaded: false,
    saving: false,
    dirty: false,
    versionConflict: false,
    syncText: appConfig.demoMode ? '本机保存' : '已同步到空间',
    saveError: '',
    featureGroups: [] as FeatureCategoryView[],
    featureCount: 0,
    homeSlots: [] as PlacementSlotView[],
    tabSlots: [] as PlacementSlotView[],
    version: 1,
    updatedAt: '',
    config: defaultConfig(),
    savedConfig: defaultConfig(),
    dragActive: false,
    dragLabel: '',
    dragIcon: '',
    dragTone: 'green' as FeatureTone,
    dragX: 0,
    dragY: 0,
    dropRegion: '' as ConfigRegion | '',
    dropIndex: -1,
    dropBlocked: false,
  },

  onBack() {
    if (this.data.saving) {
      wx.showToast({ title: '正在保存，请稍候', icon: 'none' })
      return
    }
    if (getCurrentPages().length > 1) {
      wx.navigateBack()
      return
    }
    wx.reLaunch({ url: '/pages/settings/index' })
  },

  onLoad() {
    const initial = defaultConfig()
    this.setData({
      featureGroups: buildFeatureGroups(initial),
      featureCount: initial.homeSlots.length + initial.tabSlots.length,
    })
    void this.loadSettings()
  },

  onUnload() {
    this.clearPressTimer()
    if (suppressTapTimer) clearTimeout(suppressTapTimer)
    pendingDrag = undefined
    dropRects = []
  },

  async loadSettings() {
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    this.setData({
      initialLoading: firstLoad,
      saveError: '',
      versionConflict: false,
    })

    const auth = await hydrateAuthState()
    if (!auth.isLoggedIn) {
      this.setData({ initialLoading: false, hasLoaded: true })
      wx.navigateTo({ url: '/pages/auth/index?mode=login' })
      return
    }

    const ownerId = buildFeatureSettingsOwnerId(auth.user?.id ?? '', auth.activeSpaceId)
    const local = getFeatureSettingsSnapshot(ownerId)
    this.applySettings(local, local, local.version, local.updatedAt)
    if (firstLoad) await waitForMinimumLoading(startedAt)
    if (appConfig.demoMode) {
      this.setData({ initialLoading: false, hasLoaded: true, syncText: '本机保存' })
      return
    }

    try {
      const synced = await syncFeatureSettings()
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.applySettings(synced, synced, synced.version, synced.updatedAt)
      this.setData({
        initialLoading: false,
        hasLoaded: true,
        syncText: '已同步到空间',
      })
    } catch (error) {
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.setData({
        initialLoading: false,
        hasLoaded: true,
        saveError: getFeatureSettingsErrorMessage(error, '暂时无法读取空间配置，当前显示本机版本'),
        syncText: '当前为本机版本',
      })
    }
  },

  applySettings(
    config: FeatureSettingsConfig,
    savedConfig: FeatureSettingsConfig,
    version?: number,
    updatedAt?: string,
  ) {
    const normalized = cloneConfig(config)
    const saved = cloneConfig(savedConfig)
    this.setData({
      config: normalized,
      savedConfig: saved,
      version: version ?? this.data.version,
      updatedAt: updatedAt ?? this.data.updatedAt,
      featureGroups: buildFeatureGroups(normalized),
      featureCount: normalized.homeSlots.length + normalized.tabSlots.length,
      homeSlots: buildSlots(normalized, 'home'),
      tabSlots: buildSlots(normalized, 'tab'),
      dirty: configChanged(normalized, saved),
      saveError: '',
      versionConflict: false,
    })
  },

  updateConfig(next: FeatureSettingsConfig) {
    const normalized = cloneConfig(next)
    this.setData({
      config: normalized,
      featureGroups: buildFeatureGroups(normalized),
      featureCount: normalized.homeSlots.length + normalized.tabSlots.length,
      homeSlots: buildSlots(normalized, 'home'),
      tabSlots: buildSlots(normalized, 'tab'),
      dirty: configChanged(normalized, this.data.savedConfig),
      saveError: '',
      versionConflict: false,
    })
  },

  onSave() {
    if (this.data.saving) return
    if (!this.data.dirty) {
      wx.showToast({ title: '配置没有变化', icon: 'none' })
      return
    }
    void this.saveConfig()
  },

  async saveConfig() {
    this.setData({ saving: true, saveError: '', versionConflict: false, syncText: '正在保存' })
    try {
      const saved = await featureSettingsGateway.update(this.data.config, this.data.version)
      this.applySettings(saved, saved, saved.version, saved.updatedAt)
      this.setData({
        saving: false,
        syncText: appConfig.demoMode ? '已保存在本机' : '已同步到空间',
      })
      wx.showToast({ title: '配置已保存', icon: 'success' })
    } catch (error) {
      const conflict = isFeatureSettingsVersionConflict(error)
      this.setData({
        saving: false,
        syncText: '尚未保存',
        versionConflict: conflict,
        saveError: conflict
          ? '配置已在另一台设备更新。当前修改还在，你可以先载入最新版本再重新调整。'
          : getFeatureSettingsErrorMessage(error, '保存失败，请检查网络后再试'),
      })
    }
  },

  onReloadSettings() {
    if (this.data.saving) return
    wx.showModal({
      title: '载入最新配置？',
      content: '当前未保存的调整会被放弃。',
      confirmText: '载入最新',
      confirmColor: '#5d7567',
      success: (result) => {
        if (result.confirm) void this.loadSettings()
      },
    })
  },

  onResetDefault() {
    if (this.data.saving) return
    wx.showModal({
      title: '恢复默认布局？',
      content: '只恢复当前页面里的排列，点击保存后才会生效。',
      confirmText: '恢复默认',
      confirmColor: '#5d7567',
      success: (result) => {
        if (!result.confirm) return
        this.updateConfig(defaultConfig())
      },
    })
  },

  onPullDownRefresh() {
    if (this.data.dirty) {
      wx.showModal({
        title: '放弃未保存的修改？',
        content: '刷新会载入空间里的最新配置。',
        confirmText: '放弃并刷新',
        confirmColor: '#8a5e50',
        success: (result) => {
          if (result.confirm) void this.loadSettings().finally(() => wx.stopPullDownRefresh())
          else wx.stopPullDownRefresh()
        },
      })
      return
    }
    void this.loadSettings().finally(() => wx.stopPullDownRefresh())
  },

  onFeatureTap() {
    if (suppressTap || this.data.dragActive) return
    wx.showToast({ title: '长按功能，拖到下方位置', icon: 'none' })
  },

  onSlotTap() {
    if (suppressTap || this.data.dragActive) return
    wx.showToast({ title: '长按拖动，可调整位置', icon: 'none' })
  },

  onDragTouchStart(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving) return
    const dataset = event.currentTarget.dataset as {
      source?: DragSource
      id?: string
      region?: ConfigRegion
      index?: number
    }
    const touch = event.touches[0]
    const feature = getFeatureDefinition(dataset.id ?? '')
    if (!touch || !feature || !dataset.source) return
    if (dataset.source === 'pool') {
      const placement = placementForFeature(this.data.config, feature.id)
      if (placement) {
        wx.showToast({
          title: placement === 'home' ? '这个功能已用于首页' : '这个功能已用于导航',
          icon: 'none',
        })
        return
      }
    }

    this.clearPressTimer()
    dragEndHandled = false
    pendingDrag = {
      source: dataset.source,
      id: feature.id,
      sourceRegion: dataset.region ?? '',
      sourceIndex: Number.isInteger(Number(dataset.index)) ? Number(dataset.index) : -1,
      startX: touch.clientX,
      startY: touch.clientY,
    }
    this.prepareDropRects()

    pressTimer = setTimeout(() => {
      const active = pendingDrag
      if (!active) return
      this.setData({
        dragActive: true,
        dragLabel: feature.shortLabel,
        dragIcon: feature.icon,
        dragTone: feature.tone,
        dragX: active.startX,
        dragY: active.startY,
      })
      wx.vibrateShort?.({ type: 'light' })
      this.updateDropTarget(active.startX, active.startY)
    }, DRAG_ACTIVATION_MS)
  },

  onDragTouchMove(event: WechatMiniprogram.TouchEvent) {
    const preventDefault = (event as unknown as { preventDefault?: () => void }).preventDefault
    preventDefault?.()
    const active = pendingDrag
    const touch = event.touches[0]
    if (!active || !touch) return

    if (!this.data.dragActive) {
      const distance = Math.hypot(touch.clientX - active.startX, touch.clientY - active.startY)
      if (distance > DRAG_MOVE_TOLERANCE) this.clearPressTimer()
      return
    }

    this.setData({ dragX: touch.clientX, dragY: touch.clientY })
    this.updateDropTarget(touch.clientX, touch.clientY)
  },

  onDragTouchEnd() {
    if (dragEndHandled) return
    dragEndHandled = true
    const active = pendingDrag
    const wasActive = this.data.dragActive
    const region = this.data.dropRegion
    const index = this.data.dropIndex
    const blocked = this.data.dropBlocked
    this.clearPressTimer()
    pendingDrag = undefined
    this.setData({
      dragActive: false,
      dropRegion: '',
      dropIndex: -1,
      dropBlocked: false,
    })

    if (!wasActive) return
    this.suppressNextTap()
    if (!active || !region || index < 0) return
    if (blocked) {
      wx.showToast({ title: '这个功能不能放到下方导航', icon: 'none' })
      return
    }
    this.applyDrop(active, region, index)
  },

  onDragTouchCancel() {
    this.onDragTouchEnd()
  },

  prepareDropRects() {
    const query = wx.createSelectorQuery().in(this)
    query.selectAll('.drop-slot--home').boundingClientRect()
    query.selectAll('.drop-slot--tab').boundingClientRect()
    query.exec((result) => {
      const toRects = (
        value: unknown,
        region: ConfigRegion,
      ): DropRect[] => (value as Array<{
        left: number
        top: number
        right: number
        bottom: number
      }> | null ?? []).map((rect, index) => ({
        region,
        index,
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      }))
      dropRects = [
        ...toRects(result[0], 'home'),
        ...toRects(result[1], 'tab'),
      ]
    })
  },

  updateDropTarget(x: number, y: number) {
    const target = dropRects.find((rect) => (
      x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
    ))
    if (!target) {
      if (this.data.dropRegion || this.data.dropIndex >= 0 || this.data.dropBlocked) {
        this.setData({ dropRegion: '', dropIndex: -1, dropBlocked: false })
      }
      return
    }

    const active = pendingDrag
    const feature = active ? getFeatureDefinition(active.id) : undefined
    const blocked = target.region === 'tab' && (!feature || !isFeatureAvailableIn(feature, 'tab'))
    if (
      this.data.dropRegion === target.region
      && this.data.dropIndex === target.index
      && this.data.dropBlocked === blocked
    ) return
    this.setData({
      dropRegion: target.region,
      dropIndex: target.index,
      dropBlocked: blocked,
    })
  },

  applyDrop(active: DragPending, region: ConfigRegion, targetIndex: number) {
    const current = cloneConfig(this.data.config)
    let next = current

    if (
      active.source === 'slot'
      && active.sourceRegion
      && active.sourceRegion !== region
      && active.sourceIndex >= 0
    ) {
      const swapped = swapFeatureAcrossSlots(
        regionSlots(current, active.sourceRegion),
        active.sourceIndex,
        regionSlots(current, region),
        targetIndex,
      )
      next = withRegionSlots(current, active.sourceRegion, swapped.source)
      next = withRegionSlots(next, region, swapped.target)
    } else if (
      active.source === 'slot'
      && active.sourceRegion === region
      && active.sourceIndex >= 0
    ) {
      next = withRegionSlots(
        current,
        region,
        moveFeatureWithinSlots(regionSlots(current, region), active.sourceIndex, targetIndex),
      )
    } else {
      next = withRegionSlots(
        current,
        region,
        placeFeatureInSlots(regionSlots(current, region), active.id, targetIndex),
      )
    }

    if (!configChanged(current, next)) return
    this.updateConfig(next)
  },

  suppressNextTap() {
    suppressTap = true
    if (suppressTapTimer) clearTimeout(suppressTapTimer)
    suppressTapTimer = setTimeout(() => {
      suppressTap = false
    }, 360)
  },

  clearPressTimer() {
    if (pressTimer) {
      clearTimeout(pressTimer)
      pressTimer = undefined
    }
  },
})
