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
  saveAuthProfile,
} from '../../services/auth'
import { syncFeatureSettings } from '../../services/feature-settings'
import { readPendingInvite } from '../../services/pending-invite'
import { mediaGateway } from '../../services/media'
import { getMediaErrorMessage } from '../../services/media-gateway'
import { resolveAvatarUrl } from '../../utils/avatar'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import {
  cropSquareImage,
  editLocalImage,
  isImageEditCancelled,
} from '../../utils/image-editor'
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
  avatarError: string
  accountNickname: string
  accountAvatarText: string
  accountAvatarTone: DemoAvatarTone
  accountAvatarMediaId: string
  accountAvatarUrl: string
  accountCreatedAt: string
  spaceName: string
  backLabel: string
  loginNotice: string
  loginSubmitting: boolean
  accountTypeLabel: string
  returnToInvite: boolean
  profileTitle: string
  profileCopy: string
  profileSubmitLabel: string
}

function formatAccountDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return '今天'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}.${month}.${day}`
}

let avatarUploadSequence = 0

function getLocalFileSize(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    wx.getFileSystemManager().getFileInfo({
      filePath,
      success: (result) => resolve(result.size),
      fail: () => resolve(0),
    })
  })
}

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
    avatarError: '',
    accountNickname: '',
    accountAvatarText: '时',
    accountAvatarTone: 'lavender',
    accountAvatarMediaId: '',
    accountAvatarUrl: '',
    accountCreatedAt: '',
    spaceName: '我们的家',
    backLabel: '← 返回我的',
    loginNotice: '',
    loginSubmitting: false,
    accountTypeLabel: appConfig.demoMode ? '本机体验账号' : '个人账号',
    returnToInvite: false,
    profileTitle: '完善个人资料',
    profileCopy: '设置头像和名字，让朋友认出你。',
    profileSubmitLabel: '保存并继续',
  },

  onLoad(options: Record<string, string | undefined>) {
    if (options.reason === 'session-expired') {
      this.setData({
        loginNotice: '登录已过期，请重新登录',
      })
    }
    const returnToInvite = options.returnTo === 'invite'
    this.setData({ returnToInvite })
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
      avatarError: '',
      spaceName: state.spaceName,
      backLabel: isEditing ? '← 返回账号' : '← 返回邀请',
      profileTitle: isEditing
        ? '编辑个人资料'
        : this.data.returnToInvite
          ? '先认识一下'
          : '完善个人资料',
      profileCopy: isEditing
        ? registerCopyForEditing()
        : this.data.returnToInvite
          ? '完成后会回到邀请，由你确认是否加入。'
          : '设置头像和名字，让朋友认出你。',
      profileSubmitLabel: isEditing
        ? '保存资料'
        : this.data.returnToInvite
          ? '保存并返回邀请'
          : '保存并继续',
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
      spaceName: state.spaceName,
      backLabel: '← 返回我的',
    })
    if (user.avatarMediaId) void this.loadAccountAvatar(user.avatarMediaId)
  },

  async loadProfileAvatar(mediaId: string) {
    const url = await resolveAvatarUrl(mediaId, 'display')
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
      this.finishAuthFlow()
      return
    }
    navigateBackOrTab('/pages/profile/index')
  },

  finishAuthFlow() {
    if (!this.data.returnToInvite) {
      navigateBackOrTab('/pages/profile/index')
      return
    }
    const code = readPendingInvite()
    if (getCurrentPages().length > 1) {
      wx.navigateBack({ delta: 1 })
      return
    }
    wx.redirectTo({
      url: code
        ? `/pages/invite/index?code=${encodeURIComponent(code)}`
        : '/pages/invite/index',
    })
  },

  async onWechatLogin() {
    if (this.data.loginSubmitting) return
    this.setData({ loginSubmitting: true, loginNotice: '' })
    wx.showLoading({
      title: '正在登录',
      mask: true,
    })
    const result = await loginAuth()
    wx.hideLoading()

    if (!result.ok) {
      this.setData({ loginSubmitting: false })
      wx.showToast({ title: result.message || '登录没有完成', icon: 'none' })
      this.showLogin()
      return
    }
    if (result.requiresProfile) {
      this.setData({ loginSubmitting: false })
      this.showRegister(false)
      return
    }
    if (!result.state.user) {
      this.setData({ loginSubmitting: false })
      wx.showToast({ title: '没有读取到账号资料', icon: 'none' })
      return
    }

    this.setData({ loginSubmitting: false })
    this.showAccount(result.state.user)
    void syncFeatureSettings().catch(() => undefined)
    wx.showToast({ title: '登录成功', icon: 'success' })
    setTimeout(() => this.finishAuthFlow(), 420)
  },

  onNicknameInput(event: { detail: { value: string } }) {
    this.setData({
      nicknameInput: event.detail.value,
      nicknamePreview: buildDemoAvatarText(event.detail.value),
      nicknameError: '',
    })
  },

  async onChooseAvatar(event: { detail: { avatarUrl?: string } }) {
    if (this.data.avatarUploading) return
    const rawPath = event.detail.avatarUrl?.trim()
    if (!rawPath) return
    const previousMediaId = this.data.avatarMediaId
    const sequence = ++avatarUploadSequence
    this.setData({ avatarUploading: true, avatarUploadError: '' })
    try {
      const editedPath = await editLocalImage(rawPath)
      const filePath = await cropSquareImage(editedPath)
      const fileSize = await getLocalFileSize(filePath)
      if (fileSize > 10 * 1024 * 1024) {
        this.setData({ avatarUploadError: '图片有点大，请换一张试试' })
        return
      }
      const asset = await mediaGateway.upload(filePath, 'user_avatar', fileSize)
      if (sequence !== avatarUploadSequence) return
      this.setData({
        avatarMediaId: asset.id,
        avatarPreviewUrl: asset.display.url || asset.thumb.url,
        avatarError: '',
      })
      wx.showToast({ title: '头像已设置', icon: 'success' })
    } catch (error) {
      if (sequence !== avatarUploadSequence) return
      if (isImageEditCancelled(error)) return
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
    if (!this.data.avatarMediaId) {
      this.setData({ avatarError: '请先获取微信头像' })
      wx.showToast({ title: '请先获取微信头像', icon: 'none' })
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
    void syncFeatureSettings().catch(() => undefined)
    wx.showToast({ title: '资料已保存', icon: 'success' })
    setTimeout(() => this.finishAuthFlow(), 420)
  },

  onEditAccount() {
    this.showRegister(true)
  },

  onOpenSpace() {
    wx.navigateTo({ url: '/pages/space/index' })
  },

  onOpenPrivacy() {
    wx.navigateTo({ url: '/pages/privacy/index' })
  },

  onLogout() {
    wx.showModal({
      title: '退出登录？',
      content: appConfig.demoMode
        ? '本机账号会保留，下次仍然可以一键回来。'
        : '下次登录还能回到这里，资料会继续保留。',
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

})

function registerCopyForEditing(): string {
  return appConfig.demoMode
    ? '修改只会更新当前设备上的资料。'
    : '修改后会同步到当前空间。'
}
