import { appConfig } from '../../config/env'
import { reminderGateway } from '../../services/reminder'
import {
  getReminderErrorMessage,
  isReminderVersionConflict,
  type ReminderSettings,
  type ReminderSettingsInput,
} from '../../services/reminder-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'

type ReminderToggleKey = 'expiry' | 'petCare' | 'weeklyReview'

const EMPTY_SETTINGS: ReminderSettings = {
  expiry: true,
  petCare: true,
  weeklyReview: false,
  reminderTime: '20:30',
  version: 1,
  updatedAt: '',
}

function toInput(settings: ReminderSettings): ReminderSettingsInput {
  return {
    expiry: settings.expiry,
    petCare: settings.petCare,
    weeklyReview: settings.weeklyReview,
    reminderTime: settings.reminderTime,
  }
}

Page({
  data: {
    settings: EMPTY_SETTINGS,
    loading: true,
    saving: false,
    errorText: '',
    mode: appConfig.demoMode ? 'demo' : 'http',
    syncState: appConfig.demoMode ? 'local' : 'pending',
    syncText: appConfig.demoMode ? '仅本机' : '正在同步',
  },

  onLoad() {
    void this.loadSettings()
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },

  async loadSettings() {
    this.setData({
      loading: true,
      saving: false,
      errorText: '',
      syncState: appConfig.demoMode ? 'local' : 'pending',
      syncText: appConfig.demoMode ? '仅本机' : '正在同步',
    })
    try {
      const settings = await reminderGateway.get()
      this.setData({
        settings,
        loading: false,
        errorText: '',
        syncState: appConfig.demoMode ? 'local' : 'synced',
        syncText: appConfig.demoMode ? '仅本机' : '已保存到空间',
      })
    } catch (error) {
      this.setData({
        loading: false,
        errorText: getReminderErrorMessage(error, '提醒设置暂时没有同步过来'),
        syncState: 'local',
        syncText: '未同步',
      })
    }
  },

  onRetry() {
    void this.loadSettings()
  },

  onAuthorize() {
    const enabled = this.data.settings.expiry
      || this.data.settings.petCare
      || this.data.settings.weeklyReview
    if (!enabled) {
      wx.showToast({ title: '先打开一个提醒开关吧', icon: 'none' })
      return
    }
    wx.showModal({
      title: this.data.mode === 'demo' ? 'Demo 本机保存' : '订阅消息待配置',
      content: this.data.mode === 'demo'
        ? '当前是 Demo 模式，偏好只保存在本机，不会发送微信服务通知。'
        : '偏好已经按“空间 + 个人”保存。微信订阅消息模板与发送任务尚未配置，所以现在还不会发送服务通知。',
      showCancel: false,
      confirmText: '知道了',
    })
  },

  async onToggle(event: {
    currentTarget: { dataset: { key: ReminderToggleKey } }
    detail: { value: boolean }
  }) {
    if (this.data.loading || this.data.saving) return
    const key = event.currentTarget.dataset.key
    const previous = this.data.settings
    const next: ReminderSettings = {
      ...previous,
      [key]: event.detail.value,
    }
    this.setData({
      settings: next,
      saving: true,
      errorText: '',
      syncState: appConfig.demoMode ? 'local' : 'pending',
      syncText: appConfig.demoMode ? '仅本机' : '保存中',
    })
    await this.persistSettings(next, previous)
  },

  async onTimeChange(event: { detail: { value: string } }) {
    if (this.data.loading || this.data.saving) return
    const previous = this.data.settings
    const next: ReminderSettings = {
      ...previous,
      reminderTime: event.detail.value,
    }
    this.setData({
      settings: next,
      saving: true,
      errorText: '',
      syncState: appConfig.demoMode ? 'local' : 'pending',
      syncText: appConfig.demoMode ? '仅本机' : '保存中',
    })
    await this.persistSettings(next, previous, true)
  },

  async persistSettings(
    next: ReminderSettings,
    previous: ReminderSettings,
    showSuccess = false,
  ) {
    try {
      const saved = await reminderGateway.update(
        toInput(next),
        previous.version,
      )
      this.setData({
        settings: saved,
        saving: false,
        errorText: '',
        syncState: appConfig.demoMode ? 'local' : 'synced',
        syncText: appConfig.demoMode ? '仅本机' : '已保存到空间',
      })
      if (showSuccess) {
        wx.showToast({ title: '提醒时间已保存', icon: 'success' })
      }
    } catch (error) {
      if (isReminderVersionConflict(error)) {
        this.setData({ saving: false })
        await this.loadSettings()
        wx.showToast({
          title: '设置已在别处更新，已载入最新版本',
          icon: 'none',
        })
        return
      }
      const message = getReminderErrorMessage(error, '这次没有保存成功')
      this.setData({
        settings: previous,
        saving: false,
        errorText: message,
        syncState: 'local',
        syncText: '未同步',
      })
      wx.showToast({ title: message, icon: 'none' })
    }
  },
})
