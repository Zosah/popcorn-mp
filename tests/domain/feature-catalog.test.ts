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

  it('完整功能清单只有四类八个一级能力', () => {
    const groups = getFeatureCategoryGroups('list')

    expect(groups.map((group) => group.category.title)).toEqual([
      '工具',
      '生活',
      '备忘',
      '成员',
    ])
    expect(groups.map((group) => group.items.map((item) => item.id))).toEqual([
      ['inventory', 'expense', 'menu'],
      ['travel', 'fitness'],
      ['journal', 'todo'],
      ['pets'],
    ])
    expect(groups.flatMap((group) => group.items)).toHaveLength(8)
    expect(groups.flatMap((group) => group.items).every((item) => item.level === 'primary')).toBe(true)
  })

  it('所有一级功能都可进入首页和底栏，且有明确路由', () => {
    expect(getFeatureDefinition('travel')).toMatchObject({
      label: '旅行',
      category: 'life',
      path: '/pages/todo/index?kind=travel',
      launchMode: 'root',
    })
    expect(getFeatureDefinition('todo')).toMatchObject({
      label: '待办',
      path: '/pages/todo/index',
    })
    expect(getFeatureDefinition('unknown')).toBeUndefined()

    const homeItems = getFeatureCategoryGroups('home').flatMap((group) => group.items)
    const tabItems = getFeatureCategoryGroups('tab').flatMap((group) => group.items)
    expect(homeItems.map((item) => item.id)).toEqual(FEATURE_CATALOG.map((item) => item.id))
    expect(tabItems.map((item) => item.id)).toEqual(FEATURE_CATALOG.map((item) => item.id))
  })
})
