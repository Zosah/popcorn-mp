import { resetDemoInventory } from '../../services/demo-inventory'
import { getDemoSpaceName } from '../../services/demo-space'
import { syncDemoTabBar } from '../../utils/demo-tab-bar'

Page({
  data: {
    version: 'Demo 0.9',
    spaceName: '我们的家',
  },

  onShow() {
    syncDemoTabBar(this, 3)
    this.setData({ spaceName: getDemoSpaceName() })
  },

  onOpenSpace() {
    wx.navigateTo({ url: '/pages/space/index' })
  },

  onOpenReminders() {
    wx.navigateTo({ url: '/pages/reminder-settings/index' })
  },

  onOpenInvite() {
    wx.navigateTo({ url: '/pages/invite/index' })
  },

  onResetDemo() {
    wx.showModal({
      title: '重置 Demo 数据？',
      content: '你新增和修改的本地库存会恢复成初始示例。',
      confirmText: '重置',
      confirmColor: '#668ff0',
      success: (result) => {
        if (!result.confirm) return
        resetDemoInventory()
        wx.showToast({ title: '已恢复示例', icon: 'success' })
      },
    })
  },
})
