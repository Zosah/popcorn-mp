import type { DemoMenuRecipe } from '../../domain/demo-menu'
import {
  getDemoMenuRecipe,
  removeDemoMenuRecipe,
  updateDemoMenuIngredientReady,
  updateDemoMenuServings,
} from '../../services/demo-menu'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    id: '',
    recipe: null as DemoMenuRecipe | null,
    readyCount: 0,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id ?? '' })
  },

  onShow() {
    if (this.data.id) this.loadRecipe()
  },

  loadRecipe() {
    const recipe = getDemoMenuRecipe(this.data.id)
    if (!recipe) {
      wx.showToast({ title: '这份菜单不存在', icon: 'none' })
      navigateBackOrTab('/pages/home/index')
      return
    }
    this.setData({
      recipe,
      readyCount: recipe.ingredients.filter((item) => item.ready).length,
    })
    wx.setNavigationBarTitle({ title: recipe.title })
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onChangeServings(event: { currentTarget: { dataset: { delta: string } } }) {
    const recipe = this.data.recipe
    if (!recipe) return
    const delta = Number(event.currentTarget.dataset.delta)
    const servings = Math.min(12, Math.max(1, recipe.servings + delta))
    if (servings === recipe.servings) return
    const updated = updateDemoMenuServings(recipe.id, servings)
    this.setData({ recipe: updated })
  },

  onToggleIngredient(event: { currentTarget: { dataset: { id?: string } } }) {
    const recipe = this.data.recipe
    const ingredientId = event.currentTarget.dataset.id
    if (!recipe || !ingredientId) return
    const ingredient = recipe.ingredients.find((item) => item.id === ingredientId)
    if (!ingredient) return
    const updated = updateDemoMenuIngredientReady(
      recipe.id,
      ingredientId,
      !ingredient.ready,
    )
    this.setData({
      recipe: updated,
      readyCount: updated.ingredients.filter((item) => item.ready).length,
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
    if (!recipe) return
    wx.showModal({
      title: '删除这份菜单？',
      content: '菜品、食材和步骤都会从本机 Demo 中移除。',
      confirmText: '删除',
      confirmColor: '#e8695c',
      success: (result) => {
        if (!result.confirm) return
        if (!removeDemoMenuRecipe(recipe.id)) {
          wx.showToast({ title: '这份菜单不存在', icon: 'none' })
          return
        }
        wx.showToast({ title: '菜单已删除', icon: 'success' })
        navigateBackOrTab('/pages/home/index')
      },
    })
  },

  onStartCooking() {
    const recipe = this.data.recipe
    if (!recipe) return
    const missingCount = recipe.ingredients.filter((item) => !item.ready).length
    wx.showModal({
      title: missingCount > 0 ? '还有食材没准备好' : '可以开火啦',
      content:
        missingCount > 0
          ? `还有 ${missingCount} 样食材待准备。准备齐后，再按步骤慢慢来。`
          : '食材已经齐了。当前 Demo 会停在准备完成态，分步计时将在后续版本加入。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
