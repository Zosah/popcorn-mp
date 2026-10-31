import {
  menuFilterMaxMinutes,
  nextRecommendationIndex,
  recommendationIndexForDate,
  type MenuRecipeFilter,
} from '../../domain/menu-discovery'
import { menuGateway } from '../../services/menu'
import {
  getMenuErrorMessage,
  type MenuListFilters,
  type MenuRecipe,
} from '../../services/menu-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { createRequestGate } from '../../utils/request-control'

type MenuTab = 'today' | 'all'

const menuRequestGate = createRequestGate()
let searchTimer: ReturnType<typeof setTimeout> | null = null

Page({
  data: {
    allRecipes: [] as MenuRecipe[],
    recipes: [] as MenuRecipe[],
    activeTab: 'today' as MenuTab,
    recipeFilter: 'all' as MenuRecipeFilter,
    searchQuery: '',
    recommended: null as MenuRecipe | null,
    recommendedIndex: 0,
    fastCount: 0,
    loading: true,
    listLoading: false,
    loadError: '',
  },

  onShow() {
    void this.refresh()
  },

  onUnload() {
    clearSearchTimer()
  },

  async refresh() {
    const sequence = menuRequestGate.begin()
    const hasExistingData = this.data.allRecipes.length > 0
    this.setData({
      loading: !hasExistingData,
      listLoading: hasExistingData,
      loadError: '',
    })
    try {
      const allRecipes = await menuGateway.list()
      if (!menuRequestGate.isCurrent(sequence)) return

      const filters = currentFilters(this.data.recipeFilter, this.data.searchQuery)
      const recipes = filters
        ? await menuGateway.list(filters)
        : allRecipes
      if (!menuRequestGate.isCurrent(sequence)) return

      this.applyLoadedRecipes(allRecipes, recipes)
    } catch (error) {
      if (!menuRequestGate.isCurrent(sequence)) return
      const message = getMenuErrorMessage(error, '菜单暂时没有加载出来')
      if (this.data.allRecipes.length) {
        this.setData({ loading: false, listLoading: false })
        wx.showToast({ title: message, icon: 'none' })
        return
      }
      this.setData({
        loading: false,
        listLoading: false,
        loadError: message,
      })
    }
  },

  applyLoadedRecipes(allRecipes: MenuRecipe[], recipes: MenuRecipe[]) {
    const currentRecommendedId = this.data.recommended?.id
    const preservedIndex = currentRecommendedId
      ? allRecipes.findIndex((recipe) => recipe.id === currentRecommendedId)
      : -1
    const recommendedIndex = preservedIndex >= 0
      ? preservedIndex
      : recommendationIndexForDate(allRecipes.length)
    this.setData({
      allRecipes,
      recipes,
      recommended: allRecipes[recommendedIndex] ?? null,
      recommendedIndex,
      fastCount: allRecipes.filter((recipe) => recipe.cookingMinutes <= 30).length,
      loading: false,
      listLoading: false,
      loadError: '',
    })
  },

  async loadVisibleRecipes() {
    const sequence = menuRequestGate.begin()
    this.setData({ listLoading: true })
    try {
      const filters = currentFilters(this.data.recipeFilter, this.data.searchQuery)
      const recipes = filters
        ? await menuGateway.list(filters)
        : this.data.allRecipes
      if (!menuRequestGate.isCurrent(sequence)) return
      this.setData({ recipes, listLoading: false })
    } catch (error) {
      if (!menuRequestGate.isCurrent(sequence)) return
      this.setData({ listLoading: false })
      wx.showToast({
        title: getMenuErrorMessage(error, '菜谱暂时没有筛选出来'),
        icon: 'none',
      })
    }
  },

  onRetryLoad() {
    void this.refresh()
  },

  onSwitchTab(event: {
    currentTarget: { dataset: { value?: MenuTab } }
  }) {
    const value = event.currentTarget.dataset.value
    if (!value || value === this.data.activeTab) return
    this.setData({ activeTab: value })
  },

  onOpenRecipeBook() {
    this.setData({ activeTab: 'all', recipeFilter: 'all', searchQuery: '' })
    if (this.data.recipes.length !== this.data.allRecipes.length) {
      this.setData({ recipes: this.data.allRecipes })
    }
  },

  onSelectFast() {
    this.setData({ activeTab: 'all', recipeFilter: 'fast', searchQuery: '' })
    void this.loadVisibleRecipes()
  },

  onSelectFilter(event: {
    currentTarget: { dataset: { value?: MenuRecipeFilter } }
  }) {
    const value = event.currentTarget.dataset.value
    if (!value || value === this.data.recipeFilter) return
    this.setData({ recipeFilter: value })
    void this.loadVisibleRecipes()
  },

  onSearchInput(event: { detail: { value: string } }) {
    this.setData({ searchQuery: event.detail.value })
    clearSearchTimer()
    searchTimer = setTimeout(() => {
      searchTimer = null
      void this.loadVisibleRecipes()
    }, 280)
  },

  onSearchConfirm() {
    clearSearchTimer()
    void this.loadVisibleRecipes()
  },

  onClearSearch() {
    clearSearchTimer()
    if (!this.data.searchQuery) return
    this.setData({ searchQuery: '' })
    void this.loadVisibleRecipes()
  },

  onShuffleRecommendation() {
    const { allRecipes, recommendedIndex } = this.data
    if (!allRecipes.length) {
      this.onCreate()
      return
    }
    const nextIndex = nextRecommendationIndex(recommendedIndex, allRecipes.length)
    this.setData({
      recommended: allRecipes[nextIndex],
      recommendedIndex: nextIndex,
    })
    if (allRecipes.length === 1) {
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

function currentFilters(
  filter: MenuRecipeFilter,
  searchQuery: string,
): MenuListFilters | null {
  const query = searchQuery.trim()
  const maxMinutes = menuFilterMaxMinutes(filter)
  if (!query && !maxMinutes) return null
  return {
    ...(query ? { query } : {}),
    ...(maxMinutes ? { maxMinutes } : {}),
  }
}

function clearSearchTimer(): void {
  if (searchTimer === null) return
  clearTimeout(searchTimer)
  searchTimer = null
}
