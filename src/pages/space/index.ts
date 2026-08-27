import { buildDemoInvitePath } from '../../domain/demo-invite'
import {
  getDemoInviteCode,
  refreshDemoInviteCode,
} from '../../services/demo-invite'
import { getDemoSpaceName, setDemoSpaceName } from '../../services/demo-space'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    inviteCode: 'SHIKEZAI',
    spaceName: '我们的家',
  },

  onShow() {
    this.setData({
      inviteCode: getDemoInviteCode(),
      spaceName: getDemoSpaceName(),
    })
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },

  onRename() {
    wx.showModal({
      title: '给空间换个名字',
      editable: true,
      placeholderText: this.data.spaceName,
      success: (result) => {
        const name = result.content?.trim()
        if (!result.confirm || !name) return
        this.setData({ spaceName: setDemoSpaceName(name) })
        wx.showToast({ title: '空间名称已更新', icon: 'success' })
      },
    })
  },

  onRefreshInvite() {
    const code = refreshDemoInviteCode()
    this.setData({ inviteCode: code })
    wx.showToast({ title: '已生成新邀请码', icon: 'success' })
  },

  onPreviewInvite() {
    wx.navigateTo({ url: buildDemoInvitePath(this.data.inviteCode) })
  },

  onCopyInvite() {
    wx.setClipboardData({
      data: this.data.inviteCode,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
    })
  },

  onShareAppMessage() {
    return {
      title: `邀请你加入「${this.data.spaceName}」`,
      path: buildDemoInvitePath(this.data.inviteCode),
    }
  },
})
