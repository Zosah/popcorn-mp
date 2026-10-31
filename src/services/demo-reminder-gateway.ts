import {
  getDemoReminderSettings,
  setDemoReminderSettings,
} from './demo-reminders'
import {
  ReminderGatewayError,
  type ReminderGateway,
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
}
