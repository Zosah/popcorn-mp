import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DemoMealOrderGateway } from '../../src/services/demo-meal-order'
import { listDemoMenuRecipes } from '../../src/services/demo-menu'

describe('本地用餐订单', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('选菜后快照食材，并支持备菜、上桌和归档', async () => {
    const recipe = listDemoMenuRecipes()[0]
    if (!recipe) throw new Error('示例菜谱不存在')
    const gateway = new DemoMealOrderGateway()

    const created = await gateway.create({
      orderDate: '2026-11-02',
      mealType: 'dinner',
      note: '少盐',
      items: [{ recipeId: recipe.id, servings: 3 }],
    })
    expect(created).toMatchObject({
      status: 'pending',
      note: '少盐',
      version: 1,
      items: [{ recipeTitle: recipe.title, servings: 3 }],
    })
    expect(created.items[0]?.ingredients).toHaveLength(recipe.ingredients.length)

    const preparing = await gateway.setStatus(created.id, 'preparing', created.version)
    const firstIngredient = preparing.items[0]?.ingredients[0]
    if (!firstIngredient) throw new Error('备菜食材不存在')
    const ready = await gateway.setIngredientReady(
      preparing.id,
      firstIngredient.id,
      true,
      preparing.version,
    )
    expect(ready.items[0]?.ingredients[0]?.ready).toBe(true)

    const served = await gateway.setStatus(ready.id, 'ready', ready.version)
    const done = await gateway.setStatus(served.id, 'done', served.version)
    expect(done.status).toBe('done')
    expect(done.completedAt).toBeTruthy()
    expect(await gateway.list()).toEqual([done])
  })

  it('拒绝跳过状态和旧版本操作', async () => {
    const recipe = listDemoMenuRecipes()[0]
    if (!recipe) throw new Error('示例菜谱不存在')
    const gateway = new DemoMealOrderGateway()
    const created = await gateway.create({
      orderDate: '2026-11-02',
      mealType: 'dinner',
      note: '',
      items: [{ recipeId: recipe.id, servings: 2 }],
    })

    await expect(gateway.setStatus(created.id, 'done', created.version)).rejects.toMatchObject({
      code: 'MEAL_ORDER_STATUS_INVALID',
    })
    const updated = await gateway.setStatus(created.id, 'preparing', created.version)
    await expect(gateway.setStatus(created.id, 'ready', created.version)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    })
    expect(updated.version).toBe(2)
  })
})
