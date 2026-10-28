import { appConfig } from '../../config/env'
import {
  normalizeDemoInviteCode,
  resolveDemoInvite,
  type DemoInviteStatus,
} from '../../domain/demo-invite'
import {
  acceptDemoInviteCode,
  listAcceptedDemoInviteCodes,
} from '../../services/demo-invite'
import { hydrateAuthState } from '../../services/auth'
import {
  acceptApiInvite,
  resolveApiInvite,
  type SpaceGatewayResult,
} from '../../services/space-gateway'
import type { ApiInvitePreview } from '../../types/api'
import { navigateBackOrTab } from '../../utils/demo-navigation'

type InviteStatus = DemoInviteStatus | 'expired' | 'used' | 'error'

const STATUS_COPY: Record<
  InviteStatus,
  { title: string; copy: string }
> = {
  empty: {
    title: '带着邀请码回家',
    copy: '输入朋友发来的邀请码，先看看要加入的是哪个共同空间。',
  },
  invalid: {
    title: '这个邀请码不太对',
    copy: '请检查是否复制完整，再重新试一次。',
  },
  available: {
    title: '有人邀请你一起生活',
    copy: '确认后即可加入这个共同空间。',
  },
  accepted: {
    title: '已经回到家啦',
    copy: '这个邀请已经接受，空间会出现在你的个人中心。',
  },
  expired: {
    title: '这封邀请已经过期',
    copy: '邀请码只在创建后 7 天内有效，请让朋友重新生成一个。',
  },
  used: {
    title: '这个邀请码已经用过',
    copy: '邀请码只能使用一次，请让朋友再邀请你一次。',
  },
  error: {
    title: '暂时没能读到邀请',
    copy: '可能是网络不太稳定，稍后再试一次。',
  },
}

Page({
  data: {
    isDemoMode: appConfig.demoMode,
    isLoggedIn: false,
    isSubmitting: false,
    codeInput: '',
    code: '',
    status: 'empty' as InviteStatus,
    statusTitle: STATUS_COPY.empty.title,
    statusCopy: STATUS_COPY.empty.copy,
    spaceName: '我们的家',
    inviterName: '时刻见体验官',
    inviterAvatar: '满',
    inviterAvatarTone: 'lavender',
    expiresLabel: '',
    canAccept: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    void this.loadInvite(options)
  },

  async loadInvite(options: Record<string, string | undefined>) {
    const auth = await hydrateAuthState()
    this.setData({
      isDemoMode: appConfig.demoMode,
      isLoggedIn: auth.isLoggedIn,
    })
    if (options.code) await this.applyCode(options.code)
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },

  onCodeInput(event: { detail: { value: string } }) {
    const codeInput = event.detail.value
    this.setData({ codeInput })
    if (!codeInput.trim()) this.applyStatus('', 'empty')
  },

  async onValidate() {
    await this.applyCode(this.data.codeInput)
  },

  async onAccept() {
    if (!this.data.canAccept || this.data.isSubmitting) return
    if (!this.data.isLoggedIn) {
      wx.showModal({
        title: '先登录再加入',
        content: '登录后会建立你的空间身份，再回到这里接受邀请。',
        confirmText: '去登录',
        success: (result) => {
          if (result.confirm) wx.navigateTo({ url: '/pages/auth/index' })
        },
      })
      return
    }

    if (appConfig.demoMode) {
      const invite = acceptDemoInviteCode(this.data.code)
      this.applyStatus(invite.code, invite.status)
      wx.showToast({ title: '欢迎回家', icon: 'success' })
      return
    }

    this.setData({ isSubmitting: true })
    const result = await acceptApiInvite(this.data.code)
    this.setData({ isSubmitting: false })
    if (!result.ok || !result.data) {
      this.applyGatewayFailure(result)
      return
    }
    await hydrateAuthState()
    this.setData({
      spaceName: result.data.name,
      status: 'accepted',
      statusTitle: STATUS_COPY.accepted.title,
      statusCopy: STATUS_COPY.accepted.copy,
      canAccept: false,
    })
    wx.showToast({ title: '欢迎回家', icon: 'success' })
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },

  async applyCode(value: string) {
    if (appConfig.demoMode) {
      const invite = resolveDemoInvite(value, listAcceptedDemoInviteCodes())
      this.applyStatus(invite.code, invite.status)
      return
    }

    const code = normalizeDemoInviteCode(value)
    if (!code) {
      this.applyStatus('', 'empty')
      return
    }
    const result = await resolveApiInvite(code)
    if (!result.ok || !result.data) {
      this.applyGatewayFailure(result, code)
      return
    }
    this.applyApiPreview(result.data, code)
  },

  applyApiPreview(preview: ApiInvitePreview, code: string) {
    this.setData({
      code,
      codeInput: code,
      status: 'available',
      statusTitle: STATUS_COPY.available.title,
      statusCopy: STATUS_COPY.available.copy,
      spaceName: preview.space.name,
      inviterName: preview.inviter.nickname || '空间创建者',
      inviterAvatar: preview.inviter.nickname?.slice(0, 1) || '家',
      inviterAvatarTone: preview.inviter.avatarTone,
      expiresLabel: formatInviteExpiry(preview.expiresAt),
      canAccept: true,
    })
  },

  applyGatewayFailure(
    result: SpaceGatewayResult<unknown>,
    code?: string,
  ) {
    const currentCode = code ?? this.data.codeInput
    switch (result.code) {
      case 'INVITE_EXPIRED':
        this.applyStatus(currentCode, 'expired')
        break
      case 'INVITE_USED':
      case 'ALREADY_MEMBER':
        this.applyStatus(currentCode, 'used')
        break
      case 'INVITE_INVALID':
      case 'NOT_FOUND':
        this.applyStatus(currentCode, 'invalid')
        break
      default:
        this.applyStatus(currentCode, 'error')
        if (result.message) {
          wx.showToast({ title: result.message, icon: 'none' })
        }
    }
  },

  applyStatus(code: string, status: InviteStatus) {
    const copy = STATUS_COPY[status]
    this.setData({
      code,
      codeInput: code,
      status,
      statusTitle: copy.title,
      statusCopy: copy.copy,
      expiresLabel: '',
      canAccept: status === 'available',
    })
  },
})

function formatInviteExpiry(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const month = date.getMonth() + 1
  const day = date.getDate()
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `邀请有效期至 ${month} 月 ${day} 日 ${hours}:${minutes}`
}
