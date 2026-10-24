import { describe, expect, it } from 'vitest'

import {
  createDemoMenuRecipe,
  createDemoMenuSeedRecipes,
  formatDemoMenuIngredients,
  formatDemoMenuSteps,
  parseDemoMenuIngredients,
  parseDemoMenuSteps,
  updateDemoMenuRecipe,
} from '../../src/domain/demo-menu'

describe('菜单数据规则', () => {
  it('创建菜单时整理文本并规范化数值', () => {
    const recipe = createDemoMenuRecipe(
      {
        title: '  番茄鸡蛋面  ',
        description: ' 二十分钟晚餐 ',
        servings: 2.4,
        cookingMinutes: 18.6,
        ingredients: [
          { name: ' 面条 ', amount: ' 200g ', source: ' 储物柜 ' },
        ],
        steps: [{ title: ' 煮面 ', description: ' 煮熟后捞出。 ' }],
      },
      Date.UTC(2026, 9, 24),
      () => 'menu-test',
    )

    expect(recipe).toMatchObject({
      id: 'menu-test',
      title: '番茄鸡蛋面',
      description: '二十分钟晚餐',
      servings: 2,
      cookingMinutes: 19,
    })
    expect(recipe.ingredients[0]).toMatchObject({ name: '面条', amount: '200g', ready: false })
  })

  it('编辑菜单时按食材名称保留备料勾选状态', () => {
    const recipe = createDemoMenuRecipe(
      {
        title: '拌面',
        description: '',
        servings: 2,
        cookingMinutes: 15,
        ingredients: [{ name: '面条', amount: '200g', source: '柜子' }],
        steps: [{ title: '煮面', description: '' }],
      },
      Date.UTC(2026, 9, 20),
      () => 'menu-1',
    )
    recipe.ingredients[0]!.ready = true

    const updated = updateDemoMenuRecipe(
      recipe,
      {
        title: '葱油拌面',
        description: '更快一点',
        servings: 3,
        cookingMinutes: 16,
        ingredients: [
          { name: '面条', amount: '300g', source: '柜子' },
          { name: '小葱', amount: '1 把', source: '冰箱' },
        ],
        steps: [{ title: '煮面', description: '煮熟' }],
      },
      Date.UTC(2026, 9, 21),
    )

    expect(updated.ingredients[0]?.ready).toBe(true)
    expect(updated.ingredients[1]?.ready).toBe(false)
  })

  it('支持表单文本与结构化食材步骤互转', () => {
    const ingredients = parseDemoMenuIngredients(
      '牛腩 | 400g | 冷冻\n番茄 | 3 个 | 冷藏',
    )
    const steps = parseDemoMenuSteps('焯水 | 洗净浮沫\n慢炖 | 45 分钟')

    expect(formatDemoMenuIngredients(ingredients.map((item, index) => ({
      ...item,
      id: String(index),
      ready: false,
    })))).toBe('牛腩 | 400g | 冷冻\n番茄 | 3 个 | 冷藏')
    expect(formatDemoMenuSteps(steps.map((item, index) => ({
      ...item,
      id: String(index),
    })))).toBe('焯水 | 洗净浮沫\n慢炖 | 45 分钟')
  })

  it('提供两道可操作的示例菜单', () => {
    const recipes = createDemoMenuSeedRecipes(Date.UTC(2026, 9, 24))

    expect(recipes).toHaveLength(2)
    expect(recipes[0]).toMatchObject({
      id: 'demo-menu-tomato-beef',
      title: '番茄牛腩',
    })
    expect(recipes[1]).toMatchObject({
      id: 'demo-menu-scallion-noodles',
      title: '葱油拌面',
    })
  })
})
