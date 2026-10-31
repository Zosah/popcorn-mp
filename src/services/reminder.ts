import { appConfig } from '../config/env'
import { DemoReminderGateway } from './demo-reminder-gateway'
import { HttpReminderGateway } from './http-reminder'
import type { ReminderGateway } from './reminder-gateway'

function createReminderGateway(): ReminderGateway {
  return appConfig.demoMode
    ? new DemoReminderGateway()
    : new HttpReminderGateway()
}

export let reminderGateway = createReminderGateway()

export function refreshReminderGateway(): void {
  reminderGateway = createReminderGateway()
}
