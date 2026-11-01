import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEFAULT_FEATURE_SETTINGS,
  getFeatureSettingsConfig,
  getFeatureSettingsSnapshot,
  getFeatureSettingsStorageKey,
  normalizeFeatureSettings,
  saveFeatureSettingsConfig,
} from '../../src/services/feature-settings-config'

const storage = new Map<string, unknown>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('wx', {
    getStorageSync: vi.fn((key: string) => storage.get(key) ?? ''),
    setStorageSync: vi.fn((key: string, value: unknown) => {
      storage.set(key, value)
    }),
  })
})

describe('统一功能配置', () => {
  it('没有缓存时返回首页 4 项和底栏中间 3 项默认值', () => {
    expect(getFeatureSettingsSnapshot('s_1234567890:u_1234567890')).toEqual({
      ...DEFAULT_FEATURE_SETTINGS,
      version: 1,
      updatedAt: '',
    })
  })

  it('拒绝未知项和非法位置，并在各自区域内去重', () => {
    expect(normalizeFeatureSettings({
      homeSlots: ['todo', 'todo', 'unknown', 'reminders'],
      tabSlots: ['menu', 'menu', 'reminders', 'expense'],
    })).toEqual({
      homeSlots: ['todo', 'inventory', 'journal', 'reminders'],
      tabSlots: ['menu', 'journal', 'todo'],
    })
  })

  it('兼容旧版只保存三个底栏入口的缓存', () => {
    const ownerId = 's_1234567890:u_1234567890'
    storage.set(`popcorn_app_tab_config_v1:${ownerId}`, {
      slot2: 'menu',
      slot3: 'fitness',
      slot4: 'expense',
      version: 6,
      updatedAt: '2026-11-01T03:00:00Z',
    })

    expect(getFeatureSettingsSnapshot(ownerId)).toEqual({
      homeSlots: DEFAULT_FEATURE_SETTINGS.homeSlots,
      tabSlots: ['menu', 'fitness', 'expense'],
      version: 6,
      updatedAt: '2026-11-01T03:00:00Z',
    })
  })

  it('按空间和用户隔离本机配置', () => {
    const ownerA = 's_1234567890:u_1234567890'
    const ownerB = 's_1234567890:u_0987654321'

    saveFeatureSettingsConfig({
      homeSlots: ['menu', 'todo', 'journal', 'pets'],
      tabSlots: ['menu', 'expense', 'pets'],
    }, ownerA)

    expect(getFeatureSettingsConfig(ownerA)).toEqual({
      homeSlots: ['menu', 'todo', 'journal', 'pets'],
      tabSlots: ['menu', 'expense', 'pets'],
    })
    expect(getFeatureSettingsConfig(ownerB)).toEqual(DEFAULT_FEATURE_SETTINGS)
    expect(getFeatureSettingsStorageKey(ownerA)).not.toBe(getFeatureSettingsStorageKey(ownerB))
  })
})
