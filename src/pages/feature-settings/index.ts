import { appConfig } from '../../config/env'
import {
  getFeatureCategoryGroups,
  getFeatureDefinition,
  type FeatureCategoryDefinition,
  type FeatureDefinition,
  type FeatureId,
} from '../../domain/feature-catalog'
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

interface SlotView {
  id: FeatureId
  label: string
  shortLabel: string
  description: string
  icon: string
  tone: 'blue' | 'green' | 'gold' | 'pink' | 'orange'
}

interface TabPreviewItem extends SlotView {
  fixed: boolean
}

interface CandidateView extends FeatureDefinition {
  selected: boolean
  disabled: boolean
  stateLabel: string
}

interface CandidateGroupView {
  key: string
  category: FeatureCategoryDefinition
  items: CandidateView[]
}

interface SlotRect {
  centerX: number
  centerY: number
}

const SLOT_LABELS: Record<ConfigRegion, string[]> = {
  home: ['第一个快捷', '第二个快捷', '第三个快捷', '第四个快捷'],
  tab: ['左一入口', '左二入口', '左三入口'],
}

let longPressTimer: ReturnType<typeof setTimeout> | undefined
let suppressTapTimer: ReturnType<typeof setTimeout> | undefined
let suppressSlotTap = false
let slotRects: SlotRect[] = []

function cloneConfig(config: FeatureSettingsConfig): FeatureSettingsConfig {
  return normalizeFeatureSettings({
    homeSlots: [...config.homeSlots],
    tabSlots: [...config.tabSlots],
  })
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

function toSlotView(id: FeatureId): SlotView {
  const feature = getFeatureDefinition(id)
  if (!feature) throw new Error(`配置引用了未知功能：${id}`)
  return {
    id: feature.id,
    label: feature.label,
    shortLabel: feature.shortLabel,
    description: feature.description,
    icon: feature.icon,
    tone: feature.tone,
  }
}

function buildSlotViews(config: FeatureSettingsConfig, region: ConfigRegion): SlotView[] {
  return regionSlots(config, region).map(toSlotView)
}

function buildTabPreview(config: FeatureSettingsConfig): TabPreviewItem[] {
  const middle = config.tabSlots.map((id) => ({ ...toSlotView(id), fixed: false }))
  return [
    {
      id: 'journal',
      label: '家',
      shortLabel: '家',
      description: '首页',
      icon: 'house',
      tone: 'blue',
      fixed: true,
    },
    ...middle,
    {
      id: 'pets',
      label: '我的',
      shortLabel: '我的',
      description: '个人中心',
      icon: 'user-round',
      tone: 'green',
      fixed: true,
    },
  ]
}

function buildCandidateGroups(
  config: FeatureSettingsConfig,
  region: ConfigRegion,
  editingIndex: number,
): CandidateGroupView[] {
  const slots = regionSlots(config, region)
  const currentId = slots[editingIndex]
  return getFeatureCategoryGroups(region).map((group) => ({
    key: group.category.id,
    category: group.category,
    items: group.items.map((feature) => {
      const selected = feature.id === currentId
      const duplicated = !selected && slots.includes(feature.id)
      return {
        ...feature,
        selected,
        disabled: duplicated,
        stateLabel: selected ? '当前' : duplicated ? '已在本区' : '',
      }
    }),
  }))
}

Page({
  data: {
    initialLoading: true,
    hasLoaded: false,
    saving: false,
    syncText: appConfig.demoMode ? '本机保存' : '正在同步',
    errorText: '',
    activeRegion: 'home' as ConfigRegion,
    regionTitle: '首页快捷',
    regionCopy: '打开小程序，第一眼就能用到',
    slots: [] as SlotView[],
    tabPreview: [] as TabPreviewItem[],
    candidateGroups: [] as CandidateGroupView[],
    pickerOpen: false,
    editingIndex: -1,
    pickerTitle: '',
    version: 1,
    updatedAt: '',
    config: cloneConfig({
      homeSlots: ['journal', 'inventory', 'todo', 'pets'],
      tabSlots: ['pets', 'journal', 'todo'],
    }),
    savedConfig: cloneConfig({
      homeSlots: ['journal', 'inventory', 'todo', 'pets'],
      tabSlots: ['pets', 'journal', 'todo'],
    }),
    draggingIndex: -1,
  },

  onLoad() {
    void this.loadSettings()
  },

  onUnload() {
    this.clearLongPress()
    if (suppressTapTimer) clearTimeout(suppressTapTimer)
  },

  async loadSettings() {
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    this.setData({ initialLoading: firstLoad, errorText: '' })
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
      this.setData({
        initialLoading: false,
        hasLoaded: true,
        syncText: '本机保存',
      })
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
        errorText: getFeatureSettingsErrorMessage(error, '功能配置暂时没有同步过来'),
        syncText: '使用本机版本',
      })
    }
  },

  applySettings(
    config: FeatureSettingsConfig,
    savedConfig: FeatureSettingsConfig,
    version?: number,
    updatedAt?: string,
  ) {
    const nextVersion = version ?? this.data.version
    const nextUpdatedAt = updatedAt ?? this.data.updatedAt
    const normalized = cloneConfig(config)
    const saved = cloneConfig(savedConfig)
    this.setData({
      config: normalized,
      savedConfig: saved,
      version: nextVersion,
      updatedAt: nextUpdatedAt,
      slots: buildSlotViews(normalized, this.data.activeRegion),
      tabPreview: buildTabPreview(normalized),
      candidateGroups: [],
      pickerOpen: false,
      editingIndex: -1,
      draggingIndex: -1,
    }, () => this.prepareSlotRects())
  },

  renderConfig(
    config: FeatureSettingsConfig,
    options: { saved?: boolean; version?: number; updatedAt?: string } = {},
  ) {
    const normalized = cloneConfig(config)
    const savedConfig = options.saved ? normalized : this.data.savedConfig
    this.setData({
      config: normalized,
      savedConfig,
      version: options.version ?? this.data.version,
      updatedAt: options.updatedAt ?? this.data.updatedAt,
      slots: buildSlotViews(normalized, this.data.activeRegion),
      tabPreview: buildTabPreview(normalized),
      candidateGroups: [],
      pickerOpen: false,
      editingIndex: -1,
      draggingIndex: -1,
    }, () => this.prepareSlotRects())
  },

  onSwitchRegion(event: {
    currentTarget: { dataset: { region?: ConfigRegion } }
  }) {
    const region = event.currentTarget.dataset.region
    if (!region || region === this.data.activeRegion || this.data.saving) return
    this.setData({
      activeRegion: region,
      regionTitle: region === 'home' ? '首页快捷' : '底部导航',
      regionCopy: region === 'home'
        ? '打开小程序，第一眼就能用到'
        : '家和我之间，放最常去的地方',
      slots: buildSlotViews(this.data.config, region),
      tabPreview: buildTabPreview(this.data.config),
      pickerOpen: false,
      editingIndex: -1,
      draggingIndex: -1,
    }, () => this.prepareSlotRects())
  },

  prepareSlotRects() {
    wx.createSelectorQuery()
      .selectAll('.feature-slot')
      .boundingClientRect((result) => {
        slotRects = (result as unknown as Array<{
          left: number
          top: number
          width: number
          height: number
        }>).map((rect) => ({
          centerX: rect.left + rect.width / 2,
          centerY: rect.top + rect.height / 2,
        }))
      })
      .exec()
  },

  onSlotTouchStart(event: WechatMiniprogram.TouchEvent) {
    if (this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index)) return
    this.clearLongPress()
    this.prepareSlotRects()
    longPressTimer = setTimeout(() => {
      this.setData({ draggingIndex: index })
      wx.vibrateShort?.({ type: 'light' })
    }, 350)
  },

  onSlotTouchMove(event: WechatMiniprogram.TouchEvent) {
    const index = this.data.draggingIndex
    if (index < 0 || slotRects.length === 0) return
    const touch = event.touches[0]
    if (!touch) return
    let targetIndex = -1
    let nearestDistance = Number.POSITIVE_INFINITY
    slotRects.forEach((rect, rectIndex) => {
      const distance = Math.hypot(
        touch.clientX - rect.centerX,
        touch.clientY - rect.centerY,
      )
      if (distance < nearestDistance) {
        nearestDistance = distance
        targetIndex = rectIndex
      }
    })
    if (targetIndex < 0 || targetIndex === index) return
    this.moveSlot(index, targetIndex)
  },

  onSlotTouchEnd() {
    this.clearLongPress()
    const index = this.data.draggingIndex
    if (index < 0) return
    const changed = JSON.stringify(this.data.config) !== JSON.stringify(this.data.savedConfig)
    suppressSlotTap = changed
    if (suppressTapTimer) clearTimeout(suppressTapTimer)
    if (changed) {
      suppressTapTimer = setTimeout(() => {
        suppressSlotTap = false
      }, 400)
    }
    this.setData({ draggingIndex: -1 })
    if (changed) void this.persistConfig(this.data.config, this.data.savedConfig, '顺序已保存')
  },

  moveSlot(fromIndex: number, toIndex: number) {
    const region = this.data.activeRegion
    const slots = [...regionSlots(this.data.config, region)]
    const [moving] = slots.splice(fromIndex, 1)
    if (!moving) return
    slots.splice(toIndex, 0, moving)
    const next = withRegionSlots(cloneConfig(this.data.config), region, slots)
    this.setData({
      config: next,
      savedConfig: this.data.savedConfig,
      slots: buildSlotViews(next, region),
      tabPreview: buildTabPreview(next),
      draggingIndex: toIndex,
    }, () => this.prepareSlotRects())
  },

  onEditSlot(event: {
    currentTarget: { dataset: { index?: number } }
  }) {
    if (suppressSlotTap || this.data.saving || this.data.draggingIndex >= 0) return
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0) return
    this.openPicker(index)
  },

  openPicker(index: number) {
    const region = this.data.activeRegion
    this.setData({
      pickerOpen: true,
      editingIndex: index,
      pickerTitle: SLOT_LABELS[region][index] ?? '更换功能',
      candidateGroups: buildCandidateGroups(this.data.config, region, index),
    })
  },

  onClosePicker() {
    if (this.data.saving) return
    this.setData({ pickerOpen: false, editingIndex: -1, candidateGroups: [] })
  },

  onKeepPicker() {
    // 阻止点击面板内部时冒泡关闭。
  },

  onSelectCandidate(event: {
    currentTarget: { dataset: { id?: string } }
  }) {
    const id = event.currentTarget.dataset.id as FeatureId | undefined
    const feature = id ? getFeatureDefinition(id) : undefined
    if (!feature || this.data.saving) return
    const region = this.data.activeRegion
    const slots = [...regionSlots(this.data.config, region)]
    const index = this.data.editingIndex
    if (index < 0) return
    if (slots[index] === feature.id) {
      this.onClosePicker()
      return
    }
    if (slots.includes(feature.id)) {
      wx.showToast({ title: '这个功能已经在当前快捷里', icon: 'none' })
      return
    }
    slots[index] = feature.id
    const next = withRegionSlots(cloneConfig(this.data.config), region, slots)
    this.renderConfig(next)
    void this.persistConfig(next, this.data.savedConfig, '快捷入口已更新')
  },

  onResetDefault() {
    if (this.data.saving) return
    wx.showModal({
      title: '恢复默认排列？',
      content: '首页快捷和底部导航都会恢复成初始的 4 个和 3 个功能。',
      confirmText: '恢复默认',
      confirmColor: '#5d7567',
      success: (result) => {
        if (!result.confirm) return
        const next = normalizeFeatureSettings({})
        this.renderConfig(next)
        void this.persistConfig(next, this.data.savedConfig, '已恢复默认排列')
      },
    })
  },

  async persistConfig(
    nextConfig: FeatureSettingsConfig,
    fallbackConfig: FeatureSettingsConfig,
    successText: string,
  ) {
    this.setData({
      saving: true,
      errorText: '',
      syncText: '正在保存',
      pickerOpen: false,
      editingIndex: -1,
    })
    try {
      const saved = await featureSettingsGateway.update(nextConfig, this.data.version)
      this.renderConfig(saved, {
        saved: true,
        version: saved.version,
        updatedAt: saved.updatedAt,
      })
      this.setData({
        saving: false,
        syncText: appConfig.demoMode ? '已保存在本机' : '已同步到空间',
      })
      wx.showToast({ title: successText, icon: 'none' })
    } catch (error) {
      const conflict = isFeatureSettingsVersionConflict(error)
      this.renderConfig(fallbackConfig)
      this.setData({
        saving: false,
        syncText: '保留上一次设置',
        errorText: conflict
          ? '配置已在另一台设备更新，已回到你上次保存的版本，请下拉刷新后再改。'
          : getFeatureSettingsErrorMessage(error, '这次没有保存成功，请稍后再试'),
      })
    }
  },

  onRetry() {
    if (this.data.saving || this.data.initialLoading) return
    void this.loadSettings()
  },

  onPullDownRefresh() {
    void this.loadSettings().finally(() => wx.stopPullDownRefresh())
  },

  onOpenFeatureList() {
    wx.navigateTo({ url: '/pages/feature-list/index' })
  },

  clearLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer)
      longPressTimer = undefined
    }
  },
})
