import type {
  PetCareType,
  PetDailyLogType,
  PetSpecies,
  PetSupplyCategory,
} from './demo-pet'

/**
 * 物种档案：同一套宠物能力，按物种决定「显示哪些打卡项 / 护理项 / 用品分类」。
 *
 * 页面只读这里，不再各自判断 species；以后加兔子、仓鼠只需要补一条配置。
 * 注意：过滤只影响「能新建什么」，历史记录永远照常显示。
 */
export interface PetSpeciesProfile {
  id: PetSpecies
  label: string
  /** 日常打卡卡（顺序即展示顺序） */
  dailyTypes: readonly PetDailyLogType[]
  /** 护理卡（含周期提醒） */
  careTypes: readonly PetCareType[]
  /** 用品分类 */
  supplyCategories: readonly PetSupplyCategory[]
  /** 新建护理记录时预填的复查周期（天） */
  careIntervals: Partial<Record<PetCareType, number>>
}

const CAT_PROFILE: PetSpeciesProfile = {
  id: 'cat',
  label: '猫咪',
  dailyTypes: ['meal', 'water', 'stool', 'urine', 'litter-change', 'water-change'],
  careTypes: ['grooming', 'internal-deworm', 'external-deworm'],
  supplyCategories: ['kibble', 'can', 'freeze-dried', 'soup', 'litter', 'custom'],
  careIntervals: { grooming: 120, 'internal-deworm': 90, 'external-deworm': 30 },
}

const DOG_PROFILE: PetSpeciesProfile = {
  id: 'dog',
  label: '狗狗',
  dailyTypes: ['meal', 'water', 'stool', 'urine', 'walk', 'water-change'],
  careTypes: ['grooming', 'internal-deworm', 'external-deworm', 'nail-trim'],
  supplyCategories: ['kibble', 'can', 'freeze-dried', 'snack', 'leash', 'pad', 'custom'],
  careIntervals: { grooming: 21, 'internal-deworm': 90, 'external-deworm': 30, 'nail-trim': 28 },
}

const OTHER_PROFILE: PetSpeciesProfile = {
  id: 'other',
  label: '其他',
  dailyTypes: ['meal', 'water', 'stool', 'urine', 'record', 'water-change'],
  careTypes: ['grooming', 'internal-deworm', 'external-deworm'],
  supplyCategories: ['kibble', 'custom'],
  careIntervals: { grooming: 90, 'internal-deworm': 90, 'external-deworm': 30 },
}

export const PET_SPECIES_PROFILES: Record<PetSpecies, PetSpeciesProfile> = {
  cat: CAT_PROFILE,
  dog: DOG_PROFILE,
  other: OTHER_PROFILE,
}

/** 没有 species 的老数据按猫处理，保证行为不变。 */
export function getPetSpeciesProfile(species?: PetSpecies | string): PetSpeciesProfile {
  if (species === 'dog') return DOG_PROFILE
  if (species === 'other') return OTHER_PROFILE
  return CAT_PROFILE
}
