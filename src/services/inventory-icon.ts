import {
  INVENTORY_ICON_FALLBACK_COLORS,
  INVENTORY_ICON_RULES,
  INVENTORY_ICONS,
} from '../constants/inventory-icons'
import { appConfig } from '../config/env'

/** 图标全部走服务端静态资源，不在小程序包里塞 136 张图。 */
const ICON_BASE = `${appConfig.apiBaseUrl.replace(/\/+$/, '')}/static/inventory-icons/v1`

export type InventoryIconSize = 64 | 128

export function inventoryIconUrl(key: string, size: InventoryIconSize = 128): string {
  if (!key) return ''
  return `${ICON_BASE}/png${size}/${key}.png`
}

const ICON_KEYS = new Set(INVENTORY_ICONS.map((item) => item.key))

export function isKnownInventoryIcon(key: string): boolean {
  return ICON_KEYS.has(key)
}

/** 名称 → 图标 key：按关键词长度倒序，先长后短，避免「抽纸」被「纸」抢先命中。 */
const KEYWORD_TABLE: Array<{ word: string; key: string }> = INVENTORY_ICON_RULES
  .flatMap((rule) => rule.words.map((word) => ({ word, key: rule.key })))
  .sort((left, right) => right.word.length - left.word.length)

export function matchInventoryIcon(name: string, category?: string): string {
  const text = (name ?? '').trim().toLowerCase()
  if (!text) return categoryDefaultIcon(category)
  for (const entry of KEYWORD_TABLE) {
    if (text.includes(entry.word)) return entry.key
  }
  return categoryDefaultIcon(category)
}

/** 品类兜底：没有命中关键词时，用该品类最常见的图标，避免全是首字色块。 */
function categoryDefaultIcon(category?: string): string {
  switch (category) {
    case 'drink': return 'cup-with-straw'
    case 'frozen': return 'ice'
    case 'seasoning': return 'salt'
    case 'daily': return 'basket'
    case 'medicine': return 'pill'
    case 'pet': return 'paw-prints'
    case 'other': return 'package'
    default: return 'cooked-rice'
  }
}

export interface InventoryIconDisplay {
  iconKey: string
  iconUrl: string
  fallbackText: string
  fallbackColor: string
}

/** 三级兜底：用户选的图标 → 名称自动匹配 → 首字色块。 */
export function resolveInventoryIcon(options: {
  name: string
  category?: string
  iconKey?: string
}): InventoryIconDisplay {
  const explicit = (options.iconKey ?? '').trim()
  const key = explicit && isKnownInventoryIcon(explicit)
    ? explicit
    : matchInventoryIcon(options.name, options.category)
  const initial = Array.from(options.name.trim())[0] ?? '物'
  const index = Math.abs(hashCode(options.name)) % INVENTORY_ICON_FALLBACK_COLORS.length
  return {
    iconKey: key,
    iconUrl: key ? inventoryIconUrl(key) : '',
    fallbackText: initial,
    fallbackColor: INVENTORY_ICON_FALLBACK_COLORS[index] ?? '#f3ece2',
  }
}

function hashCode(value: string): number {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return hash
}
