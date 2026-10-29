import { navigateBackOrTab } from '../../utils/demo-navigation'
import {
  getDemoReminderSettings,
  setDemoReminderSettings,
  type DemoReminderSettings,
} from '../../services/demo-reminders'

Page({
  data: {
    settings: getDemoReminderSettings(),
  },

  onLoad() {
    this.setData({ settings: getDemoReminderSettings() })
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },

  onAuthorize() {
    if (this.data.settings.expiry || this.data.settings.petCare || this.data.settings.weeklyReview) {
      wx.showModal({
        title: 'Demo 暂不申请授权',
        content: '正式接入微信订阅消息后，这里会一次性申请所需模板。当前偏好已经保存在本机。',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    wx.showToast({ title: '先打开一个提醒开关吧', icon: 'none' })
  },

  onToggle(event: {
    currentTarget: { dataset: { key: keyof Omit<DemoReminderSettings, 'reminderTime'> } }
    detail: { value: boolean }
  }) {
    const key = event.currentTarget.dataset.key
    const settings = { ...this.data.settings, [key]: event.detail.value }
    this.setData({ settings })
    setDemoReminderSettings(settings)
  },

  onTimeChange(event: { detail: { value: string } }) {
    const settings = { ...this.data.settings, reminderTime: event.detail.value }
    this.setData({ settings })
    setDemoReminderSettings(settings)
    wx.showToast({ title: '提醒时间已保存', icon: 'success' })
  },
})
