import { readStoredApiSession } from '../stores/session'
import { getDemoMenuRecipe } from './demo-menu'
import {
  MealOrderGatewayError,
  type MealOrder,
  type MealOrderGateway,
  type MealOrderListFilters,
  type MealOrderStatus,
  type MealOrderWriteInput,
} from './meal-order-gateway'

const STORAGE_KEY = 'popcorn_demo_meal_orders_v1'

const TRANSITIONS: Record<MealOrderStatus, MealOrderStatus[]> = {
  pending: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['done'],
  done: [],
  cancelled: [],
}

export class DemoMealOrderGateway implements MealOrderGateway {
  async list(filters: MealOrderListFilters = {}): Promise<MealOrder[]> {
    return readOrders()
      .filter((order) => !filters.status || order.status === filters.status)
      .filter((order) => !filters.date || order.orderDate === filters.date)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async create(input: MealOrderWriteInput): Promise<MealOrder> {
    if (!input.items.length) {
      throw new MealOrderGatewayError('VALIDATION_FAILED', '至少选择一道菜')
    }
    const now = new Date()
    const timestamp = now.getTime().toString(36)
    const items = input.items.map((entry, itemIndex) => {
      const recipe = getDemoMenuRecipe(entry.recipeId)
      if (!recipe) throw new MealOrderGatewayError('NOT_FOUND', '有一道菜已经不在菜谱本里')
      return {
        id: `f_demo_${timestamp}_${itemIndex}`,
        recipeId: recipe.id,
        recipeTitle: recipe.title,
        servings: entry.servings,
        ingredients: recipe.ingredients.map((ingredient, ingredientIndex) => ({
          id: `x_demo_${timestamp}_${itemIndex}_${ingredientIndex}`,
          name: ingredient.name,
          amount: ingredient.amount,
          source: ingredient.source,
          ready: false,
        })),
      }
    })
    const session = readStoredApiSession()
    const createdAt = now.toISOString()
    const creatorName = session?.session.user.nickname || '我'
    const order: MealOrder = {
      id: `h_demo_${timestamp}`,
      spaceId: session?.session.activeSpaceId || 'demo-space',
      orderDate: input.orderDate,
      mealType: input.mealType,
      status: 'pending',
      note: input.note.trim(),
      version: 1,
      createdBy: session?.session.user.id || 'demo-user',
      createdByName: creatorName,
      createdByAvatarMediaId: session?.session.user.avatarMediaId || '',
      createdByAvatarUrl: '',
      updatedBy: session?.session.user.id || 'demo-user',
      updatedByName: creatorName,
      updatedByAvatarMediaId: session?.session.user.avatarMediaId || '',
      updatedByAvatarUrl: '',
      items,
      completedAt: null,
      createdAt,
      updatedAt: createdAt,
    }
    writeOrders([order, ...readOrders()])
    return order
  }

  async setStatus(
    id: string,
    status: MealOrderStatus,
    currentVersion: number,
  ): Promise<MealOrder> {
    const orders = readOrders()
    const index = orders.findIndex((order) => order.id === id)
    const current = orders[index]
    if (!current) throw new MealOrderGatewayError('MEAL_ORDER_NOT_FOUND', '这张点菜单已经不存在')
    assertVersion(current, currentVersion)
    if (!TRANSITIONS[current.status].includes(status)) {
      throw new MealOrderGatewayError('MEAL_ORDER_STATUS_INVALID', '当前状态下不能这样流转')
    }
    const now = new Date().toISOString()
    const session = readStoredApiSession()
    const actorID = session?.session.user.id || 'demo-user'
    const actorName = session?.session.user.nickname || '我'
    const finishPrep = status === 'ready' || status === 'done'
    const updated: MealOrder = {
      ...current,
      status,
      version: current.version + 1,
      updatedAt: now,
      updatedBy: actorID,
      updatedByName: actorName,
      updatedByAvatarMediaId: session?.session.user.avatarMediaId || '',
      updatedByAvatarUrl: '',
      completedAt: status === 'done' ? now : current.completedAt,
      items: finishPrep
        ? current.items.map((item) => ({
            ...item,
            ingredients: item.ingredients.map((ingredient) => ({ ...ingredient, ready: true })),
          }))
        : current.items,
    }
    orders[index] = updated
    writeOrders(orders)
    return updated
  }

  async setIngredientReady(
    id: string,
    ingredientId: string,
    ready: boolean,
    currentVersion: number,
  ): Promise<MealOrder> {
    const orders = readOrders()
    const index = orders.findIndex((order) => order.id === id)
    const current = orders[index]
    if (!current) throw new MealOrderGatewayError('MEAL_ORDER_NOT_FOUND', '这张点菜单已经不存在')
    assertVersion(current, currentVersion)
    if (current.status === 'done' || current.status === 'cancelled') {
      throw new MealOrderGatewayError('MEAL_ORDER_STATUS_INVALID', '这张点菜单已经结束')
    }
    let found = false
    const session = readStoredApiSession()
    const updated: MealOrder = {
      ...current,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
      updatedBy: session?.session.user.id || 'demo-user',
      updatedByName: session?.session.user.nickname || '我',
      updatedByAvatarMediaId: session?.session.user.avatarMediaId || '',
      updatedByAvatarUrl: '',
      items: current.items.map((item) => ({
        ...item,
        ingredients: item.ingredients.map((ingredient) => {
          if (ingredient.id !== ingredientId) return ingredient
          found = true
          return { ...ingredient, ready }
        }),
      })),
    }
    if (!found) {
      throw new MealOrderGatewayError('MEAL_ORDER_INGREDIENT_NOT_FOUND', '这项食材已经不存在')
    }
    orders[index] = updated
    writeOrders(orders)
    return updated
  }

  async remove(id: string, currentVersion: number): Promise<void> {
    const orders = readOrders()
    const current = orders.find((order) => order.id === id)
    if (!current) throw new MealOrderGatewayError('MEAL_ORDER_NOT_FOUND', '这张点菜单已经不存在')
    assertVersion(current, currentVersion)
    writeOrders(orders.filter((order) => order.id !== id))
  }
}

function assertVersion(order: MealOrder, currentVersion: number): void {
  if (order.version !== currentVersion) {
    throw new MealOrderGatewayError('VERSION_CONFLICT', '点菜单已在别处更新')
  }
}

function readOrders(): MealOrder[] {
  const value = wx.getStorageSync<MealOrder[] | ''>(STORAGE_KEY)
  if (!Array.isArray(value)) return []
  return value.filter((item) => item && typeof item.id === 'string')
}

function writeOrders(items: MealOrder[]): void {
  wx.setStorageSync(STORAGE_KEY, items)
}
