import { hydrateAuthState, type AuthState } from '../../services/auth'
import { promptAuthGateIfNeeded } from '../../services/auth-preview'
import { readPageCache, writePageCache } from '../../services/page-cache'
import { resolveAvatarUrl } from '../../utils/avatar'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

const profileRequestGate = createRequestGate()
const PROFILE_PAGE_CACHE_KEY = 'profile:overview'

Page({
  data: {
    initialLoading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    spaceName: '我们的家',
    isLoggedIn: false,
    displayName: '还没有登录',
    avatarText: '访',
    avatarTone: 'lavender',
    avatarMediaId: '',
    avatarUrl: '',
    profileMeta: '登录后保存你的生活与共同空间',
    spaceMeta: '登录后查看共同空间',
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
    const spaceMeta = !isLoggedIn
      ? '登录后查看共同空间'
      : auth.spaceRole === 'owner'
        ? '由你发起 · 一起记录日常、清单和毛孩子'
        : '一起记录日常、清单和毛孩子'

    this.setData({
      initialLoading: false,
      hasLoaded: true,
      cacheFresh: true,
      spaceName: auth.spaceName,
      isLoggedIn,
      displayName: loggedInUser?.nickname || (isLoggedIn ? '待完善资料' : '还没有登录'),
      avatarText: isLoggedIn ? auth.avatarText : '访',
      avatarTone: loggedInUser?.avatarTone ?? 'lavender',
      avatarMediaId,
      avatarUrl: this.data.avatarMediaId === avatarMediaId ? this.data.avatarUrl : '',
      profileMeta,
      spaceMeta,
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

  ensureLoggedIn(): boolean {
    if (this.data.isLoggedIn) return true
    wx.navigateTo({ url: '/pages/auth/index?mode=login' })
    return false
  },

  onOpenSpace() {
    if (!this.ensureLoggedIn()) return
    wx.navigateTo({ url: '/pages/space/index' })
  },

  onOpenFeatureList() {
    wx.navigateTo({ url: '/pages/feature-list/index' })
  },

  onOpenReminders() {
    if (!this.ensureLoggedIn()) return
    wx.navigateTo({ url: '/pages/reminder-settings/index' })
  },

  onOpenFeatureSettings() {
    if (!this.ensureLoggedIn()) return
    wx.navigateTo({ url: '/pages/feature-settings/index' })
  },

  onUnload() {
    profileRequestGate.invalidate()
  },
})
