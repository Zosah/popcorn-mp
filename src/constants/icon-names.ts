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
  food: 'utensils',
  drink: 'droplet',
  frozen: 'flame',
  seasoning: 'soup',
  daily: 'package',
  medicine: 'circle-alert',
  pet: 'paw-print',
  other: 'folder',
}

export const INVENTORY_LOCATION_ICON_NAMES: Record<
  InventoryLocation,
  string
> = {
  fridge: 'droplets',
  freezer: 'flame',
  kitchen: 'utensils',
  'living-room': 'house',
  bathroom: 'droplets',
  storage: 'package',
  other: 'folder',
}

export const PET_EVENT_ICON_NAMES: Record<PetEventType, string> = {
  vaccine: 'droplet',
  neuter: 'heart-pulse',
  grooming: 'droplets',
  illness: 'circle-alert',
  visit: 'heart-pulse',
  outing: 'paw-print',
  'internal-deworm': 'circle-alert',
  'external-deworm': 'circle-alert',
}

export const PET_TIMELINE_ICON_NAMES: Record<
  PetTimelineItem['type'],
  string
> = {
  ...PET_EVENT_ICON_NAMES,
  birthday: 'ticket',
  home: 'house',
}

export const PET_DAILY_ICON_NAMES: Record<PetDailyLogType, string> = {
  meal: 'utensils',
  water: 'droplets',
  stool: 'toilet',
  urine: 'droplet',
}

export const PET_SUPPLY_ICON_NAMES: Record<PetSupplyCategory, string> = {
  kibble: 'soup',
  can: 'soup',
  'freeze-dried': 'soup',
  soup: 'soup',
  litter: 'package',
}
