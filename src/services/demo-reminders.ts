export interface DemoReminderSettings {
  expiry: boolean
  petCare: boolean
  weeklyReview: boolean
  reminderTime: string
}

const STORAGE_KEY = 'popcorn_demo_reminders_v1'

export const DEMO_REMINDER_STORAGE_KEYS = [STORAGE_KEY] as const

export const DEFAULT_DEMO_REMINDER_SETTINGS: DemoReminderSettings = {
  expiry: true,
  petCare: true,
  weeklyReview: false,
  reminderTime: '20:30',
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
