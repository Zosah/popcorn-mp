import type { DemoMenuRecipe } from '../domain/demo-menu'
import {
  addDemoMenuRecipe,
  getDemoMenuRecipe,
  listDemoMenuRecipes,
  removeDemoMenuRecipe,
  updateDemoMenuIngredientReady,
  updateDemoMenuRecipe,
  updateDemoMenuServings,
} from './demo-menu'
import { mediaGateway } from './media'
import {
  MenuGatewayError,
  type MenuCategory,
  type MenuGateway,
  type MenuListFilters,
  type MenuRecipe,
  type MenuWriteInput,
} from './menu-gateway'

const DEFAULT_CATEGORIES: MenuCategory[] = [
  { id: 'demo-category-meat', name: '肉类', isSystem: true, sortOrder: 10 },
  { id: 'demo-category-vegetable', name: '菜类', isSystem: true, sortOrder: 20 },
  { id: 'demo-category-soup', name: '汤类', isSystem: true, sortOrder: 30 },
  { id: 'demo-category-staple', name: '主食', isSystem: true, sortOrder: 40 },
  { id: 'demo-category-other', name: '其他', isSystem: true, sortOrder: 50 },
]

export class DemoMenuGateway implements MenuGateway {
  private readonly versions = new Map<string, number>()
  private readonly mediaIds = new Map<string, string>()
  private readonly noteMediaIds = new Map<string, string[]>()
  private readonly categories: MenuCategory[] = DEFAULT_CATEGORIES.map((item) => ({ ...item }))
  private nextCategoryId = 1

  async list(filters: MenuListFilters = {}): Promise<MenuRecipe[]> {
    const query = filters.query?.trim().toLocaleLowerCase() ?? ''
    const maxMinutes = filters.maxMinutes ?? 0
    const recipes = listDemoMenuRecipes()
      .filter((recipe) => !maxMinutes || recipe.cookingMinutes <= maxMinutes)
      .filter((recipe) => {
        if (!query) return true
        const haystack = [
          recipe.title,
          recipe.description,
          ...recipe.ingredients.map((item) => item.name),
        ].join('\n').toLocaleLowerCase()
        return haystack.includes(query)
      })
    return Promise.all(recipes.map((recipe) => this.toRecipe(recipe)))
  }

  async get(id: string): Promise<MenuRecipe | null> {
    const recipe = getDemoMenuRecipe(id)
    return recipe ? this.toRecipe(recipe) : null
  }

  async listCategories(): Promise<MenuCategory[]> {
    return this.categories.map((item) => ({ ...item }))
  }

  async createCategory(name: string): Promise<MenuCategory> {
    const normalized = name.trim()
    if (!normalized) throw new MenuGatewayError('VALIDATION_FAILED', '先写下分类名称')
    if (this.categories.some((item) => item.name === normalized)) {
      throw new MenuGatewayError('CATEGORY_EXISTS', '已经有同名分类了')
    }
    const category: MenuCategory = {
      id: `demo-category-${Date.now()}-${this.nextCategoryId++}`,
      name: normalized,
      isSystem: false,
      sortOrder: 100 + this.categories.length * 10,
    }
    this.categories.push(category)
    return { ...category }
  }

  async updateCategory(id: string, name: string): Promise<MenuCategory> {
    const category = this.categories.find((item) => item.id === id)
    if (!category) throw new MenuGatewayError('CATEGORY_NOT_FOUND', '这个分类已经不存在')
    if (category.isSystem) {
      throw new MenuGatewayError('CATEGORY_SYSTEM', '默认分类不能修改')
    }
    const normalized = name.trim()
    if (!normalized) throw new MenuGatewayError('VALIDATION_FAILED', '先写下分类名称')
    if (this.categories.some((item) => item.id !== id && item.name === normalized)) {
      throw new MenuGatewayError('CATEGORY_EXISTS', '已经有同名分类了')
    }
    category.name = normalized
    return { ...category }
  }

  async removeCategory(id: string): Promise<void> {
    const index = this.categories.findIndex((item) => item.id === id)
    if (index < 0) throw new MenuGatewayError('CATEGORY_NOT_FOUND', '这个分类已经不存在')
    if (this.categories[index]?.isSystem) {
      throw new MenuGatewayError('CATEGORY_SYSTEM', '默认分类不能删除')
    }
    this.categories.splice(index, 1)
    for (const recipe of listDemoMenuRecipes()) {
      if (recipe.categoryId === id) {
        updateDemoMenuRecipe(recipe.id, { ...recipe, categoryId: '' })
      }
    }
  }

  async create(input: MenuWriteInput): Promise<MenuRecipe> {
    this.assertCategory(input.categoryId)
    const created = addDemoMenuRecipe(toDemoInput(input))
    this.versions.set(created.id, 1)
    this.mediaIds.set(created.id, input.imageMediaId.trim())
    this.noteMediaIds.set(created.id, [...input.noteImageMediaIds])
    return this.toRecipe(created)
  }

  async update(
    id: string,
    input: MenuWriteInput,
    currentVersion: number,
  ): Promise<MenuRecipe> {
    this.assertVersion(id, currentVersion)
    this.assertCategory(input.categoryId)
    try {
      const updated = updateDemoMenuRecipe(id, toDemoInput(input))
      this.mediaIds.set(id, input.imageMediaId.trim())
      this.noteMediaIds.set(id, [...input.noteImageMediaIds])
      this.bumpVersion(id)
      return this.toRecipe(updated)
    } catch (error) {
      throw demoError(error)
    }
  }

  async remove(id: string, currentVersion: number): Promise<void> {
    this.assertVersion(id, currentVersion)
    if (!removeDemoMenuRecipe(id)) {
      throw new MenuGatewayError('NOT_FOUND', '这份菜单已经不存在')
    }
    this.versions.delete(id)
    this.mediaIds.delete(id)
    this.noteMediaIds.delete(id)
  }

  async setServings(
    id: string,
    servings: number,
    currentVersion: number,
  ): Promise<MenuRecipe> {
    this.assertVersion(id, currentVersion)
    try {
      const updated = updateDemoMenuServings(id, servings)
      this.bumpVersion(id)
      return this.toRecipe(updated)
    } catch (error) {
      throw demoError(error)
    }
  }

  async setIngredientReady(
    id: string,
    ingredientId: string,
    ready: boolean,
    currentVersion: number,
  ): Promise<MenuRecipe> {
    this.assertVersion(id, currentVersion)
    try {
      const updated = updateDemoMenuIngredientReady(id, ingredientId, ready)
      this.bumpVersion(id)
      return this.toRecipe(updated)
    } catch (error) {
      throw demoError(error)
    }
  }

  private async toRecipe(recipe: DemoMenuRecipe): Promise<MenuRecipe> {
    const imageMediaId = this.mediaIds.get(recipe.id) ?? recipe.image?.mediaId ?? ''
    const category = this.categories.find((item) => item.id === recipe.categoryId)
    const noteImageMediaIds = this.noteMediaIds.get(recipe.id) ?? recipe.noteImageMediaIds ?? []
    let image = recipe.image
    if (imageMediaId) {
      try {
        const asset = await mediaGateway.get(imageMediaId)
        image = {
          mediaId: imageMediaId,
          src: asset.display.url,
          ...(recipe.image?.caption ? { caption: recipe.image.caption } : {}),
        }
      } catch {
        // 图片签名失败不能让整份菜单不可用，文字和步骤仍然要能打开。
        image = recipe.image
      }
    }
    const noteImages = (await Promise.all(noteImageMediaIds.map(async (mediaId) => {
      try {
        const asset = await mediaGateway.get(mediaId)
        return { mediaId, src: asset.display.url }
      } catch {
        return null
      }
    }))).filter((item): item is NonNullable<typeof item> => item !== null)
    return {
      ...recipe,
      categoryId: recipe.categoryId ?? '',
      categoryName: category?.name ?? '',
      noteImageMediaIds: [...noteImageMediaIds],
      noteImages,
      ...(image ? { image } : {}),
      version: this.versions.get(recipe.id) ?? 1,
      createdBy: '',
      imageMediaId,
    }
  }

  private assertCategory(categoryId: string): void {
    const value = categoryId.trim()
    if (value && !this.categories.some((item) => item.id === value)) {
      throw new MenuGatewayError('CATEGORY_NOT_FOUND', '这个分类已经不存在')
    }
  }

  private assertVersion(id: string, currentVersion: number): void {
    const actual = this.versions.get(id) ?? 1
    if (actual !== currentVersion) {
      throw new MenuGatewayError('VERSION_CONFLICT', '菜单已在别处更新，请刷新后再试')
    }
  }

  private bumpVersion(id: string): void {
    this.versions.set(id, (this.versions.get(id) ?? 1) + 1)
  }
}

function toDemoInput(input: MenuWriteInput) {
  return {
    title: input.title,
    description: input.description,
    categoryId: input.categoryId,
    servings: input.servings,
    cookingMinutes: input.cookingMinutes,
    ingredients: input.ingredients.map((item) => ({
      name: item.name,
      amount: item.amount,
      source: item.source,
    })),
    steps: input.steps.map((item) => ({
      title: item.title,
      description: item.description,
    })),
  }
}

function demoError(error: unknown): MenuGatewayError {
  if (error instanceof MenuGatewayError) return error
  return new MenuGatewayError(
    'UNKNOWN_ERROR',
    error instanceof Error ? error.message : '菜单操作没有完成',
  )
}
