import type {
  InventoryCategory,
  InventoryLocation,
} from '../domain/inventory'
import type {
  PetDailyLogType,
  PetEventType,
  PetSupplyCategory,
  PetTimelineItem,
} from '../domain/demo-pet'

export const INVENTORY_CATEGORY_ICON_NAMES: Record<
  InventoryCategory,
  string
> = {
  food: 'inventory-category-food',
  drink: 'inventory-category-drink',
  frozen: 'inventory-category-frozen',
  seasoning: 'inventory-category-seasoning',
  daily: 'inventory-category-daily',
  medicine: 'inventory-category-medicine',
  pet: 'inventory-category-pet',
  other: 'inventory-category-other',
}

export const INVENTORY_LOCATION_ICON_NAMES: Record<
  InventoryLocation,
  string
> = {
  fridge: 'inventory-location-fridge',
  freezer: 'inventory-location-freezer',
  kitchen: 'inventory-location-kitchen',
  'living-room': 'inventory-location-living-room',
  bathroom: 'inventory-location-bathroom',
  storage: 'inventory-location-storage',
  other: 'inventory-location-other',
}

export const PET_EVENT_ICON_NAMES: Record<PetEventType, string> = {
  vaccine: 'pet-care-vaccine',
  neuter: 'pet-care-neuter',
  grooming: 'pet-care-grooming',
  illness: 'pet-care-illness',
  visit: 'pet-care-visit',
  outing: 'pet-care-outing',
  'internal-deworm': 'pet-care-internal-deworm',
  'external-deworm': 'pet-care-external-deworm',
}

export const PET_TIMELINE_ICON_NAMES: Record<
  PetTimelineItem['type'],
  string
> = {
  ...PET_EVENT_ICON_NAMES,
  birthday: 'pet-care-birthday',
  home: 'pet-care-homecoming',
}

export const PET_DAILY_ICON_NAMES: Record<PetDailyLogType, string> = {
  meal: 'pet-daily-meal',
  water: 'pet-daily-water',
  stool: 'pet-daily-stool',
  urine: 'pet-daily-urine',
  'litter-change': 'pet-daily-litter-change',
  'water-change': 'pet-daily-water-change',
  record: 'pet-daily-record',
}

export const PET_SUPPLY_ICON_NAMES: Record<PetSupplyCategory, string> = {
  kibble: 'pet-supply-kibble',
  can: 'pet-supply-can',
  'freeze-dried': 'pet-supply-freeze-dried',
  soup: 'pet-supply-soup',
  litter: 'pet-supply-litter',
  custom: 'pet-supply-custom',
}
