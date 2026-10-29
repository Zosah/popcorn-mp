import type { DemoMenuRecipe } from '../../domain/demo-menu'
import { listDemoMenuRecipes } from '../../services/demo-menu'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    recipes: [] as DemoMenuRecipe[],
    activeTab: 'today' as 'today' | 'all' | 'week',
    recommended: null as DemoMenuRecipe | null,
    recommendedIndex: 0,
    fastCount: 0,
  },

  onShow() {
    const recipes = listDemoMenuRecipes()
    this.setData({
      recipes,
      recommended: recipes[0] ?? null,
      recommendedIndex: 0,
      fastCount: recipes.filter((recipe) => recipe.cookingMinutes <= 30).length,
    })
  },

  onSwitchTab(event: {
    currentTarget: { dataset: { value?: 'today' | 'all' | 'week' } }
  }) {
    const value = event.currentTarget.dataset.value
    if (value) this.setData({ activeTab: value })
  },

  onShuffleRecommendation() {
    const { recipes, recommendedIndex } = this.data
    if (!recipes.length) {
      this.onCreate()
      return
    }
    const nextIndex = recipes.length === 1 ? 0 : (recommendedIndex + 1) % recipes.length
    this.setData({
      recommended: recipes[nextIndex],
      recommendedIndex: nextIndex,
    })
    if (recipes.length === 1) {
      wx.showToast({ title: '现在只有这一道菜', icon: 'none' })
    }
  },

  onOpenRecommended() {
    const recipe = this.data.recommended
    if (!recipe) {
      this.onCreate()
      return
    }
    wx.navigateTo({ url: `/pages/menu-detail/index?id=${encodeURIComponent(recipe.id)}` })
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/menu-form/index' })
  },

  onOpenRecipe(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/menu-detail/index?id=${encodeURIComponent(id)}` })
  },
})
