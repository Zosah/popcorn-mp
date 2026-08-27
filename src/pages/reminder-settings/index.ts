import { navigateBackOrTab } from '../../utils/demo-navigation'

interface ReminderSettings {
  expiry: boolean
  petCare: boolean
  weeklyReview: boolean
  reminderTime: string
}

const STORAGE_KEY = 'popcorn_demo_reminders_v1'
const DEFAULT_SETTINGS: ReminderSettings = {
  expiry: true,
  petCare: true,
  weeklyReview: false,
  reminderTime: '20:30',
}

Page({
  data: {
    settings: DEFAULT_SETTINGS,
  },

  onLoad() {
    const saved = wx.getStorageSync<ReminderSettings | ''>(STORAGE_KEY)
    if (saved && typeof saved === 'object') this.setData({ settings: saved })
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },

  onToggle(event: {
    currentTarget: { dataset: { key: keyof Omit<ReminderSettings, 'reminderTime'> } }
    detail: { value: boolean }
  }) {
    const key = event.currentTarget.dataset.key
    const settings = { ...this.data.settings, [key]: event.detail.value }
    this.setData({ settings })
    wx.setStorageSync(STORAGE_KEY, settings)
  },

  onTimeChange(event: { detail: { value: string } }) {
    const settings = { ...this.data.settings, reminderTime: event.detail.value }
    this.setData({ settings })
    wx.setStorageSync(STORAGE_KEY, settings)
    wx.showToast({ title: '提醒时间已保存', icon: 'success' })
  },
})
