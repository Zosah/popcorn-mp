import type { DemoMenuRecipe } from '../domain/demo-menu'

export interface MenuListFilters {
  query?: string
  maxMinutes?: number
}

export interface MenuIngredientWriteInput {
  id?: string
  name: string
  amount: string
  source: string
}

export interface MenuStepWriteInput {
  id?: string
  title: string
  description: string
}

export interface MenuWriteInput {
  title: string
  description: string
  servings: number
  cookingMinutes: number
  ingredients: MenuIngredientWriteInput[]
  steps: MenuStepWriteInput[]
  /** 空字符串会清空图片；页面编辑时会显式回传当前值。 */
  imageMediaId: string
}

/** HTTP 模式额外携带乐观锁版本；Demo 模式保持相同形状供页面复用。 */
export interface MenuRecipe extends DemoMenuRecipe {
  version: number
  createdBy: string
  imageMediaId: string
}

export interface MenuGateway {
  list(filters?: MenuListFilters): Promise<MenuRecipe[]>
  get(id: string): Promise<MenuRecipe | null>
  create(input: MenuWriteInput): Promise<MenuRecipe>
  update(
    id: string,
    input: MenuWriteInput,
    currentVersion: number,
  ): Promise<MenuRecipe>
  remove(id: string, currentVersion: number): Promise<void>
  setServings(
    id: string,
    servings: number,
    currentVersion: number,
  ): Promise<MenuRecipe>
  setIngredientReady(
    id: string,
    ingredientId: string,
    ready: boolean,
    currentVersion: number,
  ): Promise<MenuRecipe>
}

export class MenuGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MenuGatewayError'
  }
}

export function isMenuVersionConflict(error: unknown): boolean {
  return error instanceof MenuGatewayError && error.code === 'VERSION_CONFLICT'
}

export function isMenuNotFound(error: unknown): boolean {
  return error instanceof MenuGatewayError && error.code === 'NOT_FOUND'
}

export function getMenuErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof MenuGatewayError)) return fallback
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已失效，请重新登录'
    case 'NO_ACTIVE_SPACE':
      return '还没有可用的共同空间'
    case 'VERSION_CONFLICT':
      return '菜单已在别处更新，请刷新后再试'
    case 'NETWORK_ERROR':
      return '网络不太稳定，请稍后再试'
    case 'NOT_FOUND':
      return '这份菜单已经不存在'
    case 'MEDIA_NOT_FOUND':
      return '这张图片已经失效，请重新上传'
    case 'VALIDATION_FAILED':
      return error.message || '菜单内容还需要检查一下'
    default:
      return error.message || fallback
  }
}
