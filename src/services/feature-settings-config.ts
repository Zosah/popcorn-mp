import {
  FEATURE_CATALOG,
  getFeatureDefinition,
  type FeatureId,
} from '../domain/feature-catalog'
import { getAuthState } from './auth'

export interface FeatureSettingsConfig {
  homeSlots: FeatureId[]
  tabSlots: FeatureId[]
}

export interface FeatureSettingsSnapshot extends FeatureSettingsConfig {
  version: number
  updatedAt: string
}

export const DEFAULT_FEATURE_SETTINGS: FeatureSettingsConfig = {
  homeSlots: ['journal', 'inventory', 'todo', 'pets'],
  tabSlots: ['menu', 'expense', 'fitness'],
}

const STORAGE_PREFIX = 'popcorn_feature_settings_v2'
const LEGACY_STORAGE_PREFIX = 'popcorn_app_tab_config_v1'
const HOME_SLOT_COUNT = 4
const TAB_SLOT_COUNT = 3
const settingsListeners = new Set<() => void>()

export function subscribeFeatureSettings(listener: () => void): () => void {
  settingsListeners.add(listener)
  return () => settingsListeners.delete(listener)
}

export function buildFeatureSettingsOwnerId(userId: string, spaceId: string): string {
  const normalizedUser = userId.trim()
  const normalizedSpace = spaceId.trim()
  if (normalizedUser && normalizedSpace) return `${normalizedSpace}:${normalizedUser}`
  return normalizedUser || normalizedSpace || 'guest'
}

export function getFeatureSettingsOwnerId(): string {
  const auth = getAuthState()
  return buildFeatureSettingsOwnerId(auth.user?.id ?? '', auth.activeSpaceId)
}

export function getFeatureSettingsStorageKey(ownerId = getFeatureSettingsOwnerId()): string {
  return `${STORAGE_PREFIX}:${ownerId}`
}

export function normalizeFeatureSettings(value: unknown): FeatureSettingsConfig {
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
  const used = new Set<FeatureId>()
  return {
    homeSlots: normalizeSlots(
      record.homeSlots,
      'home',
      HOME_SLOT_COUNT,
      DEFAULT_FEATURE_SETTINGS.homeSlots,
      used,
    ),
    tabSlots: normalizeSlots(
      record.tabSlots,
      'tab',
      TAB_SLOT_COUNT,
      DEFAULT_FEATURE_SETTINGS.tabSlots,
      used,
    ),
  }
}

export function getFeatureSettingsSnapshot(
  ownerId = getFeatureSettingsOwnerId(),
): FeatureSettingsSnapshot {
  let value = wx.getStorageSync<unknown>(getFeatureSettingsStorageKey(ownerId))
  if (!value || typeof value !== 'object') {
    value = readLegacySettings(ownerId)
  }
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
  const source = record.config && typeof record.config === 'object'
    ? record.config
    : record
  return {
    ...normalizeFeatureSettings(source),
    version: typeof record.version === 'number' && record.version > 0
      ? Math.trunc(record.version)
      : 1,
    updatedAt: typeof record.updatedAt === 'string' ? record.updatedAt : '',
  }
}

export function getFeatureSettingsConfig(
  ownerId = getFeatureSettingsOwnerId(),
): FeatureSettingsConfig {
  const { homeSlots, tabSlots } = getFeatureSettingsSnapshot(ownerId)
  return { homeSlots, tabSlots }
}

export function saveFeatureSettingsSnapshot(
  snapshot: FeatureSettingsSnapshot,
  ownerId = getFeatureSettingsOwnerId(),
): FeatureSettingsSnapshot {
  const normalized = normalizeFeatureSettings(snapshot)
  const saved: FeatureSettingsSnapshot = {
    ...normalized,
    version: snapshot.version > 0 ? Math.trunc(snapshot.version) : 1,
    updatedAt: snapshot.updatedAt,
  }
  wx.setStorageSync(getFeatureSettingsStorageKey(ownerId), saved)
  for (const listener of settingsListeners) listener()
  return saved
}

export function saveFeatureSettingsConfig(
  config: FeatureSettingsConfig,
  ownerId = getFeatureSettingsOwnerId(),
): FeatureSettingsConfig {
  const current = getFeatureSettingsSnapshot(ownerId)
  const saved = saveFeatureSettingsSnapshot({
    ...normalizeFeatureSettings(config),
    version: current.version + 1,
    updatedAt: new Date().toISOString(),
  }, ownerId)
  return { homeSlots: saved.homeSlots, tabSlots: saved.tabSlots }
}

function normalizeSlots(
  value: unknown,
  availability: 'home' | 'tab',
  count: number,
  defaults: readonly FeatureId[],
  used: Set<FeatureId>,
): FeatureId[] {
  const candidates = Array.isArray(value) ? value : []
  const result: FeatureId[] = []

  const take = (candidate: unknown): FeatureId | undefined => {
    if (typeof candidate !== 'string') return undefined
    const feature = getFeatureDefinition(candidate)
    if (!feature || used.has(feature.id)) return undefined
    const eligible = availability === 'home' ? feature.homeEligible : feature.tabEligible
    if (!eligible) return undefined
    used.add(feature.id)
    return feature.id
  }

  // 优先保留原位置；某个位置失效时，用同位置的默认项补齐，避免其余入口整体左移。
  for (let index = 0; index < count; index += 1) {
    let selected = take(candidates[index]) ?? take(defaults[index])
    if (!selected) {
      for (const fallback of defaults) {
        selected = take(fallback)
        if (selected) break
      }
    }
    if (selected) {
      result.push(selected)
      continue
    }
    for (const feature of FEATURE_CATALOG) {
      if (availability === 'home' ? feature.homeEligible : feature.tabEligible) {
        const fallback = take(feature.id)
        if (fallback) {
          result.push(fallback)
          break
        }
      }
    }
  }
  return result
}

function readLegacySettings(ownerId: string): unknown {
  const legacyKey = `${LEGACY_STORAGE_PREFIX}:${ownerId}`
  let value = wx.getStorageSync<unknown>(legacyKey)
  if ((!value || typeof value !== 'object') && ownerId.includes(':')) {
    // 兼容更早版本只按用户 ID 保存的本机配置。
    value = wx.getStorageSync<unknown>(
      `${LEGACY_STORAGE_PREFIX}:${ownerId.split(':').slice(1).join(':')}`,
    )
  }
  if (!value || typeof value !== 'object') return value
  const record = value as Record<string, unknown>
  const source = record.config && typeof record.config === 'object'
    ? record.config as Record<string, unknown>
    : record
  return {
    homeSlots: DEFAULT_FEATURE_SETTINGS.homeSlots,
    tabSlots: [source.slot2, source.slot3, source.slot4],
    version: record.version,
    updatedAt: record.updatedAt,
  }
}
