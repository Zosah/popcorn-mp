import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  addDemoMenuRecipe,
  getDemoMenuRecipe,
  listDemoMenuRecipes,
  removeDemoMenuRecipe,
  updateDemoMenuIngredientReady,
  updateDemoMenuServings,
} from '../../src/services/demo-menu'

const STORAGE_KEY = 'popcorn_demo_menu_v1'

describe('菜单本地存储', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map<string, unknown>()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('首次读取生成两道示例菜单', () => {
    const recipes = listDemoMenuRecipes()
    expect(recipes).toHaveLength(2)
    expect(recipes[0]?.title).toBe('番茄牛腩')
  })

  it('支持新增、读取和删除菜单', () => {
    const created = addDemoMenuRecipe({
      title: '蛋炒饭',
      description: '很快',
      servings: 1,
      cookingMinutes: 12,
      ingredients: [{ name: '米饭', amount: '1 碗', source: '冰箱' }],
      steps: [{ title: '翻炒', description: '炒匀即可' }],
    })

    expect(getDemoMenuRecipe(created.id)?.title).toBe('蛋炒饭')
    expect(removeDemoMenuRecipe(created.id)).toBe(true)
    expect(getDemoMenuRecipe(created.id)).toBeUndefined()
    expect(storage.get(STORAGE_KEY)).toBeTruthy()
  })

  it('人份和食材准备状态会持久化', () => {
    const original = listDemoMenuRecipes()[0]
    if (!original || !original.ingredients[0]) throw new Error('示例菜单不存在')

    const withServings = updateDemoMenuServings(original.id, 4)
    expect(withServings.servings).toBe(4)

    const withIngredient = updateDemoMenuIngredientReady(
      original.id,
      original.ingredients[0].id,
      true,
    )
    expect(withIngredient.ingredients[0]?.ready).toBe(true)
    expect(getDemoMenuRecipe(original.id)?.ingredients[0]?.ready).toBe(true)
  })
})
