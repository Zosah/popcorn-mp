import {
  resolveDemoInvite,
  type DemoInviteStatus,
} from '../../domain/demo-invite'
import {
  acceptDemoInviteCode,
  listAcceptedDemoInviteCodes,
} from '../../services/demo-invite'
import { getDemoSpaceName } from '../../services/demo-space'
import { navigateBackOrTab } from '../../utils/demo-navigation'

const STATUS_COPY: Record<
  DemoInviteStatus,
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
    copy: '这个邀请已在本机 Demo 中接受，不会重复加入。',
  },
}

Page({
  data: {
    codeInput: '',
    code: '',
    status: 'empty' as DemoInviteStatus,
    statusTitle: STATUS_COPY.empty.title,
    statusCopy: STATUS_COPY.empty.copy,
    spaceName: '我们的家',
    canAccept: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ spaceName: getDemoSpaceName() })
    if (options.code) this.applyCode(options.code)
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },

  onCodeInput(event: { detail: { value: string } }) {
    const codeInput = event.detail.value
    this.setData({ codeInput })
    if (!codeInput.trim()) this.applyCode('')
  },

  onValidate() {
    this.applyCode(this.data.codeInput)
  },

  onAccept() {
    if (!this.data.canAccept) return
    const invite = acceptDemoInviteCode(this.data.code)
    this.applyResolution(invite.code, invite.status)
    wx.showToast({ title: '欢迎回家', icon: 'success' })
  },

  onGoHome() {
    wx.switchTab({ url: '/pages/home/index' })
  },

  applyCode(value: string) {
    const invite = resolveDemoInvite(value, listAcceptedDemoInviteCodes())
    this.applyResolution(invite.code, invite.status)
  },

  applyResolution(code: string, status: DemoInviteStatus) {
    const copy = STATUS_COPY[status]
    this.setData({
      code,
      codeInput: code,
      status,
      statusTitle: copy.title,
      statusCopy: copy.copy,
      canAccept: status === 'available',
    })
  },
})
