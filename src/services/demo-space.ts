const STORAGE_KEY = 'popcorn_demo_space_name_v1'
const DEFAULT_SPACE_NAME = '我们的家'

export const DEMO_SPACE_STORAGE_KEYS = [STORAGE_KEY] as const

export function getDemoSpaceName(): string {
  const value = wx.getStorageSync<string | ''>(STORAGE_KEY)
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_SPACE_NAME
}

export function setDemoSpaceName(name: string): string {
  const value = name.trim() || DEFAULT_SPACE_NAME
  wx.setStorageSync(STORAGE_KEY, value)
  return value
}

export function resetDemoSpaceName(): string {
  for (const key of DEMO_SPACE_STORAGE_KEYS) wx.removeStorageSync(key)
  return DEFAULT_SPACE_NAME
}
