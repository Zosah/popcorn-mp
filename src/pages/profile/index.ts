import {
  getFeatureCategoryGroups,
  getFeatureDefinition,
  type FeatureCategoryDefinition,
  type FeatureDefinition,
} from '../../domain/feature-catalog'
import { hydrateAuthState, type AuthState } from '../../services/auth'
import { promptAuthGateIfNeeded } from '../../services/auth-preview'
import { readPageCache, writePageCache } from '../../services/page-cache'
import { openAppRoot } from '../../utils/app-navigation'
import { resolveAvatarUrl } from '../../utils/avatar'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

interface ProfileFeatureGroupView {
  key: string
  category: FeatureCategoryDefinition
  items: FeatureDefinition[]
}

const profileRequestGate = createRequestGate()
const PROFILE_PAGE_CACHE_KEY = 'profile:overview'

function buildFeatureGroups(): ProfileFeatureGroupView[] {
  return getFeatureCategoryGroups('list').map((group) => ({
    key: group.category.id,
    category: group.category,
    items: group.items,
  }))
}

Page({
  data: {
    initialLoading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    isLoggedIn: false,
    displayName: '还没有登录',
    avatarText: '访',
    avatarTone: 'lavender',
    avatarMediaId: '',
    avatarUrl: '',
    profileMeta: '登录后保存你的生活与共同空间',
    featureGroups: buildFeatureGroups() as ProfileFeatureGroupView[],
  },

  onLoad() {
    const cached = readPageCache<Record<string, unknown>>(PROFILE_PAGE_CACHE_KEY)
    if (cached) {
      this.setData({
        ...cached.value,
        initialLoading: false,
        hasLoaded: true,
        cacheFresh: cached.fresh,
        hasShown: false,
      })
    }
  },

  onShow() {
    promptAuthGateIfNeeded()
    const firstShow = !this.data.hasShown
    if (firstShow) this.setData({ hasShown: true })
    if (firstShow && this.data.cacheFresh) return
    void this.refreshProfile()
  },

  onPullDownRefresh() {
    void this.refreshProfile(true)
  },

  async refreshProfile(fromPullDown = false) {
    const sequence = profileRequestGate.begin()
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    const auth = await hydrateAuthState()
    if (!profileRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }

    if (firstLoad) await waitForMinimumLoading(startedAt)
    if (!profileRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    this.renderAuth(auth)
    if (fromPullDown) wx.stopPullDownRefresh()
  },

  renderAuth(auth: AuthState) {
    const loggedInUser = auth.isLoggedIn ? auth.user : null
    const isLoggedIn = Boolean(loggedInUser)
    const avatarMediaId = loggedInUser?.avatarMediaId ?? ''
    const profileMeta = isLoggedIn
      ? `在「${auth.spaceName}」里`
      : '登录后保存你的生活与共同空间'
    this.setData({
      initialLoading: false,
      hasLoaded: true,
      cacheFresh: true,
      isLoggedIn,
      displayName: loggedInUser?.nickname || (isLoggedIn ? '待完善资料' : '还没有登录'),
      avatarText: isLoggedIn ? auth.avatarText : '访',
      avatarTone: loggedInUser?.avatarTone ?? 'lavender',
      avatarMediaId,
      avatarUrl: this.data.avatarMediaId === avatarMediaId ? this.data.avatarUrl : '',
      profileMeta,
      featureGroups: buildFeatureGroups(),
    }, () => this.cacheCurrentPage())

    if (avatarMediaId) void this.loadAvatar(avatarMediaId)
  },

  cacheCurrentPage() {
    const data = this.data as unknown as Record<string, unknown>
    const {
      initialLoading: _initialLoading,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      ...snapshot
    } = data
    writePageCache(PROFILE_PAGE_CACHE_KEY, snapshot)
  },

  async loadAvatar(mediaId: string) {
    const avatarUrl = await resolveAvatarUrl(mediaId)
    if (this.data.avatarMediaId !== mediaId) return
    this.setData({ avatarUrl }, () => this.cacheCurrentPage())
  },

  onAvatarError() {
    this.setData({ avatarUrl: '' })
  },

  onOpenAuth() {
    wx.navigateTo({ url: '/pages/auth/index' })
  },

  onOpenSettings() {
    wx.navigateTo({ url: '/pages/settings/index' })
  },

  ensureLoggedIn(): boolean {
    if (this.data.isLoggedIn) return true
    wx.navigateTo({ url: '/pages/auth/index?mode=login' })
    return false
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

  onUnload() {
    profileRequestGate.invalidate()
  },
})
