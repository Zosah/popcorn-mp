import { describe, expect, it } from 'vitest'

import {
  FEATURE_CATALOG,
  getFeatureCategoryGroups,
  getFeatureDefinition,
} from '../../src/domain/feature-catalog'

describe('功能注册表', () => {
  it('功能 ID 唯一，且每个功能都有可打开的路由', () => {
    const ids = FEATURE_CATALOG.map((feature) => feature.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const feature of FEATURE_CATALOG) {
      expect(feature.path.startsWith('/pages/')).toBe(true)
      expect(feature.label.length).toBeGreaterThan(0)
      expect(feature.description.length).toBeGreaterThan(0)
    }
  })

  it('完整功能清单只展示一级能力，并按工具、备忘、成员分组', () => {
    const groups = getFeatureCategoryGroups('list')

    expect(groups.map((group) => group.category.title)).toEqual([
      '工具',
      '备忘',
      '成员',
    ])
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['inventory', 'menu', 'reminders'],
      ['todo', 'journal'],
      ['pets'],
    ])
    expect(groups.flatMap((group) => group.items).every((item) => item.level === 'primary')).toBe(true)
  })

  it('快捷入口可以解析二级功能和普通页面', () => {
    expect(getFeatureDefinition('pet-calendar')).toMatchObject({
      label: '宠物月历',
      category: 'member',
      launchMode: 'page',
    })
    expect(getFeatureDefinition('travel')).toMatchObject({
      label: '旅行准备',
      parentId: 'todo',
      launchMode: 'root',
    })
    expect(getFeatureDefinition('unknown')).toBeUndefined()
  })

  it('首页与底栏沿用各自的资格边界', () => {
    const homeItems = getFeatureCategoryGroups('home').flatMap((group) => group.items)
    const tabItems = getFeatureCategoryGroups('tab').flatMap((group) => group.items)

    expect(homeItems.some((item) => item.id === 'reminders')).toBe(true)
    expect(homeItems.some((item) => item.id === 'pet-calendar')).toBe(true)
    expect(tabItems.some((item) => item.id === 'reminders')).toBe(false)
    expect(tabItems.some((item) => item.id === 'pet-calendar')).toBe(false)
  })
})
