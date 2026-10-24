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
