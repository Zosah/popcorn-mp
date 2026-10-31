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
  type MenuGateway,
  type MenuListFilters,
  type MenuRecipe,
  type MenuWriteInput,
} from './menu-gateway'

export class DemoMenuGateway implements MenuGateway {
  private readonly versions = new Map<string, number>()
  private readonly mediaIds = new Map<string, string>()

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

  async create(input: MenuWriteInput): Promise<MenuRecipe> {
    const created = addDemoMenuRecipe(toDemoInput(input))
    this.versions.set(created.id, 1)
    this.mediaIds.set(created.id, input.imageMediaId.trim())
    return this.toRecipe(created)
  }

  async update(
    id: string,
    input: MenuWriteInput,
    currentVersion: number,
  ): Promise<MenuRecipe> {
    this.assertVersion(id, currentVersion)
    try {
      const updated = updateDemoMenuRecipe(id, toDemoInput(input))
      this.mediaIds.set(id, input.imageMediaId.trim())
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
    return {
      ...recipe,
      ...(image ? { image } : {}),
      version: this.versions.get(recipe.id) ?? 1,
      createdBy: '',
      imageMediaId,
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
