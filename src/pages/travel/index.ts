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
import { readPageCache, writePageCache } from '../../services/page-cache'
import { travelGateway } from '../../services/travel'
import {
  getTravelErrorMessage,
  type TravelTemplate,
  type TravelTemplateWriteInput,
  type TravelTrip,
} from '../../services/travel-gateway'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

type TravelTab = 'trips' | 'templates'

interface TravelTripView extends TravelTrip {
  dateRange: string
  durationLabel: string
  status: TravelTripStatus
  statusLabel: string
  packedCount: number
  itemCount: number
  packingPercent: number
  itemPreview: string
}

interface TravelTripGroup {
  key: TravelTripStatus
  label: string
  hint: string
  items: TravelTripView[]
}

interface TravelTemplateView extends TravelTemplate {
  itemCount: number
  itemPreview: string
}

interface TemplateEditorDraft {
  id: string
  title: string
  isDefault: boolean
  version: number
  items: string[]
}

interface TravelPageCache {
  trips: TravelTrip[]
  templates: TravelTemplate[]
  activeTab: TravelTab
}

const TRAVEL_PAGE_CACHE_KEY = 'travel:overview:v1'
const travelRequestGate = createRequestGate()

function toTripView(trip: TravelTrip): TravelTripView {
  const itemCount = trip.items.length
  const packedCount = trip.items.filter((item) => item.packed).length
  const status = resolveTravelTripStatus(trip.departAt, trip.returnAt)
  return {
    ...trip,
    dateRange: formatTravelDateRange(trip.departAt, trip.returnAt),
    durationLabel: formatTravelDuration(trip.days, trip.nights),
    status,
    statusLabel: travelStatusLabel(status),
    packedCount,
    itemCount,
    packingPercent: itemCount ? Math.round((packedCount / itemCount) * 100) : 0,
    itemPreview: itemCount
      ? trip.items.slice(0, 3).map((item) => item.name).join(' · ')
      : '还没有整理物品',
  }
}

function buildTripGroups(trips: TravelTrip[]): TravelTripGroup[] {
  const views = trips.map(toTripView)
  const byDepart = (left: TravelTripView, right: TravelTripView) => (
    Date.parse(left.departAt) - Date.parse(right.departAt)
  )
  const groups: TravelTripGroup[] = [
    {
      key: 'traveling',
      label: '正在途中',
      hint: '已经出发的行程',
      items: views.filter((trip) => trip.status === 'traveling').sort(byDepart),
    },
    {
      key: 'upcoming',
      label: '即将出发',
      hint: '按出发时间排好',
      items: views.filter((trip) => trip.status === 'upcoming').sort(byDepart),
    },
    {
      key: 'ended',
      label: '走过的地方',
      hint: '随时可以复制再出发',
      items: views.filter((trip) => trip.status === 'ended').sort((left, right) => -byDepart(left, right)),
    },
  ]
  return groups.filter((group) => group.items.length > 0)
}

function toTemplateView(template: TravelTemplate): TravelTemplateView {
  return {
    ...template,
    itemCount: template.items.length,
    itemPreview: template.items.length
      ? template.items.slice(0, 4).map((item) => item.name).join(' · ')
      : '还没有物品',
  }
}

function sortTemplates(templates: TravelTemplate[]): TravelTemplate[] {
  return [...templates].sort((left, right) => {
    if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1
    return Date.parse(right.updatedAt) - Date.parse(left.updatedAt)
  })
}

Page({
  data: {
    activeTab: 'trips' as TravelTab,
    trips: [] as TravelTrip[],
    tripGroups: [] as TravelTripGroup[],
    templates: [] as TravelTemplate[],
    templateViews: [] as TravelTemplateView[],
    tripCount: 0,
    upcomingCount: 0,
    templateCount: 0,
    loading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    loadError: '',
    templateEditorOpen: false,
    templateSaving: false,
    templateDeleting: false,
    statusBarHeight: 20,
    navActionOffset: 24,
    templateDraft: {
      id: '',
      title: '',
      isDefault: false,
      version: 0,
      items: [''],
    } as TemplateEditorDraft,
  },

  onLoad() {
    this.measureNavBar()
    const cached = readPageCache<TravelPageCache>(TRAVEL_PAGE_CACHE_KEY)
    if (!cached) return
    this.applyData(cached.value.trips, cached.value.templates, {
      activeTab: cached.value.activeTab,
      cacheFresh: true,
      hasLoaded: true,
      loading: false,
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

  onUnload() {
    travelRequestGate.invalidate()
  },

  measureNavBar() {
    try {
      const windowInfo = wx.getWindowInfo()
      const statusBarHeight = windowInfo.statusBarHeight || 20
      const menu = wx.getMenuButtonBoundingClientRect()
      // 标题仍从状态栏下开始，操作按钮顺延到微信胶囊下方；
      // 两者共用同一右边界，避免按钮看起来悬在页面中间。
      const navActionOffset = Math.max(16, menu.bottom - (statusBarHeight + 10) + 1)
      this.setData({ statusBarHeight, navActionOffset })
    } catch {
      this.setData({ statusBarHeight: 20, navActionOffset: 24 })
    }
  },

  async refresh(fromPullDown = false) {
    const sequence = travelRequestGate.begin()
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    const auth = await hydrateAuthState()
    if (!travelRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    if (!appConfig.demoMode && !auth.isLoggedIn) {
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.setData({
        trips: [],
        tripGroups: [],
        templates: [],
        templateViews: [],
        tripCount: 0,
        upcomingCount: 0,
        templateCount: 0,
        loading: false,
        hasLoaded: true,
        cacheFresh: false,
        loadError: '',
      })
      if (fromPullDown) wx.stopPullDownRefresh()
      promptAuthGateIfNeeded()
      return
    }

    const hasExistingData = this.data.trips.length > 0 || this.data.templates.length > 0
    this.setData({ loading: !hasExistingData, loadError: '' })
    try {
      const [trips, templates] = await Promise.all([
        travelGateway.listTrips(),
        travelGateway.listTemplates(),
      ])
      if (!travelRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!travelRequestGate.isCurrent(sequence)) return
      this.applyData(trips, templates, {
        cacheFresh: true,
        hasLoaded: true,
        loading: false,
        loadError: '',
      })
      this.writeCurrentCache()
    } catch (error) {
      if (!travelRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!travelRequestGate.isCurrent(sequence)) return
      this.setData({
        loading: false,
        hasLoaded: true,
        loadError: getTravelErrorMessage(error, '旅行计划暂时没有加载出来'),
      })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  applyData(
    trips: TravelTrip[],
    templates: TravelTemplate[],
    extra: Record<string, unknown>,
  ) {
    const sortedTemplates = sortTemplates(templates)
    const groups = buildTripGroups(trips)
    this.setData({
      trips,
      tripGroups: groups,
      templates: sortedTemplates,
      templateViews: sortedTemplates.map(toTemplateView),
      tripCount: trips.length,
      upcomingCount: groups.find((group) => group.key === 'upcoming')?.items.length ?? 0,
      templateCount: sortedTemplates.length,
      ...extra,
    })
  },

  writeCurrentCache() {
    writePageCache<TravelPageCache>(TRAVEL_PAGE_CACHE_KEY, {
      trips: this.data.trips,
      templates: this.data.templates,
      activeTab: this.data.activeTab,
    })
  },

  onSwitchTab(event: { currentTarget: { dataset: { value?: TravelTab } } }) {
    const value = event.currentTarget.dataset.value
    if (!value || value === this.data.activeTab) return
    this.setData({ activeTab: value }, () => this.writeCurrentCache())
  },

  onRetryLoad() {
    void this.refresh()
  },

  onCreateTrip() {
    if (!requireAuthForWrite()) return
    wx.navigateTo({ url: '/pages/travel-form/index' })
  },

  onOpenTrip(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/travel-detail/index?id=${encodeURIComponent(id)}` })
  },

  onCopyTrip(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id || !requireAuthForWrite()) return
    wx.navigateTo({ url: `/pages/travel-form/index?mode=copy&id=${encodeURIComponent(id)}` })
  },

  onCreateTemplate() {
    if (!requireAuthForWrite()) return
    this.setData({
      templateEditorOpen: true,
      templateSaving: false,
      templateDeleting: false,
      templateDraft: {
        id: '',
        title: '',
        isDefault: this.data.templates.length === 0,
        version: 0,
        items: [''],
      },
    })
  },

  onEditTemplate(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    const template = this.data.templates.find((item) => item.id === id)
    if (!template || !requireAuthForWrite()) return
    this.setData({
      templateEditorOpen: true,
      templateSaving: false,
      templateDeleting: false,
      templateDraft: {
        id: template.id,
        title: template.title,
        isDefault: template.isDefault,
        version: template.version,
        items: template.items.length
          ? template.items.map((item) => item.name)
          : [''],
      },
    })
  },

  onCloseTemplateEditor() {
    if (this.data.templateSaving || this.data.templateDeleting) return
    this.setData({ templateEditorOpen: false })
  },

  onTemplateTitleInput(event: { detail: { value: string } }) {
    this.setData({ 'templateDraft.title': event.detail.value })
  },

  onTemplateItemInput(event: {
    currentTarget: { dataset: { index?: number } }
    detail: { value: string }
  }) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0) return
    const items = [...this.data.templateDraft.items]
    items[index] = event.detail.value
    this.setData({ 'templateDraft.items': items })
  },

  onAddTemplateItem() {
    if (this.data.templateDraft.items.length >= 100) {
      wx.showToast({ title: '最多 100 件物品', icon: 'none' })
      return
    }
    this.setData({
      'templateDraft.items': [...this.data.templateDraft.items, ''],
    })
  },

  onRemoveTemplateItem(event: { currentTarget: { dataset: { index?: number } } }) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0) return
    const items = this.data.templateDraft.items.filter((_, itemIndex) => itemIndex !== index)
    this.setData({ 'templateDraft.items': items.length ? items : [''] })
  },

  onToggleTemplateDefault(event: { detail: { value: boolean } }) {
    this.setData({ 'templateDraft.isDefault': event.detail.value })
  },

  async onSaveTemplate() {
    if (this.data.templateSaving || this.data.templateDeleting) return
    if (!requireAuthForWrite()) return
    const draft = this.data.templateDraft
    const title = draft.title.trim()
    if (!title) {
      wx.showToast({ title: '给这份清单起个名字', icon: 'none' })
      return
    }
    const seen = new Set<string>()
    const items = draft.items.flatMap((item) => {
      const name = item.trim()
      const key = name.toLocaleLowerCase()
      if (!name || seen.has(key)) return []
      seen.add(key)
      return [{ name }]
    })
    if (!items.length) {
      wx.showToast({ title: '至少放一件常用物品', icon: 'none' })
      return
    }
    const input: TravelTemplateWriteInput = {
      title,
      isDefault: draft.isDefault,
      items,
    }
    this.setData({ templateSaving: true })
    try {
      if (draft.id) {
        await travelGateway.updateTemplate(draft.id, input, draft.version)
      } else {
        await travelGateway.createTemplate(input)
      }
      this.setData({ templateEditorOpen: false })
      wx.showToast({ title: draft.id ? '清单已更新' : '清单已建好', icon: 'none' })
      await this.refresh()
    } catch (error) {
      wx.showToast({
        title: getTravelErrorMessage(error, '清单没有保存成功'),
        icon: 'none',
      })
    } finally {
      this.setData({ templateSaving: false })
    }
  },

  onDeleteTemplate() {
    const draft = this.data.templateDraft
    if (!draft.id || this.data.templateSaving || this.data.templateDeleting) return
    if (!requireAuthForWrite()) return
    wx.showModal({
      title: '删除这份必备清单？',
      content: '已经在出行里的物品不会受到影响。',
      confirmText: '删除',
      confirmColor: '#b86757',
      success: (result) => {
        if (result.confirm) void this.deleteTemplate(draft.id, draft.version)
      },
    })
  },

  async deleteTemplate(id: string, version: number) {
    this.setData({ templateDeleting: true })
    try {
      await travelGateway.removeTemplate(id, version)
      this.setData({ templateEditorOpen: false })
      wx.showToast({ title: '清单已删除', icon: 'none' })
      await this.refresh()
    } catch (error) {
      wx.showToast({
        title: getTravelErrorMessage(error, '清单没有删除成功'),
        icon: 'none',
      })
    } finally {
      this.setData({ templateDeleting: false })
    }
  },

  noop() {},
})
