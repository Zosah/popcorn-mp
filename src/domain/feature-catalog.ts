/**
 * 功能注册表：标题、分类、图标、路由与快捷入口资格的唯一来源。
 *
 * 页面只保存功能 ID；展示信息全部从这里解析，避免功能清单、首页快捷入口和
 * 底部导航各自维护一份名称与路径。
 */

export type FeatureCategoryId = 'tool' | 'memo' | 'member'

export type FeatureTone = 'blue' | 'green' | 'gold' | 'pink' | 'orange'

export type FeatureLevel = 'primary' | 'secondary'

export type FeatureId =
  | 'inventory'
  | 'menu'
  | 'reminders'
  | 'todo'
  | 'journal'
  | 'pets'
  | 'pet-care'
  | 'pet-daily'
  | 'pet-calendar'
  | 'travel'
  | 'plan'
  | 'fitness'
  | 'expense'

export interface FeatureCategoryDefinition {
  id: FeatureCategoryId
  title: string
  eyebrow: string
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
  /** 是否作为一级功能出现在完整功能清单。二级能力收在父功能内部。 */
  listVisible: boolean
  /** 是否允许进入首页快捷入口。 */
  homeEligible: boolean
  /** 是否允许进入底部导航中间三个槽位。 */
  tabEligible: boolean
  /** 打开方式：根页面使用 reLaunch，普通二级页使用 navigateTo。 */
  launchMode: 'root' | 'page'
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
    eyebrow: 'TOOLS',
    description: '把具体的小事处理好',
    icon: 'package',
    tone: 'orange',
  },
  {
    id: 'memo',
    title: '备忘',
    eyebrow: 'MEMORY',
    description: '记下计划、花费与共同回忆',
    icon: 'notebook-tabs',
    tone: 'blue',
  },
  {
    id: 'member',
    title: '成员',
    eyebrow: 'FAMILY',
    description: '围绕家里的人和毛孩子',
    icon: 'paw-print',
    tone: 'pink',
  },
] as const

export const FEATURE_CATALOG: readonly FeatureDefinition[] = [
  {
    id: 'inventory',
    label: '家庭库存',
    shortLabel: '库存',
    description: '家里的物品、余量和临期提醒',
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
    id: 'menu',
    label: '今天吃什么',
    shortLabel: '吃什么',
    description: '菜单、推荐和做饭模式',
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
    id: 'reminders',
    label: '提醒设置',
    shortLabel: '提醒',
    description: '通知与订阅偏好',
    category: 'tool',
    level: 'primary',
    parentId: 'reminders',
    icon: 'bell',
    tone: 'blue',
    path: '/pages/reminder-settings/index',
    listVisible: true,
    homeEligible: true,
    tabEligible: false,
    launchMode: 'page',
  },
  {
    id: 'todo',
    label: '待办与小计划',
    shortLabel: '待办',
    description: '旅行、健身、账单和日常待办',
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
    id: 'journal',
    label: '生活记录',
    shortLabel: '记录',
    description: '共同回忆与重要资料',
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
  {
    id: 'pet-care',
    label: '宠物照护',
    shortLabel: '照护',
    description: '疫苗、驱虫、洗护与健康记录',
    category: 'member',
    level: 'secondary',
    parentId: 'pets',
    icon: 'heart-pulse',
    tone: 'pink',
    path: '/pages/pets/index?section=care',
    query: { section: 'care' },
    listVisible: false,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'pet-daily',
    label: '宠物日常',
    shortLabel: '日常',
    description: '吃饭、喝水、便便和尿尿记录',
    category: 'member',
    level: 'secondary',
    parentId: 'pets',
    icon: 'droplets',
    tone: 'green',
    path: '/pages/pets/index?section=daily',
    query: { section: 'daily' },
    listVisible: false,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'pet-calendar',
    label: '宠物月历',
    shortLabel: '月历',
    description: '照护安排、历史记录和下次计划',
    category: 'member',
    level: 'secondary',
    parentId: 'pets',
    icon: 'calendar-days',
    tone: 'pink',
    path: '/pages/pet-calendar/index',
    listVisible: false,
    homeEligible: true,
    tabEligible: false,
    launchMode: 'page',
  },
  {
    id: 'travel',
    label: '旅行准备',
    shortLabel: '旅行',
    description: '目的地、出发时间和准备清单',
    category: 'memo',
    level: 'secondary',
    parentId: 'todo',
    icon: 'plane',
    tone: 'blue',
    path: '/pages/todo/index?kind=travel',
    query: { kind: 'travel' },
    listVisible: false,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'plan',
    label: '小计划',
    shortLabel: '计划',
    description: '近期想做的事和完成进度',
    category: 'memo',
    level: 'secondary',
    parentId: 'todo',
    icon: 'list-todo',
    tone: 'green',
    path: '/pages/todo/index?kind=plan',
    query: { kind: 'plan' },
    listVisible: false,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'fitness',
    label: '健身计划',
    shortLabel: '健身',
    description: '运动、时长和热量记录',
    category: 'memo',
    level: 'secondary',
    parentId: 'todo',
    icon: 'dumbbell',
    tone: 'orange',
    path: '/pages/todo/index?kind=fitness',
    query: { kind: 'fitness' },
    listVisible: false,
    homeEligible: true,
    tabEligible: true,
    launchMode: 'root',
  },
  {
    id: 'expense',
    label: '我们的账单',
    shortLabel: '账单',
    description: '一起记下花了什么、买了什么',
    category: 'memo',
    level: 'secondary',
    parentId: 'todo',
    icon: 'wallet',
    tone: 'gold',
    path: '/pages/todo/index?kind=expense',
    query: { kind: 'expense' },
    listVisible: false,
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
