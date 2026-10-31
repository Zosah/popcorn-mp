import { menuGateway } from '../../services/menu'
import {
  getMenuErrorMessage,
  type MenuRecipe,
} from '../../services/menu-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { createRequestGate } from '../../utils/request-control'

type MenuTab = 'today' | 'all' | 'week'

const menuRequestGate = createRequestGate()

Page({
  data: {
    recipes: [] as MenuRecipe[],
    activeTab: 'today' as MenuTab,
    recommended: null as MenuRecipe | null,
    recommendedIndex: 0,
    fastCount: 0,
    loading: true,
    loadError: '',
  },

  onShow() {
    void this.refresh()
  },

  async refresh() {
    const sequence = menuRequestGate.begin()
    const hasExistingData = this.data.recipes.length > 0
    this.setData({
      loading: !hasExistingData,
      loadError: '',
    })
    try {
      const recipes = await menuGateway.list()
      if (!menuRequestGate.isCurrent(sequence)) return
      const currentRecommendedId = this.data.recommended?.id
      const foundIndex = currentRecommendedId
        ? recipes.findIndex((recipe) => recipe.id === currentRecommendedId)
        : -1
      const recommendedIndex = foundIndex >= 0 ? foundIndex : 0
      this.setData({
        recipes,
        recommended: recipes[recommendedIndex] ?? null,
        recommendedIndex,
        fastCount: recipes.filter((recipe) => recipe.cookingMinutes <= 30).length,
        loading: false,
        loadError: '',
      })
    } catch (error) {
      if (!menuRequestGate.isCurrent(sequence)) return
      const message = getMenuErrorMessage(error, '菜单暂时没有加载出来')
      this.setData({
        loading: false,
        loadError: message,
      })
      if (this.data.recipes.length) {
        wx.showToast({ title: message, icon: 'none' })
      }
    }
  },

  onRetryLoad() {
    void this.refresh()
  },

  onSwitchTab(event: {
    currentTarget: { dataset: { value?: MenuTab } }
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
