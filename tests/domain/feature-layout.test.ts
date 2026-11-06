import { describe, expect, it } from 'vitest'
import {
  moveFeatureWithinSlots,
  placeFeatureInSlots,
  placeIntoTabSlots,
  swapFeatureAcrossSlots,
} from '../../src/domain/feature-layout'
import type { FeatureId } from '../../src/domain/feature-catalog'

const base: FeatureId[] = ['journal', 'inventory', 'todo', 'pets']
const tabs: FeatureId[] = ['menu', 'expense', 'fitness']

describe('功能配置拖放', () => {
  it('从功能池拖入时替换目标', () => {
    expect(placeFeatureInSlots(base, 'travel', 2)).toEqual([
      'journal',
      'inventory',
      'travel',
      'pets',
    ])
  })

  it('拖入同区域已存在的功能时交换位置', () => {
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

  it('跨区域拖动交换槽位，不产生重复入口', () => {
    expect(swapFeatureAcrossSlots(base, 3, tabs, 1)).toEqual({
      source: ['journal', 'inventory', 'todo', 'expense'],
      target: ['menu', 'pets', 'fitness'],
    })
    expect(swapFeatureAcrossSlots(tabs, 0, base, 0)).toEqual({
      source: ['journal', 'expense', 'fitness'],
      target: ['menu', 'inventory', 'todo', 'pets'],
    })
  })

  it('越界移动不改变当前配置', () => {
    expect(moveFeatureWithinSlots(base, -1, 2)).toEqual(base)
    expect(moveFeatureWithinSlots(base, 1, 9)).toEqual(base)
    expect(swapFeatureAcrossSlots(base, 1, tabs, 9)).toEqual({ source: base, target: tabs })
  })
})

describe('把功能放进底栏', () => {
  const home: FeatureId[] = ['journal', 'inventory', 'todo', 'pets', 'travel']
  const tab: FeatureId[] = ['menu', 'expense', 'fitness']
  const all: FeatureId[] = ['inventory', 'expense', 'menu', 'travel', 'fitness', 'journal', 'todo', 'pets']

  it('功能放在隐藏的首页槽位时，与被顶掉的功能交换', () => {
    const result = placeIntoTabSlots(home, tab, 'inventory', 1, all)
    expect(result).not.toBeNull()
    expect(result!.tabSlots).toEqual(['menu', 'inventory', 'fitness'])
    expect(result!.homeSlots).toEqual(['journal', 'expense', 'todo', 'pets', 'travel'])
    expect(new Set([...result!.homeSlots, ...result!.tabSlots]).size).toBe(8)
  })

  it('功能不在首页槽位时只替换底栏目标', () => {
    const result = placeIntoTabSlots(home, ['menu', 'todo', 'pets'], 'fitness', 0, all)
    expect(result).not.toBeNull()
    expect(result!.tabSlots).toEqual(['fitness', 'todo', 'pets'])
    expect(result!.homeSlots).toEqual(home)
  })

  it('原地拖放不产生变化', () => {
    expect(placeIntoTabSlots(home, tab, 'menu', 0, all)).toBeNull()
  })
})
