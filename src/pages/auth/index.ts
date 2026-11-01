import { appConfig } from '../../config/env'
import {
  buildDemoAvatarText,
  normalizeDemoNickname,
  validateDemoNickname,
  type DemoAvatarTone,
  type DemoUserProfile,
} from '../../domain/demo-auth'
import {
  getAuthState,
  getKnownAuthAccount,
  hydrateAuthState,
  loginAuth,
  logoutAuth,
  resetAuthAccount,
  saveAuthProfile,
} from '../../services/auth'
import { syncAppTabSettings } from '../../services/app-tab-settings'
import { mediaGateway } from '../../services/media'
import { getMediaErrorMessage } from '../../services/media-gateway'
import { resolveAvatarUrl } from '../../utils/avatar'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { showMediaUploadError } from '../../utils/media-error'

type AuthMode = 'login' | 'register' | 'account'

interface AuthPageData {
  mode: AuthMode
  isEditing: boolean
  hasAccount: boolean
  nicknameInput: string
  nicknamePreview: string
  nicknameError: string
  selectedTone: DemoAvatarTone
  avatarMediaId: string
  avatarPreviewUrl: string
  avatarUploading: boolean
  avatarUploadError: string
  accountNickname: string
  accountAvatarText: string
  accountAvatarTone: DemoAvatarTone
  accountAvatarMediaId: string
  accountAvatarUrl: string
  accountCreatedAt: string
  accountId: string
  spaceName: string
  backLabel: string
  loginVignetteNote: string
  loginFootnote: string
  registerCopy: string
  profilePreviewLabel: string
  profilePreviewMeta: string
  accountHeadCopy: string
  accountTypeLabel: string
  accountScopeCopy: string
  clearAccountLabel: string
}

function formatAccountDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '今天'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}.${month}.${day}`
}

let avatarUploadSequence = 0

Page<AuthPageData, WechatMiniprogram.Page.CustomOption>({
  data: {
    mode: 'login',
    isEditing: false,
    hasAccount: false,
    nicknameInput: '',
    nicknamePreview: '时',
    nicknameError: '',
    selectedTone: 'lavender',
    avatarMediaId: '',
    avatarPreviewUrl: '',
    avatarUploading: false,
    avatarUploadError: '',
    accountNickname: '',
    accountAvatarText: '时',
    accountAvatarTone: 'lavender',
    accountAvatarMediaId: '',
    accountAvatarUrl: '',
    accountCreatedAt: '',
    accountId: '',
    spaceName: '我们的家',
    backLabel: '← 返回我的',
    loginVignetteNote: appConfig.demoMode
      ? '当前为本地 Demo，头像和昵称只保存在本机。'
      : '登录只获取微信身份；头像和昵称需要你在微信官方控件中确认。',
    loginFootnote: appConfig.demoMode
      ? 'Demo 阶段使用本机体验身份，不会读取手机号。'
      : '不读取手机号；微信登录状态会在下次打开小程序时自动恢复。',
    registerCopy: appConfig.demoMode
      ? '昵称和头像只保存在当前设备。'
      : '昵称和头像会保存到你的账号，并同步到当前空间。',
    profilePreviewLabel: appConfig.demoMode ? '你的本机身份' : '你的空间身份',
    profilePreviewMeta: appConfig.demoMode
      ? 'Demo 账号'
      : '时刻见账号',
    accountHeadCopy: appConfig.demoMode
      ? '这是你在「时刻见」的本机体验身份。'
      : '这是你在「时刻见」的微信账号。',
    accountTypeLabel: appConfig.demoMode ? '本机体验账号' : '微信账号',
    accountScopeCopy: appConfig.demoMode
      ? '仅保存在当前设备'
      : '已连接时刻见服务',
    clearAccountLabel: appConfig.demoMode
      ? '清除本机账号（不影响其他 Demo 数据）'
      : '清除本机登录信息',
  },

  onLoad(options: Record<string, string | undefined>) {
    if (options.reason === 'session-expired') {
      this.setData({
        loginVignetteNote: '登录状态已经过期，重新登录后会回到刚才的页面。',
      })
    }
    void this.bootstrap(options.mode)
  },

  async bootstrap(requestedMode?: string) {
    const state = await hydrateAuthState()
    if (state.onboardingRequired) {
      this.showRegister(false)
      return
    }
    if (state.isLoggedIn && state.user) {
      this.showAccount(state.user)
      return
    }

    const account = getKnownAuthAccount()
    if (requestedMode === 'register' && !account) {
      this.showRegister(false)
      return
    }
    this.showLogin()
  },

  showLogin() {
    const account = getKnownAuthAccount()
    const state = getAuthState()
    const accountAvatarMediaId = account?.avatarMediaId ?? ''
    this.setData({
      mode: 'login',
      isEditing: false,
      hasAccount: Boolean(account),
      accountNickname: account?.nickname ?? '',
      accountAvatarText: buildDemoAvatarText(account?.nickname ?? ''),
      accountAvatarTone: account?.avatarTone ?? 'lavender',
      accountAvatarMediaId,
      accountAvatarUrl: '',
      spaceName: state.spaceName,
      backLabel: '← 返回我的',
    })
    if (accountAvatarMediaId) void this.loadAccountAvatar(accountAvatarMediaId)
  },

  showRegister(isEditing: boolean) {
    const state = getAuthState()
    const account = isEditing ? state.user : (state.user ?? getKnownAuthAccount())
    const avatarMediaId = account?.avatarMediaId ?? ''
    this.setData({
      mode: 'register',
      isEditing,
      nicknameInput: isEditing ? (account?.nickname ?? '') : '',
      nicknamePreview: isEditing ? buildDemoAvatarText(account?.nickname ?? '') : '时',
      nicknameError: '',
      selectedTone: isEditing ? (account?.avatarTone ?? 'lavender') : 'lavender',
      avatarMediaId,
      avatarPreviewUrl: '',
      avatarUploading: false,
      avatarUploadError: '',
      spaceName: state.spaceName,
      backLabel: isEditing ? '← 返回账号' : '← 返回预览',
    })
    if (avatarMediaId) void this.loadProfileAvatar(avatarMediaId)
  },

  showAccount(user: DemoUserProfile) {
    const state = getAuthState()
    this.setData({
      mode: 'account',
      isEditing: false,
      hasAccount: true,
      accountNickname: user.nickname,
      accountAvatarText: buildDemoAvatarText(user.nickname),
      accountAvatarTone: user.avatarTone,
      accountAvatarMediaId: user.avatarMediaId,
      accountAvatarUrl: '',
      accountCreatedAt: formatAccountDate(user.createdAt),
      accountId: user.id.slice(-8).toUpperCase(),
      spaceName: state.spaceName,
      backLabel: '← 返回我的',
    })
    if (user.avatarMediaId) void this.loadAccountAvatar(user.avatarMediaId)
  },

  async loadProfileAvatar(mediaId: string) {
    const url = await resolveAvatarUrl(mediaId)
    if (this.data.avatarMediaId !== mediaId) return
    this.setData({ avatarPreviewUrl: url })
  },

  async loadAccountAvatar(mediaId: string) {
    const url = await resolveAvatarUrl(mediaId)
    if (this.data.accountAvatarMediaId !== mediaId) return
    this.setData({ accountAvatarUrl: url })
  },

  onBack() {
    if (this.data.mode === 'register') {
      if (this.data.isEditing) {
        const account = getAuthState().user
        if (account) {
          this.showAccount(account)
          return
        }
      }
      navigateBackOrTab('/pages/profile/index')
      return
    }
    navigateBackOrTab('/pages/profile/index')
  },

  async onWechatLogin() {
    wx.showLoading({
      title: this.data.hasAccount ? '正在登录' : '正在连接微信',
      mask: true,
    })
    const result = await loginAuth()
    wx.hideLoading()

    if (!result.ok) {
      wx.showToast({ title: result.message || '登录没有完成', icon: 'none' })
      this.showLogin()
      return
    }
    if (result.requiresProfile) {
      this.showRegister(false)
      return
    }
    if (!result.state.user) {
      wx.showToast({ title: '没有读取到账号资料', icon: 'none' })
      return
    }

    this.showAccount(result.state.user)
    void syncAppTabSettings().catch(() => undefined)
    wx.showToast({ title: '欢迎回来', icon: 'success' })
    setTimeout(() => navigateBackOrTab('/pages/profile/index'), 420)
  },

  onNicknameInput(event: { detail: { value: string } }) {
    this.setData({
      nicknameInput: event.detail.value,
      nicknamePreview: buildDemoAvatarText(event.detail.value),
      nicknameError: '',
    })
  },

  onChooseAvatar(event: { detail: { avatarUrl?: string } }) {
    if (this.data.avatarUploading) return
    const filePath = event.detail.avatarUrl?.trim()
    if (!filePath) return
    const sequence = ++avatarUploadSequence
    this.setData({ avatarPreviewUrl: filePath, avatarUploadError: '' })
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (result) => {
        if (sequence !== avatarUploadSequence) return
        if (result.size > 10 * 1024 * 1024) {
          this.setData({
            avatarPreviewUrl: '',
            avatarUploadError: '头像图片不能超过 10 MiB',
          })
          return
        }
        void this.uploadAvatar(filePath, result.size, sequence)
      },
      fail: () => {
        if (sequence !== avatarUploadSequence) return
        void this.uploadAvatar(filePath, 0, sequence)
      },
    })
  },

  async uploadAvatar(filePath: string, fileSize: number, sequence: number) {
    const previousMediaId = this.data.avatarMediaId
    this.setData({ avatarUploading: true, avatarUploadError: '' })
    try {
      const asset = await mediaGateway.upload(filePath, 'avatar', fileSize)
      if (sequence !== avatarUploadSequence) return
      this.setData({
        avatarMediaId: asset.id,
        avatarPreviewUrl: asset.thumb.url || asset.display.url,
      })
      wx.showToast({ title: '头像已准备好', icon: 'success' })
    } catch (error) {
      if (sequence !== avatarUploadSequence) return
      const message = getMediaErrorMessage(error, '头像上传没有完成')
      this.setData({ avatarMediaId: previousMediaId, avatarPreviewUrl: '', avatarUploadError: message })
      if (previousMediaId) void this.loadProfileAvatar(previousMediaId)
      showMediaUploadError(error, '头像上传没有完成')
    } finally {
      if (sequence === avatarUploadSequence) {
        this.setData({ avatarUploading: false })
      }
    }
  },

  onPreviewAvatar() {
    const src = this.data.avatarPreviewUrl
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
  },

  onRemoveAvatar() {
    if (this.data.avatarUploading) return
    avatarUploadSequence += 1
    this.setData({
      avatarMediaId: '',
      avatarPreviewUrl: '',
      avatarUploadError: '',
    })
  },

  onAvatarImageError() {
    this.setData({ avatarPreviewUrl: '' })
  },

  onAccountAvatarError() {
    this.setData({ accountAvatarUrl: '' })
  },

  async onSubmitProfile() {
    if (this.data.avatarUploading) {
      wx.showToast({ title: '头像还在上传，请稍等一下', icon: 'none' })
      return
    }
    const nicknameMessage = validateDemoNickname(this.data.nicknameInput)
    if (nicknameMessage) {
      this.setData({ nicknameError: nicknameMessage })
      return
    }

    wx.showLoading({ title: '正在保存', mask: true })
    const result = await saveAuthProfile({
      nickname: normalizeDemoNickname(this.data.nicknameInput),
      avatarTone: this.data.selectedTone,
      avatarMediaId: this.data.avatarMediaId,
    })
    wx.hideLoading()

    if (!result.ok || !result.state.user) {
      this.setData({ nicknameError: result.message || '资料保存失败，请稍后再试' })
      return
    }

    if (this.data.isEditing) {
      this.showAccount(result.state.user)
      wx.showToast({ title: '资料已更新', icon: 'success' })
      return
    }

    this.showAccount(result.state.user)
    void syncAppTabSettings().catch(() => undefined)
    wx.showToast({ title: '欢迎回家', icon: 'success' })
    setTimeout(() => navigateBackOrTab('/pages/profile/index'), 420)
  },

  onEditAccount() {
    this.showRegister(true)
  },

  onOpenSpace() {
    wx.navigateTo({ url: '/pages/space/index' })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录？',
      content: appConfig.demoMode
        ? '本机账号会保留，下次仍然可以一键回来。'
        : '当前会话会立即失效，资料仍保留在服务端。',
      confirmText: '退出',
      success: (result) => {
        if (!result.confirm) return
        void this.finishLogout()
      },
    })
  },

  async finishLogout() {
    wx.showLoading({ title: '正在退出', mask: true })
    await logoutAuth()
    wx.hideLoading()
    this.showLogin()
    wx.showToast({ title: '已退出登录', icon: 'success' })
  },

  onClearAccount() {
    wx.showModal({
      title: '清除本机登录信息？',
      content: appConfig.demoMode
        ? '只删除登录资料，不会删除库存、记录和其他 Demo 数据。'
        : '会撤销当前会话并清除本机 Token，不会删除服务端账号与空间数据。',
      confirmText: '清除',
      confirmColor: '#df6f7d',
      success: (result) => {
        if (!result.confirm) return
        void this.finishClearAccount()
      },
    })
  },

  async finishClearAccount() {
    wx.showLoading({ title: '正在清除', mask: true })
    await resetAuthAccount()
    wx.hideLoading()
    this.showLogin()
    wx.showToast({ title: '登录信息已清除', icon: 'success' })
  },
})
