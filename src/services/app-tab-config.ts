import {
  FEATURE_CATALOG,
  getFeatureDefinition,
  type FeatureId,
} from '../domain/feature-catalog'
import {
  DEFAULT_FEATURE_SETTINGS,
  buildFeatureSettingsOwnerId,
  getFeatureSettingsConfig,
  getFeatureSettingsOwnerId,
  getFeatureSettingsSnapshot,
  getFeatureSettingsStorageKey,
  saveFeatureSettingsConfig,
  saveFeatureSettingsSnapshot,
  subscribeFeatureSettings,
  type FeatureSettingsConfig,
} from './feature-settings-config'

export type AppTabCustomId = FeatureId
export type AppTabId = 'home' | 'profile' | FeatureId

export interface AppTabConfig {
  slot2: AppTabCustomId
  slot3: AppTabCustomId
  slot4: AppTabCustomId
}

export interface AppTabSnapshot extends AppTabConfig {
  version: number
  updatedAt: string
}

export interface AppTabOption {
  id: AppTabCustomId
  label: string
  shortLabel: string
  description: string
  level: 'primary'
  parentId: FeatureId
  icon: string
  tone: 'blue' | 'green' | 'gold' | 'pink' | 'orange'
  path: string
  query?: Record<string, string>
}

export interface AppTabItem {
  id: AppTabId
  label: string
  description: string
  parentId: AppTabId
  icon: string
  tone: 'blue' | 'green' | 'gold' | 'pink' | 'orange'
  path: string
  query?: Record<string, string>
  fixed: boolean
}

function toAppTabOption(id: FeatureId): AppTabOption {
  const feature = getFeatureDefinition(id)
  if (!feature || !feature.tabEligible) throw new Error(`底部导航引用了未知功能：${id}`)
  return {
    id: feature.id as AppTabCustomId,
    label: feature.label,
    shortLabel: feature.shortLabel,
    description: feature.description,
    level: feature.level,
    parentId: feature.parentId,
    icon: feature.icon,
    tone: feature.tone,
    path: feature.path,
    query: feature.query,
  }
}

export const APP_TAB_OPTIONS: readonly AppTabOption[] = FEATURE_CATALOG
  .filter((feature) => feature.tabEligible)
  .map((feature) => toAppTabOption(feature.id))

export const DEFAULT_APP_TAB_CONFIG: AppTabConfig = {
  slot2: DEFAULT_FEATURE_SETTINGS.tabSlots[0] as AppTabCustomId,
  slot3: DEFAULT_FEATURE_SETTINGS.tabSlots[1] as AppTabCustomId,
  slot4: DEFAULT_FEATURE_SETTINGS.tabSlots[2] as AppTabCustomId,
}

export function subscribeAppTabConfig(listener: () => void): () => void {
  return subscribeFeatureSettings(listener)
}

export function getAppTabOwnerId(): string {
  return getFeatureSettingsOwnerId()
}

export function buildAppTabOwnerId(userId: string, spaceId: string): string {
  return buildFeatureSettingsOwnerId(userId, spaceId)
}

export function getAppTabStorageKey(ownerId = getAppTabOwnerId()): string {
  return getFeatureSettingsStorageKey(ownerId)
}

function isAppTabCustomId(value: unknown): value is AppTabCustomId {
  return APP_TAB_OPTIONS.some((option) => option.id === value)
}

export function normalizeAppTabConfig(value: unknown): AppTabConfig {
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
  const candidates = [record.slot2, record.slot3, record.slot4]
  const defaults = [
    DEFAULT_APP_TAB_CONFIG.slot2,
    DEFAULT_APP_TAB_CONFIG.slot3,
    DEFAULT_APP_TAB_CONFIG.slot4,
  ] as const
  const used = new Set<AppTabCustomId>()
  const slots: AppTabCustomId[] = []

  const take = (candidate: unknown): AppTabCustomId | undefined => {
    if (!isAppTabCustomId(candidate) || used.has(candidate)) return undefined
    used.add(candidate)
    return candidate
  }

  const takeFirstAvailable = (): AppTabCustomId | undefined => {
    for (const option of APP_TAB_OPTIONS) {
      const selected = take(option.id)
      if (selected) return selected
    }
    return undefined
  }

  for (let index = 0; index < 3; index += 1) {
    // 底栏是独立视图，不能拿包含首页默认项的全量配置来归一化；
    // 否则“宠物”等已放在首页的功能会被误判为跨区域重复并从底栏丢弃。
    const selected = take(candidates[index]) ??
      take(defaults[index]) ??
      takeFirstAvailable()
    if (selected) slots.push(selected)
  }

  return {
    slot2: slots[0] ?? DEFAULT_APP_TAB_CONFIG.slot2,
    slot3: slots[1] ?? DEFAULT_APP_TAB_CONFIG.slot3,
    slot4: slots[2] ?? DEFAULT_APP_TAB_CONFIG.slot4,
  }
}

export function getAppTabSnapshot(
  ownerId = getAppTabOwnerId(),
): AppTabSnapshot {
  const snapshot = getFeatureSettingsSnapshot(ownerId)
  return {
    slot2: snapshot.tabSlots[0] as AppTabCustomId,
    slot3: snapshot.tabSlots[1] as AppTabCustomId,
    slot4: snapshot.tabSlots[2] as AppTabCustomId,
    version: snapshot.version,
    updatedAt: snapshot.updatedAt,
  }
}

export function getAppTabConfig(ownerId = getAppTabOwnerId()): AppTabConfig {
  const { tabSlots } = getFeatureSettingsConfig(ownerId)
  return {
    slot2: tabSlots[0] as AppTabCustomId,
    slot3: tabSlots[1] as AppTabCustomId,
    slot4: tabSlots[2] as AppTabCustomId,
  }
}

export function saveAppTabSnapshot(
  snapshot: AppTabSnapshot,
  ownerId = getAppTabOwnerId(),
): AppTabSnapshot {
  const current = getFeatureSettingsSnapshot(ownerId)
  const saved = saveFeatureSettingsSnapshot({
    homeSlots: current.homeSlots,
    tabSlots: [snapshot.slot2, snapshot.slot3, snapshot.slot4],
    version: snapshot.version,
    updatedAt: snapshot.updatedAt,
  }, ownerId)
  return {
    slot2: saved.tabSlots[0] as AppTabCustomId,
    slot3: saved.tabSlots[1] as AppTabCustomId,
    slot4: saved.tabSlots[2] as AppTabCustomId,
    version: saved.version,
    updatedAt: saved.updatedAt,
  }
}

export function saveAppTabConfig(
  config: AppTabConfig,
  ownerId = getAppTabOwnerId(),
): AppTabConfig {
  const current = getFeatureSettingsConfig(ownerId)
  const saved = saveFeatureSettingsConfig({
    homeSlots: current.homeSlots,
    tabSlots: [config.slot2, config.slot3, config.slot4],
  }, ownerId)
  return {
    slot2: saved.tabSlots[0] as AppTabCustomId,
    slot3: saved.tabSlots[1] as AppTabCustomId,
    slot4: saved.tabSlots[2] as AppTabCustomId,
  }
}

export function getAppTabOption(id: AppTabId): AppTabItem {
  if (id === 'home') {
    return fixedTabOption(id, '家', '今天的家', 'nav-home', '/pages/home/index')
  }
  if (id === 'profile') {
    return fixedTabOption(id, '我的', '账号与设置', 'nav-profile', '/pages/profile/index')
  }
  const option = APP_TAB_OPTIONS.find((item) => item.id === id)
  if (!option) throw new Error(`底部导航引用了未知功能：${id}`)
  return {
    id: option.id,
    label: option.shortLabel,
    description: option.description,
    parentId: option.parentId,
    icon: option.icon,
    tone: option.tone,
    path: option.path,
    query: option.query,
    fixed: false,
  }
}

function fixedTabOption(
  id: 'home' | 'profile',
  label: string,
  description: string,
  icon: string,
  path: string,
): AppTabItem {
  return {
    id,
    label,
    description,
    parentId: id,
    icon,
    tone: id === 'home' ? 'blue' : 'green',
    path,
    fixed: true,
  }
}

export function resolveAppTabItems(
  config: AppTabConfig = DEFAULT_APP_TAB_CONFIG,
): AppTabItem[] {
  const normalized = normalizeAppTabConfig(config)
  return [
    getAppTabOption('home'),
    getAppTabOption(normalized.slot2),
    getAppTabOption(normalized.slot3),
    getAppTabOption(normalized.slot4),
    getAppTabOption('profile'),
  ]
}

export function resolveActiveAppTabItemId(
  items: readonly AppTabItem[],
  route: string,
  query: Record<string, string | undefined> = {},
  fallbackActive = '',
): string {
  const normalizedRoute = route.startsWith('/') ? route : `/${route}`
  const exact = items.find((item) => {
    if (item.path.split('?')[0] !== normalizedRoute || !item.query) return false
    return Object.entries(item.query).every(
      ([key, value]) => String(query[key] ?? '') === value,
    )
  })
  if (exact) return exact.id

  const hasQuery = Object.keys(query).some((key) => query[key])
  if (!hasQuery) {
    const root = items.find(
      (item) => item.path.split('?')[0] === normalizedRoute && !item.query,
    )
    if (root) return root.id

    const parentMatches = items.filter(
      (item) => item.path.split('?')[0] === normalizedRoute && item.parentId === fallbackActive,
    )
    // 同一父级放了多个二级入口时，根页面无法判断该高亮哪一个，宁可不选中。
    if (parentMatches.length === 1) return parentMatches[0]!.id
  }

  return ''
}

export type { FeatureSettingsConfig }
