export interface ReminderSettings {
  expiry: boolean
  petCare: boolean
  weeklyReview: boolean
  reminderTime: string
  version: number
  updatedAt: string
}

export interface ReminderSettingsInput {
  expiry: boolean
  petCare: boolean
  weeklyReview: boolean
  reminderTime: string
}

export interface ReminderGateway {
  get(): Promise<ReminderSettings>
  update(input: ReminderSettingsInput, currentVersion: number): Promise<ReminderSettings>
}

export class ReminderGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ReminderGatewayError'
  }
}

export function isReminderVersionConflict(error: unknown): boolean {
  return error instanceof ReminderGatewayError && error.code === 'VERSION_CONFLICT'
}

export function getReminderErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof ReminderGatewayError)) return fallback
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已失效，请重新登录'
    case 'NO_ACTIVE_SPACE':
      return '还没有可用的共同空间'
    case 'VERSION_CONFLICT':
      return '提醒设置已在别处更新，已为你载入最新内容'
    case 'NETWORK_ERROR':
      return '网络不太稳定，请稍后再试'
    case 'NOT_FOUND':
      return '当前空间不可用，或设置记录已经不存在'
    case 'VALIDATION_FAILED':
    case 'PRECONDITION_REQUIRED':
      return error.message || '提醒设置还需要检查一下'
    default:
      return error.message || fallback
  }
}
