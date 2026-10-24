import type { DemoMenuRecipe } from '../../domain/demo-menu'
import { listDemoMenuRecipes } from '../../services/demo-menu'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    recipes: [] as DemoMenuRecipe[],
  },

  onShow() {
    this.setData({ recipes: listDemoMenuRecipes() })
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
