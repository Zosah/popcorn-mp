import { describe, expect, it } from 'vitest'
import {
  moveFeatureWithinSlots,
  placeFeatureInSlots,
} from '../../src/domain/feature-layout'
import type { FeatureId } from '../../src/domain/feature-catalog'

const base: FeatureId[] = ['journal', 'inventory', 'todo', 'pets']

describe('功能配置拖放', () => {
  it('从功能池拖入空位置时直接替换目标', () => {
    expect(placeFeatureInSlots(base, 'menu', 2)).toEqual([
      'journal',
      'inventory',
      'menu',
      'pets',
    ])
  })

  it('拖入已存在的功能时交换位置，不产生重复入口', () => {
    expect(placeFeatureInSlots(base, 'pets', 1)).toEqual([
      'journal',
      'pets',
      'todo',
      'inventory',
    ])
  })

  it('同一区域拖动时保持位置连续', () => {
    expect(moveFeatureWithinSlots(base, 0, 2)).toEqual([
      'inventory',
      'todo',
      'journal',
      'pets',
    ])
  })

  it('越界移动不改变当前配置', () => {
    expect(moveFeatureWithinSlots(base, -1, 2)).toEqual(base)
    expect(moveFeatureWithinSlots(base, 1, 9)).toEqual(base)
  })
})
