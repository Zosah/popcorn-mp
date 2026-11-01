import {
  getFeatureCategoryGroups,
  getFeatureDefinition,
  type FeatureCategoryDefinition,
  type FeatureDefinition,
} from '../../domain/feature-catalog'
import {
  buildFeatureSettingsOwnerId,
  getFeatureSettingsConfig,
  subscribeFeatureSettings,
} from '../../services/feature-settings-config'
import { getAuthState } from '../../services/auth'
import { openAppRoot } from '../../utils/app-navigation'

interface FeatureListItemView extends FeatureDefinition {
  placementLabel: string
}

interface FeatureCategoryView {
  key: string
  category: FeatureCategoryDefinition
  items: FeatureListItemView[]
}

let unsubscribeAppTabConfig: (() => void) | undefined

function buildGroups(): FeatureCategoryView[] {
  const auth = getAuthState()
  const settings = auth.isLoggedIn
    ? getFeatureSettingsConfig(buildFeatureSettingsOwnerId(
      auth.user?.id ?? '',
      auth.activeSpaceId,
    ))
    : null

  return getFeatureCategoryGroups('list').map((group) => ({
    key: group.category.id,
    category: group.category,
    items: group.items.map((feature) => {
      const onHome = settings?.homeSlots.includes(feature.id) ?? false
      const onTab = settings?.tabSlots.includes(feature.id) ?? false
      return {
        ...feature,
        placementLabel: onHome && onTab
          ? '首页 · 底栏'
          : onHome
            ? '首页'
            : onTab
              ? '底栏'
              : '',
      }
    }),
  }))
}

Page({
  data: {
    groups: [] as FeatureCategoryView[],
    isLoggedIn: false,
  },

  onLoad() {
    this.refresh()
    unsubscribeAppTabConfig?.()
    unsubscribeAppTabConfig = subscribeFeatureSettings(() => this.refresh())
  },

  onShow() {
    this.refresh()
  },

  onUnload() {
    unsubscribeAppTabConfig?.()
    unsubscribeAppTabConfig = undefined
  },

  refresh() {
    const auth = getAuthState()
    this.setData({
      groups: buildGroups(),
      isLoggedIn: auth.isLoggedIn,
    })
  },

  onOpenFeature(event: {
    currentTarget: { dataset: { id?: string } }
  }) {
    const feature = getFeatureDefinition(event.currentTarget.dataset.id ?? '')
    if (!feature) return
    if (feature.launchMode === 'root') {
      openAppRoot(feature.path)
      return
    }
    wx.navigateTo({ url: feature.path })
  },

  onOpenConfig() {
    if (!this.data.isLoggedIn) {
      wx.navigateTo({ url: '/pages/auth/index?mode=login' })
      return
    }
    wx.navigateTo({ url: '/pages/feature-settings/index' })
  },
})
