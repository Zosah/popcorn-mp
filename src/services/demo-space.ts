const STORAGE_KEY = 'popcorn_demo_space_name_v1'
const DEFAULT_SPACE_NAME = '我们的家'

export function getDemoSpaceName(): string {
  const value = wx.getStorageSync<string | ''>(STORAGE_KEY)
  return typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_SPACE_NAME
}

export function setDemoSpaceName(name: string): string {
  const value = name.trim() || DEFAULT_SPACE_NAME
  wx.setStorageSync(STORAGE_KEY, value)
  return value
}
