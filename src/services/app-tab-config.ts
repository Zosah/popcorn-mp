import { getAuthState } from './auth'

export type AppTabRootId =
  | 'home'
  | 'pets'
  | 'journal'
  | 'todo'
  | 'menu'
  | 'inventory'
  | 'profile'

export type AppTabSecondaryId =
  | 'pet-care'
  | 'pet-daily'
  | 'travel'
  | 'plan'
  | 'fitness'
  | 'expense'

export type AppTabCustomId =
  | Exclude<AppTabRootId, 'home' | 'profile'>
  | AppTabSecondaryId

export type AppTabId = AppTabRootId | AppTabSecondaryId

export interface AppTabConfig {
  slot2: AppTabCustomId
  slot3: AppTabCustomId
}

export interface AppTabOption {
  id: AppTabCustomId
  label: string
  shortLabel: string
  description: string
  level: 'primary' | 'secondary'
  parentId: AppTabRootId
  icon: string
  tone: 'blue' | 'green' | 'gold' | 'pink' | 'orange'
  path: string
  query?: Record<string, string>
}

export interface AppTabItem {
  id: AppTabId
  label: string
  description: string
  parentId: AppTabRootId
  icon: string
  tone: 'blue' | 'green' | 'gold' | 'pink' | 'orange'
  path: string
  query?: Record<string, string>
  fixed: boolean
}

export const APP_TAB_OPTIONS: readonly AppTabOption[] = [
  {
    id: 'pets',
    label: '宠物',
    shortLabel: '宠物',
    description: '档案、照护、体重和日常',
    level: 'primary',
    parentId: 'pets',
    icon: 'paw-print',
    tone: 'pink',
    path: '/pages/pets/index',
  },
  {
    id: 'journal',
    label: '生活记录',
    shortLabel: '记录',
    description: '生活记录和重要资料',
    level: 'primary',
    parentId: 'journal',
    icon: 'notebook-tabs',
    tone: 'blue',
    path: '/pages/journal/index',
  },
  {
    id: 'todo',
    label: '待办与小计划',
    shortLabel: '待办',
    description: '旅行准备、小计划、健身和账单',
    level: 'primary',
    parentId: 'todo',
    icon: 'list-todo',
    tone: 'green',
    path: '/pages/todo/index',
  },
  {
    id: 'menu',
    label: '今天吃什么',
    shortLabel: '吃什么',
    description: '菜单、推荐和今天吃什么',
    level: 'primary',
    parentId: 'menu',
    icon: 'utensils',
    tone: 'gold',
    path: '/pages/menu/index',
  },
  {
    id: 'inventory',
    label: '家庭库存',
    shortLabel: '库存',
    description: '家里的物品和临期提醒',
    level: 'primary',
    parentId: 'inventory',
    icon: 'package',
    tone: 'orange',
    path: '/pages/inventory/index',
  },
  {
    id: 'pet-care',
    label: '宠物照护',
    shortLabel: '照护',
    description: '疫苗、驱虫、洗护与健康记录',
    level: 'secondary',
    parentId: 'pets',
    icon: 'heart-pulse',
    tone: 'pink',
    path: '/pages/pets/index?section=care',
    query: { section: 'care' },
  },
  {
    id: 'pet-daily',
    label: '宠物日常',
    shortLabel: '日常',
    description: '吃饭、喝水、便便和尿尿记录',
    level: 'secondary',
    parentId: 'pets',
    icon: 'droplets',
    tone: 'green',
    path: '/pages/pets/index?section=daily',
    query: { section: 'daily' },
  },
  {
    id: 'travel',
    label: '旅行准备',
    shortLabel: '旅行',
    description: '目的地、出发时间和准备清单',
    level: 'secondary',
    parentId: 'todo',
    icon: 'plane',
    tone: 'blue',
    path: '/pages/todo/index?kind=travel',
    query: { kind: 'travel' },
  },
  {
    id: 'plan',
    label: '小计划',
    shortLabel: '计划',
    description: '近期想做的事和完成进度',
    level: 'secondary',
    parentId: 'todo',
    icon: 'list-todo',
    tone: 'green',
    path: '/pages/todo/index?kind=plan',
    query: { kind: 'plan' },
  },
  {
    id: 'fitness',
    label: '健身计划',
    shortLabel: '健身',
    description: '运动、时长和热量记录',
    level: 'secondary',
    parentId: 'todo',
    icon: 'dumbbell',
    tone: 'orange',
    path: '/pages/todo/index?kind=fitness',
    query: { kind: 'fitness' },
  },
  {
    id: 'expense',
    label: '我们的账单',
    shortLabel: '账单',
    description: '一起记下花了什么、买了什么',
    level: 'secondary',
    parentId: 'todo',
    icon: 'wallet',
    tone: 'gold',
    path: '/pages/todo/index?kind=expense',
    query: { kind: 'expense' },
  },
] as const

export const DEFAULT_APP_TAB_CONFIG: AppTabConfig = {
  slot2: 'pets',
  slot3: 'journal',
}

const STORAGE_PREFIX = 'popcorn_app_tab_config_v1'

function isAppTabCustomId(value: unknown): value is AppTabCustomId {
  return APP_TAB_OPTIONS.some((option) => option.id === value)
}

export function getAppTabOwnerId(): string {
  const auth = getAuthState()
  return auth.user?.id || auth.activeSpaceId || 'guest'
}

export function getAppTabStorageKey(ownerId = getAppTabOwnerId()): string {
  return `${STORAGE_PREFIX}:${ownerId}`
}

export function normalizeAppTabConfig(value: unknown): AppTabConfig {
  const record = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}
  const used = new Set<AppTabCustomId>()

  const take = (
    candidate: unknown,
    fallback: AppTabCustomId,
  ): AppTabCustomId => {
    if (isAppTabCustomId(candidate) && !used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
    const safeFallback = used.has(fallback)
      ? APP_TAB_OPTIONS.find((option) => !used.has(option.id))?.id ?? 'pets'
      : fallback
    used.add(safeFallback)
    return safeFallback
  }

  const slot2 = take(record.slot2, DEFAULT_APP_TAB_CONFIG.slot2)
  const slot3 = take(record.slot3, DEFAULT_APP_TAB_CONFIG.slot3)
  return { slot2, slot3 }
}

export function getAppTabConfig(ownerId = getAppTabOwnerId()): AppTabConfig {
  const value = wx.getStorageSync<unknown>(getAppTabStorageKey(ownerId))
  return normalizeAppTabConfig(value)
}

export function saveAppTabConfig(
  config: AppTabConfig,
  ownerId = getAppTabOwnerId(),
): AppTabConfig {
  const normalized = normalizeAppTabConfig(config)
  wx.setStorageSync(getAppTabStorageKey(ownerId), normalized)
  return normalized
}

export function getAppTabOption(id: AppTabId): AppTabItem {
  if (id === 'home') {
    return {
      id: 'home',
      label: '家',
      description: '今天的家',
      parentId: 'home',
      icon: 'house',
      tone: 'blue',
      path: '/pages/home/index',
      fixed: true,
    }
  }
  if (id === 'profile') {
    return {
      id: 'profile',
      label: '我的',
      description: '账号与设置',
      parentId: 'profile',
      icon: 'user-round',
      tone: 'green',
      path: '/pages/profile/index',
      fixed: true,
    }
  }
  const option = APP_TAB_OPTIONS.find((item) => item.id === id) ?? APP_TAB_OPTIONS[0]!
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

export function resolveAppTabItems(
  config: AppTabConfig = DEFAULT_APP_TAB_CONFIG,
): AppTabItem[] {
  const normalized = normalizeAppTabConfig(config)
  return [
    getAppTabOption('home'),
    getAppTabOption(normalized.slot2),
    getAppTabOption(normalized.slot3),
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

    const parent = items.find(
      (item) => item.path.split('?')[0] === normalizedRoute && item.parentId === fallbackActive,
    )
    if (parent) return parent.id
  }

  return ''
}
