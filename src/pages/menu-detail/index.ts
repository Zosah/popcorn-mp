import { menuGateway } from '../../services/menu'
import {
  getMenuErrorMessage,
  isMenuVersionConflict,
  type MenuRecipe,
} from '../../services/menu-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { createRequestGate } from '../../utils/request-control'

const detailRequestGate = createRequestGate()

Page({
  data: {
    id: '',
    recipe: null as MenuRecipe | null,
    readyCount: 0,
    loading: true,
    loadError: '',
    mutating: false,
    activeIngredientId: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id ?? '' })
  },

  onShow() {
    if (this.data.id) void this.loadRecipe()
  },

  async loadRecipe() {
    const sequence = detailRequestGate.begin()
    this.setData({
      loading: !this.data.recipe,
      loadError: '',
    })
    try {
      const recipe = await menuGateway.get(this.data.id)
      if (!detailRequestGate.isCurrent(sequence)) return
      if (!recipe) {
        wx.showToast({ title: '这份菜单不存在', icon: 'none' })
        navigateBackOrTab('/pages/home/index')
        return
      }
      this.setData({
        recipe,
        readyCount: recipe.ingredients.filter((item) => item.ready).length,
        loading: false,
        loadError: '',
      })
      wx.setNavigationBarTitle({ title: recipe.title })
    } catch (error) {
      if (!detailRequestGate.isCurrent(sequence)) return
      const message = getMenuErrorMessage(error, '这份菜单暂时没有加载出来')
      this.setData({
        loading: false,
        loadError: message,
      })
      if (this.data.recipe) {
        wx.showToast({ title: message, icon: 'none' })
      }
    }
  },

  onRetryLoad() {
    void this.loadRecipe()
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  async onChangeServings(event: { currentTarget: { dataset: { delta: string } } }) {
    const recipe = this.data.recipe
    if (!recipe || this.data.mutating) return
    const delta = Number(event.currentTarget.dataset.delta)
    const servings = Math.min(12, Math.max(1, recipe.servings + delta))
    if (servings === recipe.servings) return
    this.setData({ mutating: true })
    detailRequestGate.invalidate()
    try {
      const updated = await menuGateway.setServings(recipe.id, servings, recipe.version)
      this.applyRecipe(updated)
    } catch (error) {
      await this.handleWriteError(error)
    } finally {
      this.setData({ mutating: false })
    }
  },

  async onToggleIngredient(event: { currentTarget: { dataset: { id?: string } } }) {
    const recipe = this.data.recipe
    const ingredientId = event.currentTarget.dataset.id
    if (!recipe || !ingredientId || this.data.mutating) return
    const ingredient = recipe.ingredients.find((item) => item.id === ingredientId)
    if (!ingredient) return
    this.setData({ mutating: true, activeIngredientId: ingredientId })
    detailRequestGate.invalidate()
    try {
      const updated = await menuGateway.setIngredientReady(
        recipe.id,
        ingredientId,
        !ingredient.ready,
        recipe.version,
      )
      this.applyRecipe(updated)
    } catch (error) {
      await this.handleWriteError(error)
    } finally {
      this.setData({ mutating: false, activeIngredientId: '' })
    }
  },

  applyRecipe(recipe: MenuRecipe) {
    this.setData({
      recipe,
      readyCount: recipe.ingredients.filter((item) => item.ready).length,
    })
  },

  async handleWriteError(error: unknown) {
    if (isMenuVersionConflict(error)) {
      const result = await showModal(
        '菜单已在别处更新',
        '重新载入最新内容后再继续操作。',
        '重新载入',
      )
      if (result) void this.loadRecipe()
      return
    }
    wx.showToast({
      title: getMenuErrorMessage(error, '刚才的操作没有完成'),
      icon: 'none',
    })
  },

  onEdit() {
    if (!this.data.recipe) return
    wx.navigateTo({
      url: `/pages/menu-form/index?id=${encodeURIComponent(this.data.recipe.id)}`,
    })
  },

  onDelete() {
    const recipe = this.data.recipe
    if (!recipe || this.data.mutating) return
    wx.showModal({
      title: '删除这份菜单？',
      content: '菜品、食材和步骤都会移除，之后可以从头再记一次。',
      confirmText: '删除',
      confirmColor: '#e8695c',
      success: (result) => {
        if (!result.confirm) return
        void this.removeRecipe(recipe)
      },
    })
  },

  async removeRecipe(recipe: MenuRecipe) {
    this.setData({ mutating: true })
    detailRequestGate.invalidate()
    try {
      await menuGateway.remove(recipe.id, recipe.version)
      wx.showToast({ title: '菜单已删除', icon: 'success' })
      navigateBackOrTab('/pages/home/index')
    } catch (error) {
      await this.handleWriteError(error)
    } finally {
      this.setData({ mutating: false })
    }
  },

  onStartCooking() {
    const recipe = this.data.recipe
    if (!recipe) return
    wx.navigateTo({
      url: `/pages/menu-cook/index?id=${encodeURIComponent(recipe.id)}`,
    })
  },
})

function showModal(title: string, content: string, confirmText: string): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title,
      content,
      confirmText,
      cancelText: '稍后',
      success: (result) => resolve(result.confirm),
      fail: () => resolve(false),
    })
  })
}
