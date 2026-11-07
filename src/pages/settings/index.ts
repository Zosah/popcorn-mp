import { appConfig, formatVersionLabel } from '../../config/env'
import { hydrateAuthState } from '../../services/auth'

Page({
  data: {
    initialLoading: true,
    isLoggedIn: false,
    displayName: '',
    spaceName: '',
    versionLabel: formatVersionLabel(appConfig),
  },

  onShow() {
    void this.refresh()
  },

  async refresh() {
    const auth = await hydrateAuthState()
    this.setData({
      initialLoading: false,
      isLoggedIn: auth.isLoggedIn,
      displayName: auth.user?.nickname || '',
      spaceName: auth.spaceName || '还没有共同空间',
    })
  },

  ensureLoggedIn(): boolean {
    if (this.data.isLoggedIn) return true
    wx.navigateTo({ url: '/pages/auth/index?mode=login' })
    return false
  },

  onOpenProfile() {
    wx.navigateTo({ url: '/pages/auth/index' })
  },

  onOpenSpace() {
    if (!this.ensureLoggedIn()) return
    wx.navigateTo({ url: '/pages/space/index' })
  },

  onOpenPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/index' })
  },

  onOpenFeatureSettings() {
    if (!this.ensureLoggedIn()) return
    wx.navigateTo({ url: '/pages/feature-settings/index' })
  },

})
