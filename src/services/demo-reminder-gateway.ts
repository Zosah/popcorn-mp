import {
  getDemoReminderSettings,
  setDemoReminderSettings,
} from './demo-reminders'
import {
  ReminderGatewayError,
  type ReminderGateway,
  type ReminderAuthorizationStatus,
  type ReminderSubscription,
  type ReminderSettings,
  type ReminderSettingsInput,
} from './reminder-gateway'

export class DemoReminderGateway implements ReminderGateway {
  async get(): Promise<ReminderSettings> {
    return getDemoReminderSettings()
  }

  async update(
    input: ReminderSettingsInput,
    currentVersion: number,
  ): Promise<ReminderSettings> {
    const current = getDemoReminderSettings()
    if (current.version !== currentVersion) {
      throw new ReminderGatewayError('VERSION_CONFLICT', '提醒设置已在别处更新')
    }
    return setDemoReminderSettings({
      expiry: input.expiry,
      petCare: input.petCare,
      weeklyReview: input.weeklyReview,
      reminderTime: input.reminderTime,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    })
  }

  async getSubscription(): Promise<ReminderSubscription> {
    return {
      configured: false,
      templateId: '',
      page: 'pages/reminder-settings/index',
      status: 'none',
      availableCount: 0,
      lastStatusAt: null,
      lastAcceptedAt: null,
    }
  }

  async recordSubscription(_status: ReminderAuthorizationStatus): Promise<ReminderSubscription> {
    throw new ReminderGatewayError(
      'SUBSCRIPTION_NOT_CONFIGURED',
      'Demo 模式不会调用微信订阅授权',
    )
  }
}
