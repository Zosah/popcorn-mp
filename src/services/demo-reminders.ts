export interface DemoReminderSettings {
  expiry: boolean
  petCare: boolean
  weeklyReview: boolean
  reminderTime: string
  version: number
  updatedAt: string
}

const STORAGE_KEY = 'popcorn_demo_reminders_v2'
const FALLBACK_UPDATED_AT = '2026-01-01T00:00:00.000Z'

export const DEMO_REMINDER_STORAGE_KEYS = [
  STORAGE_KEY,
  'popcorn_demo_reminders_v1',
] as const

export const DEFAULT_DEMO_REMINDER_SETTINGS: DemoReminderSettings = {
  expiry: true,
  petCare: true,
  weeklyReview: false,
  reminderTime: '20:30',
  version: 1,
  updatedAt: FALLBACK_UPDATED_AT,
}

export function getDemoReminderSettings(): DemoReminderSettings {
  const saved = wx.getStorageSync<Partial<DemoReminderSettings> | ''>(STORAGE_KEY)
  if (!saved || typeof saved !== 'object') {
    return { ...DEFAULT_DEMO_REMINDER_SETTINGS }
  }
  return {
    expiry:
      typeof saved.expiry === 'boolean'
        ? saved.expiry
        : DEFAULT_DEMO_REMINDER_SETTINGS.expiry,
    petCare:
      typeof saved.petCare === 'boolean'
        ? saved.petCare
        : DEFAULT_DEMO_REMINDER_SETTINGS.petCare,
    weeklyReview:
      typeof saved.weeklyReview === 'boolean'
        ? saved.weeklyReview
        : DEFAULT_DEMO_REMINDER_SETTINGS.weeklyReview,
    reminderTime:
      typeof saved.reminderTime === 'string' && /^\d{2}:\d{2}$/.test(saved.reminderTime)
        ? saved.reminderTime
        : DEFAULT_DEMO_REMINDER_SETTINGS.reminderTime,
    version:
      typeof saved.version === 'number' && saved.version > 0
        ? saved.version
        : DEFAULT_DEMO_REMINDER_SETTINGS.version,
    updatedAt:
      typeof saved.updatedAt === 'string'
        ? saved.updatedAt
        : DEFAULT_DEMO_REMINDER_SETTINGS.updatedAt,
  }
}

export function setDemoReminderSettings(
  settings: DemoReminderSettings,
): DemoReminderSettings {
  const next = { ...settings }
  wx.setStorageSync(STORAGE_KEY, next)
  return next
}

export function resetDemoReminderSettings(): DemoReminderSettings {
  for (const key of DEMO_REMINDER_STORAGE_KEYS) wx.removeStorageSync(key)
  return { ...DEFAULT_DEMO_REMINDER_SETTINGS }
}
