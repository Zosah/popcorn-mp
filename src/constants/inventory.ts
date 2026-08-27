import type {
  InventoryCategory,
  InventoryLocation,
} from '../domain/inventory'

export interface SelectOption<T extends string> {
  value: T
  label: string
}

export const CATEGORY_OPTIONS: SelectOption<InventoryCategory>[] = [
  { value: 'food', label: '食品' },
  { value: 'drink', label: '饮料' },
  { value: 'frozen', label: '冷冻' },
  { value: 'seasoning', label: '调料' },
  { value: 'daily', label: '日用品' },
  { value: 'medicine', label: '药品' },
  { value: 'pet', label: '宠物用品' },
  { value: 'other', label: '其他' },
]

export const LOCATION_OPTIONS: SelectOption<InventoryLocation>[] = [
  { value: 'fridge', label: '冰箱冷藏' },
  { value: 'freezer', label: '冰箱冷冻' },
  { value: 'kitchen', label: '厨房' },
  { value: 'living-room', label: '客厅' },
  { value: 'bathroom', label: '卫生间' },
  { value: 'storage', label: '储物间' },
  { value: 'other', label: '其他' },
]

export function getCategoryLabel(category: InventoryCategory): string {
  return CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? '其他'
}

export function getLocationLabel(location: InventoryLocation): string {
  return LOCATION_OPTIONS.find((option) => option.value === location)?.label ?? '其他'
}
