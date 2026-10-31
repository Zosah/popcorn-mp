import {
  beginMenuCooking,
  buildMenuCookingSteps,
  completeCurrentMenuStep,
  cookingElapsedSeconds,
  cookingProgressPercent,
  createMenuCookingSession,
  formatCookingElapsed,
  normalizeCookingStepIndex,
  normalizeMenuCookingSession,
  type MenuCookingSession,
  type MenuCookingStage,
  type MenuCookingStepView,
} from '../../domain/menu-cooking'
import { menuGateway } from '../../services/menu'
import {
  getMenuErrorMessage,
  isMenuVersionConflict,
  type MenuRecipe,
} from '../../services/menu-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { createRequestGate } from '../../utils/request-control'

const COOKING_SESSION_KEY_PREFIX = 'popcorn_menu_cooking_session_v1'
const cookingRequestGate = createRequestGate()
let cookingTimer: ReturnType<typeof setInterval> | null = null

Page({
  data: {
    id: '',
    recipe: null as MenuRecipe | null,
    session: null as MenuCookingSession | null,
    stage: 'prep' as MenuCookingStage,
    steps: [] as MenuCookingStepView[],
    currentStep: null as MenuCookingStepView | null,
    viewStepIndex: 0,
    completedCount: 0,
    progressPercent: 0,
    elapsedLabel: '00:00',
    readyCount: 0,
    missingIngredients: [] as MenuRecipe['ingredients'],
    activeIngredientId: '',
    mutating: false,
    loading: true,
    loadError: '',
    canGoPrevious: false,
    canGoNext: false,
    isReviewing: false,
    primaryActionLabel: '完成这一步',
    stepBadgeLabel: '第 1 步',
    isLastStep: false,
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    this.setData({ id })
    if (!id) {
      this.setData({ loading: false, loadError: '缺少菜谱信息，先回到菜单重新打开。' })
      return
    }
    void this.loadRecipe()
  },

  onShow() {
    if (this.data.stage === 'cooking' && this.data.recipe) {
      enableKeepScreenOn(true)
      this.startTimer()
    }
  },

  onHide() {
    this.stopTimer()
    enableKeepScreenOn(false)
  },

  onUnload() {
    this.stopTimer()
    enableKeepScreenOn(false)
  },

  async loadRecipe() {
    const sequence = cookingRequestGate.begin()
    this.setData({ loading: !this.data.recipe, loadError: '' })
    try {
      const recipe = await menuGateway.get(this.data.id)
      if (!cookingRequestGate.isCurrent(sequence)) return
      if (!recipe) {
        this.setData({ loading: false, loadError: '这份菜单已经不存在了。' })
        return
      }
      if (!recipe.steps.length) {
        this.setData({
          recipe,
          loading: false,
          loadError: '这份菜单还没有烹饪步骤，先回详情页补一条。',
        })
        return
      }

      const session = readCookingSession(recipe)
      this.setData({
        recipe,
        loading: false,
        loadError: '',
        readyCount: countReadyIngredients(recipe),
        missingIngredients: recipe.ingredients.filter((item) => !item.ready),
      })
      this.applySession(session, recipe)
      wx.setNavigationBarTitle({ title: `做菜 · ${recipe.title}` })
    } catch (error) {
      if (!cookingRequestGate.isCurrent(sequence)) return
      this.setData({
        loading: false,
        loadError: getMenuErrorMessage(error, '做菜页面暂时没有加载出来'),
      })
    }
  },

  onRetryLoad() {
    void this.loadRecipe()
  },

  applySession(session: MenuCookingSession, recipe: MenuRecipe) {
    const viewStepIndex = session.stage === 'done'
      ? Math.max(0, recipe.steps.length - 1)
      : normalizeCookingStepIndex(session.currentStepIndex, recipe.steps.length)
    const steps = buildMenuCookingSteps(recipe.steps, session, viewStepIndex)
    const currentStep = steps[viewStepIndex] ?? null
    const isReviewing = session.stage === 'cooking'
      && viewStepIndex < session.currentStepIndex
    this.setData({
      session,
      stage: session.stage,
      steps,
      currentStep,
      viewStepIndex,
      completedCount: session.completedStepIds.length,
      progressPercent: cookingProgressPercent(session),
      elapsedLabel: formatCookingElapsed(cookingElapsedSeconds(session)),
      canGoPrevious: viewStepIndex > 0,
      canGoNext: viewStepIndex < recipe.steps.length - 1
        && (session.stage !== 'cooking' || viewStepIndex < session.currentStepIndex),
      isReviewing,
      isLastStep: viewStepIndex === recipe.steps.length - 1,
      primaryActionLabel: isReviewing
        ? '回到当前步骤'
        : viewStepIndex === recipe.steps.length - 1
          ? '完成最后一步'
          : '完成这一步',
      stepBadgeLabel: isReviewing ? '回看' : `第 ${viewStepIndex + 1} 步`,
    })
    this.syncTimerForStage(session.stage)
  },

  async onToggleIngredient(event: {
    currentTarget: { dataset: { id?: string } }
  }) {
    const recipe = this.data.recipe
    const ingredientId = event.currentTarget.dataset.id
    if (!recipe || !ingredientId || this.data.mutating || this.data.stage !== 'prep') return
    const ingredient = recipe.ingredients.find((item) => item.id === ingredientId)
    if (!ingredient) return

    this.setData({ mutating: true, activeIngredientId: ingredientId })
    cookingRequestGate.invalidate()
    try {
      const updated = await menuGateway.setIngredientReady(
        recipe.id,
        ingredientId,
        !ingredient.ready,
        recipe.version,
      )
      this.setData({
        recipe: updated,
        readyCount: countReadyIngredients(updated),
        missingIngredients: updated.ingredients.filter((item) => !item.ready),
      })
    } catch (error) {
      if (isMenuVersionConflict(error)) {
        const reload = await showModal(
          '菜谱已在别处更新',
          '重新载入最新菜谱后再继续备菜。',
          '重新载入',
        )
        if (reload) void this.loadRecipe()
      } else {
        wx.showToast({
          title: getMenuErrorMessage(error, '食材状态没有保存下来'),
          icon: 'none',
        })
      }
    } finally {
      this.setData({ mutating: false, activeIngredientId: '' })
    }
  },

  async onBeginCooking() {
    const recipe = this.data.recipe
    const session = this.data.session
    if (!recipe || !session) return
    if (!recipe.steps.length) {
      wx.showToast({ title: '这份菜单还没有烹饪步骤', icon: 'none' })
      return
    }

    const missingCount = recipe.ingredients.filter((item) => !item.ready).length
    if (missingCount > 0) {
      const confirmed = await showModal(
        '还有食材没备齐',
        `还有 ${missingCount} 样食材没勾选。仍然可以开始，做菜过程中再回来确认也可以。`,
        '仍然开始',
      )
      if (!confirmed) return
    }

    const next = beginMenuCooking(session)
    saveCookingSession(next)
    this.applySession(next, recipe)
    wx.vibrateShort({ type: 'light' })
    wx.showToast({ title: '计时开始', icon: 'none' })
  },

  onPreviousStep() {
    if (!this.data.canGoPrevious) return
    this.showStep(this.data.viewStepIndex - 1)
  },

  onNextStep() {
    if (!this.data.canGoNext) return
    this.showStep(this.data.viewStepIndex + 1)
  },

  onSelectStep(event: { currentTarget: { dataset: { index?: string } } }) {
    const recipe = this.data.recipe
    const session = this.data.session
    const index = Number(event.currentTarget.dataset.index)
    if (!recipe || !session || !Number.isInteger(index)) return
    if (session.stage === 'cooking' && index > session.currentStepIndex) {
      wx.showToast({ title: '按顺序来，先完成眼前这一步', icon: 'none' })
      return
    }
    this.showStep(index)
  },

  showStep(index: number) {
    const recipe = this.data.recipe
    const session = this.data.session
    if (!recipe || !session) return
    const safeIndex = normalizeCookingStepIndex(index, recipe.steps.length)
    this.applySession(session, recipe)
    this.setData({ viewStepIndex: safeIndex })
    this.applyStepView(session, recipe, safeIndex)
    wx.pageScrollTo({ scrollTop: 0, duration: 220 })
  },

  applyStepView(session: MenuCookingSession, recipe: MenuRecipe, viewStepIndex: number) {
    const steps = buildMenuCookingSteps(recipe.steps, session, viewStepIndex)
    const currentStep = steps[viewStepIndex] ?? null
    const isReviewing = session.stage === 'cooking' && viewStepIndex < session.currentStepIndex
    this.setData({
      steps,
      currentStep,
      viewStepIndex,
      completedCount: session.completedStepIds.length,
      progressPercent: cookingProgressPercent(session),
      canGoPrevious: viewStepIndex > 0,
      canGoNext: viewStepIndex < recipe.steps.length - 1
        && (session.stage !== 'cooking' || viewStepIndex < session.currentStepIndex),
      isReviewing,
      isLastStep: viewStepIndex === recipe.steps.length - 1,
      primaryActionLabel: isReviewing
        ? '回到当前步骤'
        : viewStepIndex === recipe.steps.length - 1
          ? '完成最后一步'
          : '完成这一步',
      stepBadgeLabel: isReviewing ? '回看' : `第 ${viewStepIndex + 1} 步`,
    })
  },

  onPrimaryStepAction() {
    const session = this.data.session
    const recipe = this.data.recipe
    if (!session || !recipe) return
    if (session.stage === 'done') {
      this.showStep(Math.max(0, recipe.steps.length - 1))
      return
    }
    if (this.data.isReviewing) {
      this.showStep(session.currentStepIndex)
      return
    }
    if (this.data.viewStepIndex !== session.currentStepIndex) return

    const next = completeCurrentMenuStep(session)
    saveCookingSession(next)
    if (next.stage === 'done') {
      this.applySession(next, recipe)
      wx.vibrateShort({ type: 'medium' })
      wx.showToast({ title: '这道菜做好了', icon: 'success' })
      return
    }
    this.applySession(next, recipe)
    wx.vibrateShort({ type: 'light' })
  },

  onPauseAndBack() {
    if (this.data.stage === 'cooking') {
      wx.showToast({ title: '进度已留在本机，下次继续', icon: 'none' })
    }
    navigateBackOrTab('/pages/menu/index')
  },

  async onFinishCooking() {
    const confirmed = await showModal(
      '结束这次做饭？',
      '本机上的步骤进度和计时会清除，菜谱本身不会删除。',
      '结束并返回',
    )
    if (!confirmed) return
    clearCookingSession(this.data.id)
    navigateBackOrTab('/pages/menu/index')
  },

  startTimer() {
    this.stopTimer()
    cookingTimer = setInterval(() => this.refreshElapsed(), 1000)
  },

  stopTimer() {
    if (cookingTimer === null) return
    clearInterval(cookingTimer)
    cookingTimer = null
  },

  refreshElapsed() {
    const session = this.data.session
    if (!session || session.stage !== 'cooking') return
    this.setData({ elapsedLabel: formatCookingElapsed(cookingElapsedSeconds(session)) })
  },

  syncTimerForStage(stage: MenuCookingStage) {
    if (stage === 'cooking') {
      enableKeepScreenOn(true)
      this.startTimer()
      return
    }
    this.stopTimer()
    enableKeepScreenOn(false)
  },
})

function readCookingSession(recipe: MenuRecipe): MenuCookingSession {
  try {
    const stored = wx.getStorageSync(sessionStorageKey(recipe.id)) as unknown
    return normalizeMenuCookingSession(
      stored,
      recipe.id,
      recipe.steps.map((step) => step.id),
    )
  } catch {
    return createMenuCookingSession(recipe.id, recipe.steps.map((step) => step.id))
  }
}

function saveCookingSession(session: MenuCookingSession): void {
  try {
    wx.setStorageSync(sessionStorageKey(session.recipeId), session)
  } catch {
    // 本机空间不足不应阻断做菜；当前页面仍然可以继续。
  }
}

function clearCookingSession(recipeId: string): void {
  try {
    wx.removeStorageSync(sessionStorageKey(recipeId))
  } catch {
    // 清理失败不阻断返回。
  }
}

function sessionStorageKey(recipeId: string): string {
  return `${COOKING_SESSION_KEY_PREFIX}:${recipeId}`
}

function countReadyIngredients(recipe: MenuRecipe): number {
  return recipe.ingredients.filter((item) => item.ready).length
}

function enableKeepScreenOn(keepScreenOn: boolean): void {
  wx.setKeepScreenOn({
    keepScreenOn,
    fail: () => undefined,
  })
}

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
