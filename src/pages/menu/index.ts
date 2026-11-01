import { appConfig } from '../../config/env'
import {
  menuFilterMaxMinutes,
  nextRecommendationIndex,
  recommendationIndexForDate,
  type MenuRecipeFilter,
} from '../../domain/menu-discovery'
import { menuGateway } from '../../services/menu'
import { hydrateAuthState } from '../../services/auth'
import { promptAuthGateIfNeeded, requireAuthForWrite } from '../../services/auth-preview'
import { readPageCache, writePageCache as persistPageCache } from '../../services/page-cache'
import {
  getMenuErrorMessage,
  type MenuListFilters,
  type MenuRecipe,
} from '../../services/menu-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

type MenuTab = 'today' | 'all'

const menuRequestGate = createRequestGate()
const MENU_PAGE_CACHE_KEY = 'menu:overview'
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
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    listLoading: false,
    loadError: '',
  },

  onLoad() {
    const cached = readPageCache<Record<string, unknown>>(MENU_PAGE_CACHE_KEY)
    if (cached) {
      this.setData({
        ...cached.value,
        loading: false,
        listLoading: false,
        hasLoaded: true,
        cacheFresh: cached.fresh,
        hasShown: false,
      })
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
    clearSearchTimer()
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
        recipes: [],
        recommended: null,
        fastCount: 0,
        loading: false,
        listLoading: false,
        hasLoaded: true,
        cacheFresh: false,
        loadError: '',
      })
      if (fromPullDown) wx.stopPullDownRefresh()
      promptAuthGateIfNeeded()
      return
    }
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
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!menuRequestGate.isCurrent(sequence)) return

      this.applyLoadedRecipes(allRecipes, recipes)
    } catch (error) {
      if (!menuRequestGate.isCurrent(sequence)) return
      if (firstLoad) await waitForMinimumLoading(startedAt)
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
        hasLoaded: true,
        loadError: message,
      })
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
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
      hasLoaded: true,
      cacheFresh: true,
      loadError: '',
    }, () => this.cacheCurrentPage())
  },

  cacheCurrentPage() {
    const data = this.data as unknown as Record<string, unknown>
    const {
      loading: _loading,
      listLoading: _listLoading,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      ...snapshot
    } = data
    persistPageCache(MENU_PAGE_CACHE_KEY, snapshot)
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
      this.setData({ recipes, listLoading: false }, () => this.cacheCurrentPage())
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
    }, () => this.cacheCurrentPage())
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
    if (!requireAuthForWrite()) return
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
