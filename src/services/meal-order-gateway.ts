import type { ApiMealType } from '../types/api'

export type MealOrderStatus =
  | 'pending'
  | 'preparing'
  | 'ready'
  | 'done'
  | 'cancelled'

export interface MealOrderIngredient {
  id: string
  name: string
  amount: string
  source: string
  ready: boolean
}

export interface MealOrderItem {
  id: string
  recipeId: string
  recipeTitle: string
  servings: number
  ingredients: MealOrderIngredient[]
}

export interface MealOrder {
  id: string
  spaceId: string
  orderDate: string
  mealType: ApiMealType
  status: MealOrderStatus
  note: string
  version: number
  createdBy: string
  createdByName: string
  items: MealOrderItem[]
  completedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface MealOrderItemWriteInput {
  recipeId: string
  servings: number
}

export interface MealOrderWriteInput {
  orderDate: string
  mealType: ApiMealType
  note: string
  items: MealOrderItemWriteInput[]
}

export interface MealOrderListFilters {
  status?: MealOrderStatus
  date?: string
}

export interface MealOrderGateway {
  list(filters?: MealOrderListFilters): Promise<MealOrder[]>
  create(input: MealOrderWriteInput): Promise<MealOrder>
  setStatus(
    id: string,
    status: MealOrderStatus,
    currentVersion: number,
  ): Promise<MealOrder>
  setIngredientReady(
    id: string,
    ingredientId: string,
    ready: boolean,
    currentVersion: number,
  ): Promise<MealOrder>
}

export class MealOrderGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'MealOrderGatewayError'
  }
}

export function isMealOrderVersionConflict(error: unknown): boolean {
  return error instanceof MealOrderGatewayError && error.code === 'VERSION_CONFLICT'
}

export function getMealOrderErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof MealOrderGatewayError)) return fallback
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已失效，请重新登录'
    case 'NO_ACTIVE_SPACE':
      return '还没有可用的共同空间'
    case 'VERSION_CONFLICT':
      return '点菜单已在别处更新，请刷新后再试'
    case 'MEAL_ORDER_STATUS_INVALID':
      return '当前状态下不能这样流转'
    case 'MEAL_ORDER_NOT_FOUND':
    case 'NOT_FOUND':
      return '这张点菜单已经不存在'
    case 'MEAL_ORDER_INGREDIENT_NOT_FOUND':
      return '这项食材已经不存在'
    case 'NETWORK_ERROR':
      return '网络不太稳定，请稍后再试'
    case 'VALIDATION_FAILED':
      return error.message || '点菜内容还需要检查一下'
    default:
      return error.message || fallback
  }
}
