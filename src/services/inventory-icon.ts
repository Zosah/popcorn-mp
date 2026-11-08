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

/**
 * 常见商品的优先判定，压过规则表里的泛化词。
 * 顺序自上而下，越具体越靠前；命中即返回。
 */
const ICON_OVERRIDES: Array<{ pattern: RegExp; key: string }> = [
  // 先判定的高优先级：避免被泛化词（鱼/米/笔记本）抢先
  { pattern: /虾仁|河虾|基围虾|大虾|虾/, key: 'fried-shrimp' },
  { pattern: /鱿鱼|墨鱼|八爪鱼/, key: 'squid' },
  { pattern: /笔记本电脑|平板电脑|电脑/, key: 'laptop' },
  { pattern: /粥|羹/, key: 'steaming-bowl' },
  // 洗护
  { pattern: /洗面奶|洁面|洗颜/, key: 'lotion-bottle' },
  { pattern: /洗发|沐浴|护发|洗手液|身体乳|润肤|防晒|面膜|香水|精华|乳液/, key: 'lotion-bottle' },
  { pattern: /牙膏/, key: 'toothbrush' },
  { pattern: /漱口水|牙线/, key: 'tooth' },
  { pattern: /卫生巾|护垫|棉条/, key: 'page-with-curl' },
  { pattern: /棉签|化妆棉|卸妆棉/, key: 'sponge' },
  { pattern: /指甲刀|指甲剪|剃须|刮胡/, key: 'razor' },
  { pattern: /梳子|发梳|头梳/, key: 'hair-pick' },
  { pattern: /吹风机|卷发棒|电吹风/, key: 'electric-plug' },
  { pattern: /毛巾|浴巾|洗脸巾|面巾|浴球/, key: 'bathtub' },

  // 清洁
  { pattern: /洗衣液|洗衣粉|柔顺剂|消毒液|漂白/, key: 'bucket' },
  { pattern: /洁厕|马桶清洁|洁厕灵/, key: 'toilet' },
  { pattern: /洗洁精|清洁剂|去污|除垢/, key: 'bubbles' },
  { pattern: /垃圾袋|保鲜袋|保鲜膜|密封袋/, key: 'package' },
  { pattern: /抹布|海绵|百洁布/, key: 'sponge' },
  { pattern: /拖把|扫把|簸箕|吸尘/, key: 'broom' },
  { pattern: /垃圾桶|废纸篓/, key: 'wastebasket' },
  { pattern: /湿巾|厨房纸|纸巾|抽纸|卷纸|卫生纸/, key: 'page-facing-up' },

  // 纸品与办公
  { pattern: /笔记本|便签|记事/, key: 'memo' },
  { pattern: /签字笔|圆珠笔|铅笔|中性笔|马克笔/, key: 'pencil' },
  { pattern: /文件夹|资料册|档案袋/, key: 'clipboard' },
  { pattern: /打印纸|A4纸|复印纸/, key: 'page-with-curl' },
  { pattern: /订书机|回形针|长尾夹|夹子/, key: 'paperclip' },
  { pattern: /胶水|胶棒|双面胶|透明胶|胶带/, key: 'package' },
  { pattern: /墨盒|硒鼓|墨水/, key: 'package' },

  // 日用杂货
  { pattern: /插线板|排插|插座|转换插头/, key: 'electric-plug' },
  { pattern: /电池|充电宝/, key: 'battery' },
  { pattern: /灯泡|灯管|台灯/, key: 'light-bulb' },
  { pattern: /雨伞|雨衣/, key: 'umbrella' },
  { pattern: /衣架|挂衣/, key: 't-shirt' },
  { pattern: /收纳箱|收纳筐|收纳篮|整理箱/, key: 'basket' },
  { pattern: /剪刀|美工剪/, key: 'scissors' },
  { pattern: /工具箱|工具盒|五金/, key: 'toolbox' },
  { pattern: /尺子|直尺|钢尺|卷尺/, key: 'straight-ruler' },
  { pattern: /便利贴|索引贴/, key: 'bookmark-tabs' },
  { pattern: /标签|便签纸/, key: 'label' },
  { pattern: /报纸|报刊|杂志/, key: 'newspaper' },
  { pattern: /钱包|零钱包|卡包/, key: 'purse' },
  { pattern: /公文包|电脑包/, key: 'briefcase' },
  { pattern: /外套|大衣|风衣/, key: 'coat' },
  { pattern: /裙/, key: 'dress' },
  { pattern: /口红|唇膏|唇釉/, key: 'lipstick' },
  { pattern: /指甲油|护甲/, key: 'nail-polish' },
  { pattern: /绳子|皮筋|橡皮筋|扎带/, key: 'knot' },
  { pattern: /玩偶|毛绒玩具|公仔/, key: 'teddy-bear' },
  { pattern: /气球/, key: 'balloon' },
  { pattern: /礼物|礼品|礼盒/, key: 'gift' },
  { pattern: /耳机|耳麦/, key: 'headphone' },
  { pattern: /电脑|平板/, key: 'laptop' },
  { pattern: /手机|电话/, key: 'mobile-phone' },
  { pattern: /针线|缝衣|顶针/, key: 'sewing-needle' },
  { pattern: /锁|门锁|钥匙/, key: 'key' },
  { pattern: /锤子|起子|扳手|工具/, key: 'screwdriver' },

  // 食品与生鲜
  { pattern: /面$|挂面|意面|拉面|燕麦|面粉|泡面|方便面|面包|吐司|馒头/, key: 'bread' },
  { pattern: /米|杂粮|薏米|小米/, key: 'cooked-rice' },
  { pattern: /黄瓜|生菜|菠菜|白菜|青菜|油菜|芹菜|西兰花|花菜|豆角|茄子|南瓜/, key: 'broccoli' },
  { pattern: /豆腐|豆干|腐竹|豆皮/, key: 'cheese-wedge' },
  { pattern: /虾|鱼|三文鱼|带鱼|蛤蜊|鱿鱼/, key: 'fish' },
  { pattern: /排骨|筒骨|骨头/, key: 'meat-on-bone' },
  { pattern: /鸡腿|鸡翅|鸡肉|鸭腿|鸭肉/, key: 'poultry-leg' },
  { pattern: /猪肉|牛肉|羊肉|五花肉|里脊|肉馅|肉末/, key: 'cut-of-meat' },
  { pattern: /培根|火腿/, key: 'bacon' },
  { pattern: /饺子|馄饨|云吞|汤圆/, key: 'dumpling' },
  { pattern: /螃蟹|蟹/, key: 'crab' },
  { pattern: /寿司/, key: 'sushi' },
  { pattern: /汤$|粥$|羹$/, key: 'steaming-bowl' },
  { pattern: /煎饼|手抓饼|葱油饼|馅饼|烙饼|饼/, key: 'flatbread' },
  { pattern: /咖喱/, key: 'curry-rice' },
  { pattern: /便当|饭盒/, key: 'bento-box' },
  { pattern: /黄油|奶油|芝士/, key: 'butter' },
  { pattern: /奶茶/, key: 'bubble-tea' },
  { pattern: /巧克力/, key: 'chocolate-bar' },
  { pattern: /甜甜圈|面包圈/, key: 'doughnut' },
  { pattern: /蛋挞|挞|^派$/, key: 'pie' },
  { pattern: /啤酒|扎啤/, key: 'beer-mug' },
  { pattern: /饺子|汤圆|馄饨|包子/, key: 'pot-of-food' },
  { pattern: /盐|花椒|八角|胡椒|辣椒粉|孜然/, key: 'salt' },
  { pattern: /糖|冰糖|红糖/, key: 'candy' },
  { pattern: /醋|料酒|蚝油|生抽|老抽|酱/, key: 'pouring-liquid' },
  { pattern: /食用油|花生油|橄榄油|菜籽油/, key: 'olive' },
  { pattern: /啤酒|白酒|红酒|黄酒|米酒/, key: 'bottle-with-popping-cork' },
  { pattern: /咖啡|挂耳|咖啡豆/, key: 'hot-beverage' },
  { pattern: /茶叶|绿茶|红茶|乌龙/, key: 'teacup-without-handle' },
  { pattern: /可乐|汽水|苏打水/, key: 'cup-with-straw' },
  { pattern: /矿泉水|纯净水|饮用水/, key: 'potable-water' },
  { pattern: /牛奶|酸奶|豆浆/, key: 'glass-of-milk' },
  { pattern: /饼干|曲奇|威化/, key: 'cookie' },
  { pattern: /糖果|巧克力|软糖/, key: 'candy' },
  { pattern: /薯片|膨化/, key: 'popcorn' },
  { pattern: /冰淇淋|雪糕|冰棍/, key: 'soft-ice-cream' },
  { pattern: /速冻|冷冻/, key: 'ice' },

  // 医药
  { pattern: /驱虫|体外驱|体内驱|胶囊|维生素|益生菌|创可贴|碘伏|药$|药\b/, key: 'pill' },
  { pattern: /创可贴|纱布|绷带/, key: 'adhesive-bandage' },
  { pattern: /口罩/, key: 'face-with-medical-mask' },
  { pattern: /体温计|温度计/, key: 'thermometer' },
  { pattern: /手套/, key: 'gloves' },

  // 宠物
  { pattern: /猫粮/, key: 'cat-face' },
  { pattern: /狗粮/, key: 'dog-face' },
  { pattern: /猫砂|尿垫/, key: 'litter-in-bin-sign' },
  { pattern: /猫条|零食|罐头/, key: 'bone' },

  // 衣物与床品
  { pattern: /袜子/, key: 'socks' },
  { pattern: /内衣|羽绒服|T恤|衬衫|卫衣/, key: 't-shirt' },
  { pattern: /裤子|牛仔裤|短裤/, key: 'jeans' },
  { pattern: /鞋|拖鞋|球鞋/, key: 'running-shoe' },
  { pattern: /床单|枕套|被套|被子|床品/, key: 'bed' },
  { pattern: /背包|书包/, key: 'backpack' },
  { pattern: /包包|手提包/, key: 'handbag' },
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
