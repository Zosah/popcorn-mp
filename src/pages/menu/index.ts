import { appConfig } from '../../config/env'
import { hydrateAuthState } from '../../services/auth'
import { promptAuthGateIfNeeded, requireAuthForWrite } from '../../services/auth-preview'
import { mealOrderGateway } from '../../services/meal-order'
import {
  getMealOrderErrorMessage,
  isMealOrderVersionConflict,
  type MealOrder,
  type MealOrderStatus,
} from '../../services/meal-order-gateway'
import { menuGateway } from '../../services/menu'
import {
  getMenuErrorMessage,
  type MenuCategory,
  type MenuRecipe,
} from '../../services/menu-gateway'
import { readStoredApiSession } from '../../stores/session'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

type MenuTab = 'eat' | 'recipes'
type MealChoice = 'breakfast' | 'lunch' | 'dinner' | 'snack'

interface StoredCartItem {
  recipeId: string
  servings: number
}

interface CartItem {
  id: string
  recipe: MenuRecipe
  servings: number
}

interface OrderView extends MealOrder {
  statusLabel: string
  actionLabel: string
  nextStatus: MealOrderStatus | ''
  readyIngredientCount: number
  ingredientCount: number
  mealLabel: string
  dateLabel: string
  timeLabel: string
  itemSummary: string
  creatorInitial: string
}

interface CategoryTab {
  id: string
  name: string
  count: number
}

const menuRequestGate = createRequestGate()
const HISTORY_LIMIT = 5

const MEAL_LABELS: Record<MealChoice, string> = {
  breakfast: '早餐',
  lunch: '午餐',
  dinner: '晚餐',
  snack: '加餐',
}

Page({
  data: {
    allRecipes: [] as MenuRecipe[],
    categories: [] as MenuCategory[],
    categoryTabs: [] as CategoryTab[],
    selectedCategoryId: 'all',
    categoryRecipes: [] as MenuRecipe[],
    activeTab: 'eat' as MenuTab,
    activeOrders: [] as OrderView[],
    historyOrders: [] as OrderView[],
    visibleHistoryOrders: [] as OrderView[],
    hasMoreHistory: false,
    showAllHistory: false,
    loading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    loadError: '',
    cartItems: [] as CartItem[],
    cartCount: 0,
    cartPanelOpen: false,
    mealType: 'dinner' as MealChoice,
    mealNote: '',
    submittingOrder: false,
    orderActionId: '',
    ingredientActionId: '',
    historyDetailOrder: null as OrderView | null,
  },

  onLoad() {
    const cached = readStoredPage()
    if (cached) {
      this.setData({
        ...cached,
        loading: false,
        hasLoaded: true,
        cacheFresh: true,
        hasShown: false,
        cartPanelOpen: false,
      })
      this.syncCartFromRecipes(this.data.allRecipes)
    }
  },

  onShow() {
    promptAuthGateIfNeeded()
    const firstShow = !this.data.hasShown
    if (firstShow) this.setData({ hasShown: true })
    if (firstShow && this.data.cacheFresh) return
    void this.refresh()
  },

  onPullDownRefresh() {
    void this.refresh(true)
  },

  onUnload() {
    menuRequestGate.invalidate()
  },

  async refresh(fromPullDown = false) {
    const sequence = menuRequestGate.begin()
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    const auth = await hydrateAuthState()
    if (!menuRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    if (!appConfig.demoMode && !auth.isLoggedIn) {
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.setData({
        allRecipes: [],
        categories: [],
        categoryTabs: [],
        categoryRecipes: [],
        activeOrders: [],
        historyOrders: [],
        visibleHistoryOrders: [],
        hasMoreHistory: false,
        historyDetailOrder: null,
        loading: false,
        hasLoaded: true,
        cacheFresh: false,
        loadError: '',
      })
      if (fromPullDown) wx.stopPullDownRefresh()
      promptAuthGateIfNeeded()
      return
    }

    const hasExistingData = this.data.allRecipes.length > 0 || this.data.activeOrders.length > 0
    this.setData({ loading: !hasExistingData, loadError: '' })
    try {
      const [recipes, categories, orders] = await Promise.all([
        menuGateway.list(),
        menuGateway.listCategories(),
        mealOrderGateway.list(),
      ])
      if (!menuRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!menuRequestGate.isCurrent(sequence)) return
      this.applyLoadedData(recipes, categories, orders)
    } catch (error) {
      if (!menuRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!menuRequestGate.isCurrent(sequence)) return
      const message = getMenuErrorMessage(error, '下厨内容暂时没有加载出来')
      if (hasExistingData) {
        this.setData({ loading: false })
        wx.showToast({ title: message, icon: 'none' })
        return
      }
      this.setData({ loading: false, hasLoaded: true, loadError: message })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  applyLoadedData(
    recipes: MenuRecipe[],
    categories: MenuCategory[],
    orders: MealOrder[],
  ) {
    const categoryTabs = buildCategoryTabs(recipes, categories)
    const selectedCategoryId = categoryTabs.some((item) => item.id === this.data.selectedCategoryId)
      ? this.data.selectedCategoryId
      : 'all'
    const activeOrders = orders.filter(isActiveOrder).map(toOrderView)
    const historyOrders = orders.filter((order) => !isActiveOrder(order)).map(toOrderView)
    this.setData({
      allRecipes: recipes,
      categories,
      categoryTabs,
      selectedCategoryId,
      categoryRecipes: recipesForCategory(recipes, selectedCategoryId),
      activeOrders,
      historyOrders,
      visibleHistoryOrders: historyOrders.slice(0, this.data.showAllHistory ? historyOrders.length : HISTORY_LIMIT),
      hasMoreHistory: historyOrders.length > HISTORY_LIMIT,
      loading: false,
      hasLoaded: true,
      cacheFresh: true,
      loadError: '',
    }, () => {
      this.syncCartFromRecipes(recipes)
      this.cacheCurrentPage()
    })
  },

  cacheCurrentPage() {
    const {
      loading: _loading,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      cartPanelOpen: _cartPanelOpen,
      orderActionId: _orderActionId,
      ingredientActionId: _ingredientActionId,
      submittingOrder: _submittingOrder,
      historyDetailOrder: _historyDetailOrder,
      ...snapshot
    } = this.data as unknown as Record<string, unknown>
    wx.setStorageSync(menuPageCacheKey(), snapshot)
  },

  onRetryLoad() {
    void this.refresh()
  },

  onSwitchTab(event: { currentTarget: { dataset: { value?: MenuTab } } }) {
    const value = event.currentTarget.dataset.value
    if (!value || value === this.data.activeTab) return
    this.setData({ activeTab: value, cartPanelOpen: false, historyDetailOrder: null })
    if (value === 'eat') void this.refreshOrders()
  },

  onSelectCategory(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id || id === this.data.selectedCategoryId) return
    this.setData({
      selectedCategoryId: id,
      categoryRecipes: recipesForCategory(this.data.allRecipes, id),
    }, () => this.cacheCurrentPage())
  },

  async refreshOrders() {
    try {
      const orders = await mealOrderGateway.list()
      const activeOrders = orders.filter(isActiveOrder).map(toOrderView)
      const historyOrders = orders.filter((order) => !isActiveOrder(order)).map(toOrderView)
      this.setData({
        activeOrders,
        historyOrders,
        visibleHistoryOrders: historyOrders.slice(0, this.data.showAllHistory ? historyOrders.length : HISTORY_LIMIT),
        hasMoreHistory: historyOrders.length > HISTORY_LIMIT,
      }, () => this.cacheCurrentPage())
    } catch (error) {
      wx.showToast({
        title: getMealOrderErrorMessage(error, '点菜单暂时没有刷新出来'),
        icon: 'none',
      })
    }
  },

  onStopTap() {},

  onOpenRecipe(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/menu-detail/index?id=${encodeURIComponent(id)}` })
  },

  onAddToCart(event: { currentTarget: { dataset: { id?: string } } }) {
    if (!requireAuthForWrite()) return
    const recipe = this.data.allRecipes.find((item) => item.id === event.currentTarget.dataset.id)
    if (!recipe) return
    const current = this.data.cartItems.find((item) => item.recipe.id === recipe.id)
    const cartItems = current
      ? this.data.cartItems.map((item) =>
          item.recipe.id === recipe.id
            ? { ...item, servings: Math.min(12, item.servings + 1) }
            : item,
        )
      : [...this.data.cartItems, { id: recipe.id, recipe, servings: recipe.servings }]
    this.setData({ cartItems, cartCount: cartItems.length })
    this.persistCart(cartItems)
    wx.showToast({
      title: current ? '份数已经加一' : '已放进待提交',
      icon: 'none',
    })
  },

  onOpenCart() {
    if (!this.data.cartItems.length) {
      wx.showToast({ title: '先从菜谱本点几道菜', icon: 'none' })
      return
    }
    this.setData({ cartPanelOpen: true })
  },

  onCloseCart() {
    if (this.data.submittingOrder) return
    this.setData({ cartPanelOpen: false })
  },

  onClearCart() {
    if (this.data.submittingOrder || !this.data.cartItems.length) return
    wx.showModal({
      title: '删除这一桌？',
      content: '已经选的菜会从待提交里移除，不会影响菜谱本。',
      confirmText: '删除',
      confirmColor: '#a8564e',
      cancelText: '再想想',
      success: (result) => {
        if (!result.confirm) return
        this.clearCart()
        this.setData({ cartPanelOpen: false, mealNote: '' })
        wx.showToast({ title: '这一桌已经清空', icon: 'none' })
      },
    })
  },

  onCartStep(event: {
    currentTarget: { dataset: { id?: string; delta?: string } }
  }) {
    const id = event.currentTarget.dataset.id
    const delta = Number(event.currentTarget.dataset.delta)
    if (!id || !Number.isFinite(delta)) return
    const cartItems = this.data.cartItems
      .map((item) =>
        item.recipe.id === id
          ? { ...item, servings: Math.min(12, Math.max(1, item.servings + delta)) }
          : item,
      )
    this.setData({ cartItems })
    this.persistCart(cartItems)
  },

  onRemoveCartItem(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    const cartItems = this.data.cartItems.filter((item) => item.recipe.id !== id)
    this.setData({
      cartItems,
      cartCount: cartItems.length,
      ...(cartItems.length ? {} : { cartPanelOpen: false }),
    })
    this.persistCart(cartItems)
  },

  onMealTypeSelect(event: { currentTarget: { dataset: { value?: MealChoice } } }) {
    const value = event.currentTarget.dataset.value
    if (value) this.setData({ mealType: value })
  },

  onMealNoteInput(event: { detail: { value: string } }) {
    this.setData({ mealNote: event.detail.value })
  },

  async onSubmitOrder() {
    if (this.data.submittingOrder || !this.data.cartItems.length) return
    if (!requireAuthForWrite()) return
    this.setData({ submittingOrder: true })
    try {
      await mealOrderGateway.create({
        orderDate: todayString(),
        mealType: this.data.mealType,
        note: this.data.mealNote,
        items: this.data.cartItems.map((item) => ({
          recipeId: item.recipe.id,
          servings: item.servings,
        })),
      })
      this.clearCart()
      this.setData({
        cartPanelOpen: false,
        activeTab: 'eat',
        mealNote: '',
      })
      await this.refreshOrders()
      wx.showToast({ title: '已经交给厨房', icon: 'success' })
    } catch (error) {
      wx.showToast({
        title: getMealOrderErrorMessage(error, '点菜没有提交成功'),
        icon: 'none',
      })
    } finally {
      this.setData({ submittingOrder: false })
    }
  },

  async onToggleIngredient(event: {
    currentTarget: { dataset: { orderId?: string; ingredientId?: string; ready?: string } }
  }) {
    const orderId = event.currentTarget.dataset.orderId
    const ingredientId = event.currentTarget.dataset.ingredientId
    const ready = event.currentTarget.dataset.ready !== 'true'
    if (!orderId || !ingredientId || this.data.ingredientActionId) return
    const order = this.data.activeOrders.find((item) => item.id === orderId)
    if (!order) return
    this.setData({ ingredientActionId: ingredientId })
    try {
      const updated = await mealOrderGateway.setIngredientReady(
        order.id,
        ingredientId,
        ready,
        order.version,
      )
      this.replaceOrder(updated)
    } catch (error) {
      if (isMealOrderVersionConflict(error)) {
        await this.refreshOrders()
      }
      wx.showToast({
        title: getMealOrderErrorMessage(error, '备菜状态没有更新'),
        icon: 'none',
      })
    } finally {
      this.setData({ ingredientActionId: '' })
    }
  },

  async onAdvanceOrder(event: {
    currentTarget: { dataset: { id?: string; status?: MealOrderStatus } }
  }) {
    const id = event.currentTarget.dataset.id
    const status = event.currentTarget.dataset.status
    if (!id || !status || this.data.orderActionId) return
    const order = this.data.activeOrders.find((item) => item.id === id)
    if (!order) return
    this.setData({ orderActionId: id })
    try {
      const updated = await mealOrderGateway.setStatus(id, status, order.version)
      this.replaceOrder(updated)
      if (status === 'done') {
        wx.showToast({ title: '这一餐已经归档', icon: 'success' })
      }
    } catch (error) {
      if (isMealOrderVersionConflict(error)) {
        await this.refreshOrders()
      }
      wx.showToast({
        title: getMealOrderErrorMessage(error, '这张点菜单暂时不能流转'),
        icon: 'none',
      })
    } finally {
      this.setData({ orderActionId: '' })
    }
  },

  replaceOrder(order: MealOrder) {
    const view = toOrderView(order)
    const activeOrders = isActiveOrder(order)
      ? replaceOrPrepend(this.data.activeOrders, view)
      : this.data.activeOrders.filter((item) => item.id !== order.id)
    const historyOrders = isActiveOrder(order)
      ? this.data.historyOrders.filter((item) => item.id !== order.id)
      : replaceOrPrepend(this.data.historyOrders, view)
    this.setData({
      activeOrders,
      historyOrders,
      visibleHistoryOrders: historyOrders.slice(0, this.data.showAllHistory ? historyOrders.length : HISTORY_LIMIT),
      hasMoreHistory: historyOrders.length > HISTORY_LIMIT,
    }, () => this.cacheCurrentPage())
  },

  onToggleHistory() {
    const showAllHistory = !this.data.showAllHistory
    this.setData({
      showAllHistory,
      visibleHistoryOrders: this.data.historyOrders.slice(0, showAllHistory ? this.data.historyOrders.length : HISTORY_LIMIT),
    }, () => this.cacheCurrentPage())
  },

  onOpenOrderDetail(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    const order = this.data.historyOrders.find((item) => item.id === id)
    if (order) this.setData({ historyDetailOrder: order })
  },

  onCloseOrderDetail() {
    this.setData({ historyDetailOrder: null })
  },

  onCreate() {
    if (!requireAuthForWrite()) return
    const categoryId = this.data.selectedCategoryId === 'all' || this.data.selectedCategoryId === 'uncategorized'
      ? ''
      : this.data.selectedCategoryId
    const query = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : ''
    wx.navigateTo({ url: `/pages/menu-form/index${query}` })
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  syncCartFromRecipes(recipes: MenuRecipe[]) {
    const stored = readStoredCart()
    const cartItems = stored.flatMap((entry) => {
      const recipe = recipes.find((item) => item.id === entry.recipeId)
      return recipe
        ? [{ id: recipe.id, recipe, servings: Math.min(12, Math.max(1, entry.servings)) }]
        : []
    })
    this.setData({ cartItems, cartCount: cartItems.length })
    this.persistCart(cartItems)
  },

  persistCart(cartItems: CartItem[]) {
    wx.setStorageSync(cartStorageKey(), cartItems.map((item) => ({
      recipeId: item.recipe.id,
      servings: item.servings,
    })))
  },

  clearCart() {
    this.setData({ cartItems: [], cartCount: 0 })
    wx.removeStorageSync(cartStorageKey())
  },
})

function recipesForCategory(recipes: MenuRecipe[], categoryId: string): MenuRecipe[] {
  if (categoryId === 'all') return recipes
  if (categoryId === 'uncategorized') return recipes.filter((item) => !item.categoryId)
  return recipes.filter((item) => item.categoryId === categoryId)
}

function buildCategoryTabs(
  recipes: MenuRecipe[],
  categories: MenuCategory[],
): CategoryTab[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]))
  const tabs: CategoryTab[] = [
    { id: 'all', name: '全部', count: recipes.length },
  ]
  categories.forEach((category) => {
    const count = recipes.filter((recipe) => recipe.categoryId === category.id).length
    if (count > 0) tabs.push({ id: category.id, name: category.name, count })
  })
  recipes.forEach((recipe) => {
    if (!recipe.categoryId || categoryById.has(recipe.categoryId)) return
    const existing = tabs.find((tab) => tab.id === recipe.categoryId)
    if (existing) {
      existing.count += 1
      return
    }
    tabs.push({
      id: recipe.categoryId,
      name: recipe.categoryName || '其他',
      count: 1,
    })
  })
  tabs.push({
    id: 'uncategorized',
    name: '未分组',
    count: recipes.filter((recipe) => !recipe.categoryId).length,
  })
  return tabs
}

function toOrderView(order: MealOrder): OrderView {
  const ingredients = order.items.flatMap((item) => item.ingredients)
  const action = orderAction(order.status)
  return {
    ...order,
    statusLabel: orderStatusLabel(order.status),
    actionLabel: action.label,
    nextStatus: action.nextStatus,
    readyIngredientCount: ingredients.filter((item) => item.ready).length,
    ingredientCount: ingredients.length,
    mealLabel: MEAL_LABELS[order.mealType],
    dateLabel: dateLabel(order.orderDate),
    timeLabel: formatTime(order.createdAt),
    itemSummary: order.items.map((item) => item.recipeTitle).join('、'),
    creatorInitial: Array.from(order.createdByName || '家')[0] || '家',
  }
}

function orderAction(status: MealOrderStatus): {
  label: string
  nextStatus: MealOrderStatus | ''
} {
  switch (status) {
    case 'pending':
      return { label: '开始备菜', nextStatus: 'preparing' }
    case 'preparing':
      return { label: '已经备齐', nextStatus: 'ready' }
    case 'ready':
      return { label: '吃完了', nextStatus: 'done' }
    default:
      return { label: '', nextStatus: '' }
  }
}

function orderStatusLabel(status: MealOrderStatus): string {
  switch (status) {
    case 'pending':
      return '等人开火'
    case 'preparing':
      return '正在备菜'
    case 'ready':
      return '可以开饭'
    case 'done':
      return '已吃完'
    case 'cancelled':
      return '已取消'
    default:
      return ''
  }
}

function isActiveOrder(order: MealOrder): boolean {
  return order.status === 'pending' || order.status === 'preparing' || order.status === 'ready'
}

function replaceOrPrepend<T extends { id: string }>(items: T[], next: T): T[] {
  const exists = items.some((item) => item.id === next.id)
  return exists
    ? items.map((item) => (item.id === next.id ? next : item))
    : [next, ...items]
}

function dateLabel(value: string): string {
  const target = new Date(`${value}T00:00:00`)
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const diff = Math.round((start.getTime() - target.getTime()) / 86400000)
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  return `${target.getMonth() + 1} 月 ${target.getDate()} 日`
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

function todayString(): string {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function readStoredPage(): Record<string, unknown> | null {
  const value = wx.getStorageSync<Record<string, unknown> | ''>(menuPageCacheKey())
  return value && typeof value === 'object' ? value : null
}

function menuPageCacheKey(): string {
  const spaceId = readStoredApiSession()?.session.activeSpaceId || 'demo'
  return `menu:overview:v5:${spaceId}`
}

function cartStorageKey(): string {
  const spaceId = readStoredApiSession()?.session.activeSpaceId || 'demo'
  return `popcorn_menu_cart_v1:${spaceId}`
}

function readStoredCart(): StoredCartItem[] {
  const value = wx.getStorageSync<StoredCartItem[] | ''>(cartStorageKey())
  if (!Array.isArray(value)) return []
  return value.filter((item) =>
    item &&
    typeof item.recipeId === 'string' &&
    Number.isFinite(item.servings),
  )
}
