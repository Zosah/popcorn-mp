const DUAL_STATE_ICON_NAMES = new Set([
  'nav-home',
  'nav-profile',
  'feature-inventory',
  'feature-expense',
  'feature-menu',
  'feature-travel',
  'feature-fitness',
  'feature-journal',
  'feature-todo',
  'feature-pets',
])

// 迁移期兼容：旧 WXML/业务映射仍可继续传入 Lucide 名称，统一在这里收口。
const LEGACY_ICON_ALIASES: Record<string, string> = {
  bell: 'system-bell',
  'book-open': 'journal-tab-notes',
  bowl: 'menu-object-ingredient',
  'calendar-days': 'system-calendar',
  camera: 'system-camera',
  'chart-no-axes-column': 'pet-metric-weight',
  check: 'system-check',
  'chevron-down': 'system-expand',
  'circle-alert': 'system-alert',
  'circle-check': 'system-success',
  'clock-3': 'system-clock',
  droplet: 'pet-daily-water',
  droplets: 'pet-daily-water-change',
  dumbbell: 'fitness-object-exercise',
  'file-text': 'journal-tab-notes',
  flame: 'system-flame',
  folder: 'inventory-category-other',
  heart: 'pet-supply-custom',
  'heart-pulse': 'journal-note-health',
  house: 'system-space',
  image: 'system-image',
  'list-todo': 'todo-status-pending',
  lock: 'system-lock',
  'notebook-tabs': 'journal-tab-all',
  package: 'inventory-category-other',
  'paw-print': 'pet-tab-profile',
  'pen-line': 'system-edit',
  plane: 'travel-tab-plan',
  plus: 'system-add',
  'rotate-ccw': 'system-refresh',
  search: 'system-search',
  settings: 'system-settings',
  soup: 'menu-category-soup',
  ticket: 'system-invite',
  toilet: 'pet-daily-stool',
  'user-round': 'system-user',
  users: 'system-members',
  utensils: 'menu-tab-eat',
  wallet: 'expense-metric-monthly',
}

const TONE_ALIASES: Record<string, string> = {
  faint: 'muted',
  muted: 'muted',
  ink: 'ink',
  accent: 'accent',
  blue: 'accent',
  green: 'green',
  gold: 'gold',
  orange: 'gold',
  danger: 'danger',
  pink: 'danger',
  white: 'white',
  color: 'color',
}

function resolveIconAsset(name: string, tone: string, active: boolean): string {
  const normalizedName = LEGACY_ICON_ALIASES[name] ?? name
  if (!normalizedName) return ''
  const stateMatch = normalizedName.match(/^(.*)-(active|inactive)$/)
  if (stateMatch && DUAL_STATE_ICON_NAMES.has(stateMatch[1]!)) {
    return normalizedName
  }
  if (DUAL_STATE_ICON_NAMES.has(normalizedName)) {
    return `${normalizedName}-${active ? 'active' : 'inactive'}`
  }
  return `${normalizedName}-${TONE_ALIASES[tone] ?? 'muted'}`
}

Component({
  properties: {
    name: {
      type: String,
      value: '',
    },
    size: {
      type: Number,
      value: 32,
    },
    tone: {
      type: String,
      value: 'muted',
    },
    active: {
      type: Boolean,
      value: false,
    },
  },

  data: {
    src: '',
  },

  observers: {
    'name, tone, active'(
      name: string,
      tone: string,
      active: boolean,
    ) {
      const assetName = resolveIconAsset(name, tone, active)
      this.setData({
        src: assetName ? `/images/icons/${assetName}.png` : '',
      })
    },
  },
})
