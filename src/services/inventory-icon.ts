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
  // 单字关键词太容易误命中（「洗面奶」被「奶」抓走），只保留两字以上。
  .filter((entry) => entry.word.length > 1)
  .sort((left, right) => right.word.length - left.word.length)

/** 常见商品的优先判定，压过规则表里的泛化词。 */
const ICON_OVERRIDES: Array<{ pattern: RegExp; key: string }> = [
  { pattern: /洗面奶|洁面|洗颜/, key: 'lotion-bottle' },
  { pattern: /洗发|沐浴|护发|洗手液/, key: 'lotion-bottle' },
  { pattern: /洗衣液|洗衣粉|柔顺剂|消毒液/, key: 'bucket' },
  { pattern: /牙膏/, key: 'toothbrush' },
  { pattern: /毛巾|浴巾|洗脸巾|面巾/, key: 'bathtub' },
  { pattern: /抽纸|卷纸|纸巾|卫生纸/, key: 'page-facing-up' },
  { pattern: /牛奶|酸奶|豆浆/, key: 'glass-of-milk' },
  { pattern: /驱虫|体外驱|体内驱|胶囊|维生素|创可贴|碘伏|药$|药\b/, key: 'pill' },
]

export function matchInventoryIcon(name: string, category?: string): string {
  const text = (name ?? '').trim().toLowerCase()
  if (!text) return categoryDefaultIcon(category)
  for (const rule of ICON_OVERRIDES) {
    if (rule.pattern.test(text)) return rule.key
  }
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
}): InventoryIconDisplay {
  // 只按名称/品类自动识别：用户手选容易挑错，也会让同类物品图标不一致。
  const key = matchInventoryIcon(options.name, options.category)
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
