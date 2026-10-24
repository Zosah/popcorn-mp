import type {
  DemoMenuRecipe,
  DemoMenuRecipeInput,
} from '../domain/demo-menu'
import {
  createDemoMenuRecipe,
  createDemoMenuSeedRecipes,
  normalizeDemoMenuRecipe,
  updateDemoMenuRecipe as applyDemoMenuUpdate,
} from '../domain/demo-menu'

const STORAGE_KEY = 'popcorn_demo_menu_v1'
const SEEDED_KEY = 'popcorn_demo_menu_seeded_v1'

export const DEMO_MENU_STORAGE_KEYS = [STORAGE_KEY, SEEDED_KEY] as const

function readStoredRecipes(): DemoMenuRecipe[] {
  const recipes = wx.getStorageSync<DemoMenuRecipe[] | ''>(STORAGE_KEY)
  if (!Array.isArray(recipes)) return []
  return recipes
    .filter((recipe) => recipe && typeof recipe.id === 'string')
    .map((recipe) => normalizeDemoMenuRecipe(recipe))
}

function writeStoredRecipes(recipes: DemoMenuRecipe[]): void {
  wx.setStorageSync(STORAGE_KEY, recipes)
}

function ensureSeedRecipes(): void {
  const seeded = wx.getStorageSync<boolean | ''>(SEEDED_KEY)
  if (seeded === true) return

  const existing = readStoredRecipes()
  if (existing.length === 0) {
    wx.setStorageSync(STORAGE_KEY, createDemoMenuSeedRecipes())
  }
  wx.setStorageSync(SEEDED_KEY, true)
}

export function listDemoMenuRecipes(): DemoMenuRecipe[] {
  ensureSeedRecipes()
  return readStoredRecipes()
}

export function getDemoMenuRecipe(id: string): DemoMenuRecipe | undefined {
  ensureSeedRecipes()
  return readStoredRecipes().find((recipe) => recipe.id === id)
}

export function addDemoMenuRecipe(input: DemoMenuRecipeInput): DemoMenuRecipe {
  ensureSeedRecipes()
  const recipe = createDemoMenuRecipe(input)
  writeStoredRecipes([recipe, ...readStoredRecipes()])
  return recipe
}

export function updateDemoMenuRecipe(
  id: string,
  input: DemoMenuRecipeInput,
): DemoMenuRecipe {
  ensureSeedRecipes()
  const recipes = readStoredRecipes()
  const index = recipes.findIndex((recipe) => recipe.id === id)
  const current = recipes[index]
  if (!current) throw new Error('这份菜单不存在')

  const updated = applyDemoMenuUpdate(current, input)
  const next = recipes.slice()
  next[index] = updated
  writeStoredRecipes(next)
  return updated
}

export function updateDemoMenuServings(
  id: string,
  servings: number,
): DemoMenuRecipe {
  const recipe = getDemoMenuRecipe(id)
  if (!recipe) throw new Error('这份菜单不存在')
  return updateDemoMenuRecipe(id, { ...recipe, servings })
}

export function updateDemoMenuIngredientReady(
  id: string,
  ingredientId: string,
  ready: boolean,
): DemoMenuRecipe {
  ensureSeedRecipes()
  const recipes = readStoredRecipes()
  const index = recipes.findIndex((item) => item.id === id)
  const current = recipes[index]
  if (!current) throw new Error('这份菜单不存在')
  if (!current.ingredients.some((item) => item.id === ingredientId)) {
    throw new Error('这项食材不存在')
  }

  const updated: DemoMenuRecipe = {
    ...current,
    ingredients: current.ingredients.map((item) =>
      item.id === ingredientId ? { ...item, ready } : item,
    ),
  }
  recipes[index] = updated
  writeStoredRecipes(recipes)
  return updated
}

export function removeDemoMenuRecipe(id: string): boolean {
  ensureSeedRecipes()
  const recipes = readStoredRecipes()
  const next = recipes.filter((recipe) => recipe.id !== id)
  if (next.length === recipes.length) return false
  writeStoredRecipes(next)
  return true
}

export function resetDemoMenuData(): void {
  for (const key of DEMO_MENU_STORAGE_KEYS) wx.removeStorageSync(key)
  ensureSeedRecipes()
}
