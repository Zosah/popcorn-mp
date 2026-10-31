import { appConfig } from '../../config/env'
import { reminderGateway } from '../../services/reminder'
import {
  getReminderErrorMessage,
  isReminderVersionConflict,
  type ReminderAuthorizationStatus,
  type ReminderSettings,
  type ReminderSettingsInput,
  type ReminderSubscription,
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

const EMPTY_SUBSCRIPTION: ReminderSubscription = {
  configured: false,
  templateId: '',
  page: 'pages/reminder-settings/index',
  status: 'none',
  availableCount: 0,
  lastStatusAt: null,
  lastAcceptedAt: null,
}

const AUTHORIZATION_STATUSES: ReminderAuthorizationStatus[] = [
  'accept',
  'reject',
  'ban',
  'filter',
]

function isAuthorizationStatus(value: string): value is ReminderAuthorizationStatus {
  return AUTHORIZATION_STATUSES.includes(value as ReminderAuthorizationStatus)
}

function subscriptionCopy(subscription: ReminderSubscription): {
  label: string
  detail: string
  actionText: string
} {
  if (!subscription.configured) {
    return {
      label: '模板未配置',
      detail: '服务端还没有配置微信订阅消息模板，现在不会发起授权或发送通知。',
      actionText: '暂不可授权',
    }
  }
  switch (subscription.status) {
    case 'accept':
      return subscription.availableCount > 0
        ? {
            label: `已授权 · 可发送 ${subscription.availableCount} 次`,
            detail: '每次授权会增加一次发送机会；服务端成功发送后才会消费。',
            actionText: '再订阅一次',
          }
        : {
            label: '发送机会已用完',
            detail: '可以再次订阅，获得下一条服务通知的发送机会。',
            actionText: '重新订阅',
          }
    case 'reject':
      return {
        label: '已拒绝',
        detail: '本次没有获得发送机会，可以稍后重新订阅。',
        actionText: '重新订阅',
      }
    case 'ban':
      return {
        label: '订阅能力已封禁',
        detail: '微信返回该模板已被封禁，需要在小程序后台检查模板状态。',
        actionText: '检查配置后重试',
      }
    case 'filter':
      return {
        label: '模板被过滤',
        detail: '微信因模板标题同名过滤了该消息，需要调整订阅消息模板。',
        actionText: '检查配置后重试',
      }
    default:
      return {
        label: '尚未授权',
        detail: '订阅一次可获得一条发送机会，授权成功不等于消息已经发送。',
        actionText: '请求订阅授权',
      }
  }
}

function requestSubscribeMessage(templateId: string): Promise<ReminderAuthorizationStatus> {
  return new Promise((resolve, reject) => {
    wx.requestSubscribeMessage({
      tmplIds: [templateId],
      success(result) {
        const status = result[templateId]
        if (typeof status === 'string' && isAuthorizationStatus(status)) {
          resolve(status)
          return
        }
        reject(new Error('微信没有返回可识别的订阅状态'))
      },
      fail(error) {
        reject(new Error(error.errMsg || '微信订阅授权没有完成'))
      },
    })
  })
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
    subscription: EMPTY_SUBSCRIPTION,
    subscriptionLabel: '正在读取授权状态',
    subscriptionDetail: '稍后会显示是否还有可用的服务通知发送机会。',
    subscriptionActionText: '读取中',
    subscriptionErrorText: '',
    loading: true,
    saving: false,
    authorizing: false,
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
      const copy = subscriptionCopy(this.data.subscription)
      this.setData({
        settings,
        subscriptionLabel: copy.label,
        subscriptionDetail: copy.detail,
        subscriptionActionText: copy.actionText,
        loading: false,
        errorText: '',
        syncState: appConfig.demoMode ? 'local' : 'synced',
        syncText: appConfig.demoMode ? '仅本机' : '已保存到空间',
      })
      void this.loadSubscription()
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

  async loadSubscription() {
    try {
      const subscription = await reminderGateway.getSubscription()
      const copy = subscriptionCopy(subscription)
      this.setData({
        subscription,
        subscriptionLabel: copy.label,
        subscriptionDetail: copy.detail,
        subscriptionActionText: copy.actionText,
        subscriptionErrorText: '',
      })
    } catch (error) {
      this.setData({
        subscriptionErrorText: getReminderErrorMessage(error, '订阅授权状态暂时没有读取成功'),
        subscriptionLabel: '授权状态未同步',
        subscriptionDetail: '偏好仍可保存，但暂时不能确认是否还能发送服务通知。',
        subscriptionActionText: '重试',
      })
    }
  },

  async onAuthorize() {
    const enabled = this.data.settings.expiry
      || this.data.settings.petCare
      || this.data.settings.weeklyReview
    if (!enabled) {
      wx.showToast({ title: '先打开一个提醒开关吧', icon: 'none' })
      return
    }
    if (this.data.mode === 'demo') {
      wx.showModal({
        title: 'Demo 本机保存',
        content: '当前是 Demo 模式，偏好只保存在本机，不会调用微信授权，也不会发送服务通知。',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    if (!this.data.subscription.configured) {
      if (this.data.subscriptionErrorText) {
        void this.loadSubscription()
        return
      }
      wx.showModal({
        title: '订阅模板未配置',
        content: '服务端还没有配置微信订阅消息模板。偏好可以保存，但暂时无法申请发送机会。',
        showCancel: false,
        confirmText: '知道了',
      })
      return
    }
    if (this.data.authorizing) return

    this.setData({ authorizing: true, subscriptionErrorText: '' })
    try {
      const status = await requestSubscribeMessage(this.data.subscription.templateId)
      const subscription = await reminderGateway.recordSubscription(status)
      const copy = subscriptionCopy(subscription)
      this.setData({
        subscription,
        subscriptionLabel: copy.label,
        subscriptionDetail: copy.detail,
        subscriptionActionText: copy.actionText,
        authorizing: false,
      })
      const toast = status === 'accept'
        ? '已获得 1 次发送机会'
        : status === 'reject'
          ? '已记录为未授权'
          : '当前模板暂不可用'
      wx.showToast({ title: toast, icon: 'none' })
    } catch (error) {
      const message = error instanceof Error
        ? error.message
        : getReminderErrorMessage(error, '订阅授权没有完成')
      this.setData({
        authorizing: false,
        subscriptionErrorText: message,
      })
      wx.showToast({ title: message, icon: 'none' })
    }
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
