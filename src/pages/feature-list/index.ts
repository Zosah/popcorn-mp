import {
  getFeatureCategoryGroups,
  getFeatureDefinition,
  type FeatureCategoryDefinition,
  type FeatureDefinition,
} from '../../domain/feature-catalog'
import {
  buildAppTabOwnerId,
  getAppTabConfig,
  subscribeAppTabConfig,
} from '../../services/app-tab-config'
import { getAuthState } from '../../services/auth'
import { openAppRoot } from '../../utils/app-navigation'

interface FeatureListItemView extends FeatureDefinition {
  placementLabel: string
}

interface FeatureCategoryView {
  category: FeatureCategoryDefinition
  items: FeatureListItemView[]
}

let unsubscribeAppTabConfig: (() => void) | undefined

function buildGroups(): FeatureCategoryView[] {
  const auth = getAuthState()
  const tabConfig = auth.isLoggedIn
    ? getAppTabConfig(buildAppTabOwnerId(auth.user?.id ?? '', auth.activeSpaceId))
    : null
  const tabSlots = tabConfig
    ? [tabConfig.slot2, tabConfig.slot3, tabConfig.slot4]
    : []

  return getFeatureCategoryGroups('list').map((group) => ({
    category: group.category,
    items: group.items.map((feature) => {
      const tabIndex = tabSlots.findIndex((id) => id === feature.id)
      return {
        ...feature,
        placementLabel: tabIndex >= 0 ? '已放底栏' : '',
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
    unsubscribeAppTabConfig = subscribeAppTabConfig(() => this.refresh())
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
    wx.navigateTo({ url: '/pages/tab-settings/index' })
  },
})
