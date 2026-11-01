/**
 * 功能注册表：标题、分类、图标、路由与快捷入口资格的唯一来源。
 *
 * 页面只保存功能 ID；展示信息全部从这里解析，避免功能清单、首页快捷入口和
 * 底部导航各自维护一份名称与路径。
 */

export type FeatureCategoryId = 'tool' | 'life' | 'memo' | 'member'

export type FeatureTone = 'blue' | 'green' | 'gold' | 'pink' | 'orange'

export type FeatureLevel = 'primary'

export type FeatureId =
  | 'inventory'
  | 'expense'
  | 'menu'
  | 'travel'
  | 'fitness'
  | 'journal'
  | 'todo'
  | 'pets'

export interface FeatureCategoryDefinition {
  id: FeatureCategoryId
  title: string
  description: string
  icon: string
  tone: FeatureTone
}

export interface FeatureDefinition {
  id: FeatureId
  label: string
  shortLabel: string
  description: string
  category: FeatureCategoryId
  level: FeatureLevel
  parentId: FeatureId
  icon: string
  tone: FeatureTone
  path: string
  query?: Record<string, string>
  /** 是否作为一级功能出现在完整功能清单。 */
  listVisible: boolean
  /** 是否允许进入首页快捷入口。 */
  homeEligible: boolean
  /** 是否允许进入底部导航中间三个槽位。 */
  tabEligible: boolean
  /** 打开方式：根页面使用 reLaunch。 */
  launchMode: 'root'
}

export interface FeatureCategoryGroup {
  category: FeatureCategoryDefinition
  items: FeatureDefinition[]
}

export type FeatureAvailability = 'list' | 'home' | 'tab'

export const FEATURE_CATEGORIES: readonly FeatureCategoryDefinition[] = [
  {
    id: 'tool',
    title: '工具',
    description: '库存、账单与下厨',
    icon: 'package',
    tone: 'orange',
  },
  {
    id: 'life',
    title: '生活',
    description: '旅行与健身',
    icon: 'heart-pulse',
    tone: 'green',
  },
  {
    id: 'memo',
    title: '备忘',
    description: '记录与待办',
    icon: 'notebook-tabs',
    tone: 'blue',
  },
  {
    id: 'member',
    title: '成员',
    description: '一起生活的宠物',
    icon: 'paw-print',
    tone: 'pink',
  },
] as const

export const FEATURE_CATALOG: readonly FeatureDefinition[] = [
  {
    id: 'inventory',
    label: '库存',
    shortLabel: '库存',
    description: '家里的物品、余量和临期',
    category: 'tool',
    level: 'primary',
    parentId: 'inventory',
    icon: 'package',
    tone: 'orange',
    path: '/pages/inventory/index',
    listVisible: true,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'expense',
    label: '账单',
    shortLabel: '账单',
    description: '花了多少，买了什么',
    category: 'tool',
    level: 'primary',
    parentId: 'expense',
    icon: 'wallet',
    tone: 'gold',
    path: '/pages/todo/index?kind=expense',
    query: { kind: 'expense' },
    listVisible: true,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'menu',
    label: '下厨',
    shortLabel: '下厨',
    description: '今天吃什么、菜单和做饭',
    category: 'tool',
    level: 'primary',
    parentId: 'menu',
    icon: 'utensils',
    tone: 'gold',
    path: '/pages/menu/index',
    listVisible: true,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'travel',
    label: '旅行',
    shortLabel: '旅行',
    description: '目的地、出发准备和清单',
    category: 'life',
    level: 'primary',
    parentId: 'travel',
    icon: 'plane',
    tone: 'blue',
    path: '/pages/todo/index?kind=travel',
    query: { kind: 'travel' },
    listVisible: true,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'fitness',
    label: '健身',
    shortLabel: '健身',
    description: '运动、时长和热量记录',
    category: 'life',
    level: 'primary',
    parentId: 'fitness',
    icon: 'dumbbell',
    tone: 'green',
    path: '/pages/todo/index?kind=fitness',
    query: { kind: 'fitness' },
    listVisible: true,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'journal',
    label: '记录',
    shortLabel: '记录',
    description: '生活点滴与重要资料',
    category: 'memo',
    level: 'primary',
    parentId: 'journal',
    icon: 'notebook-tabs',
    tone: 'blue',
    path: '/pages/journal/index',
    listVisible: true,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'todo',
    label: '待办',
    shortLabel: '待办',
    description: '想到的事，用自己的标签收好',
    category: 'memo',
    level: 'primary',
    parentId: 'todo',
    icon: 'list-todo',
    tone: 'green',
    path: '/pages/todo/index',
    listVisible: true,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'pets',
    label: '宠物',
    shortLabel: '宠物',
    description: '档案、照护、体重和日常',
    category: 'member',
    level: 'primary',
    parentId: 'pets',
    icon: 'paw-print',
    tone: 'pink',
    path: '/pages/pets/index',
    listVisible: true,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
] as const

const FEATURE_BY_ID = new Map(FEATURE_CATALOG.map((feature) => [feature.id, feature]))

export function getFeatureDefinition(id: string): FeatureDefinition | undefined {
  return FEATURE_BY_ID.get(id as FeatureId)
}

export function isFeatureAvailableIn(
  feature: FeatureDefinition,
  availability: FeatureAvailability,
): boolean {
  if (availability === 'list') return feature.listVisible
  if (availability === 'home') return feature.homeEligible
  return feature.tabEligible
}

export function getFeatureCategoryGroups(
  availability: FeatureAvailability = 'list',
): FeatureCategoryGroup[] {
  return FEATURE_CATEGORIES.map((category) => ({
    category,
    items: FEATURE_CATALOG.filter(
      (feature) =>
        feature.category === category.id &&
        isFeatureAvailableIn(feature, availability),
    ),
  })).filter((group) => group.items.length > 0)
}

export function getFeatureDefinitionOrThrow(id: FeatureId): FeatureDefinition {
  const feature = getFeatureDefinition(id)
  if (!feature) throw new Error(`未知功能：${id}`)
  return feature
}
