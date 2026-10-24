import {
  formatDemoMenuIngredients,
  formatDemoMenuSteps,
  parseDemoMenuIngredients,
  parseDemoMenuSteps,
} from '../../domain/demo-menu'
import {
  addDemoMenuRecipe,
  getDemoMenuRecipe,
  updateDemoMenuRecipe,
} from '../../services/demo-menu'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    saving: false,
    recipeId: '',
    pageTitle: '收一道家常菜',
    saveText: '保存到菜单',
    form: {
      title: '',
      description: '',
      servings: '2',
      cookingMinutes: '30',
      ingredientsText: '',
      stepsText: '',
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    if (!id) return

    const recipe = getDemoMenuRecipe(id)
    if (!recipe) {
      wx.showToast({ title: '这份菜单不存在', icon: 'none' })
      navigateBackOrTab('/pages/home/index')
      return
    }

    this.setData({
      recipeId: recipe.id,
      pageTitle: '把这道菜，再整理一下',
      saveText: '保存修改',
      form: {
        title: recipe.title,
        description: recipe.description,
        servings: String(recipe.servings),
        cookingMinutes: String(recipe.cookingMinutes),
        ingredientsText: formatDemoMenuIngredients(recipe.ingredients),
        stepsText: formatDemoMenuSteps(recipe.steps),
      },
    })
    wx.setNavigationBarTitle({ title: '编辑菜单' })
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onTitleInput(event: { detail: { value: string } }) {
    this.setData({ 'form.title': event.detail.value })
  },

  onDescriptionInput(event: { detail: { value: string } }) {
    this.setData({ 'form.description': event.detail.value })
  },

  onServingsInput(event: { detail: { value: string } }) {
    this.setData({ 'form.servings': event.detail.value })
  },

  onMinutesInput(event: { detail: { value: string } }) {
    this.setData({ 'form.cookingMinutes': event.detail.value })
  },

  onIngredientsInput(event: { detail: { value: string } }) {
    this.setData({ 'form.ingredientsText': event.detail.value })
  },

  onStepsInput(event: { detail: { value: string } }) {
    this.setData({ 'form.stepsText': event.detail.value })
  },

  onSave() {
    const form = this.data.form
    const ingredients = parseDemoMenuIngredients(form.ingredientsText)
    const steps = parseDemoMenuSteps(form.stepsText)
    const servings = Number(form.servings)
    const cookingMinutes = Number(form.cookingMinutes)

    if (!form.title.trim()) {
      wx.showToast({ title: '先写下菜名吧', icon: 'none' })
      return
    }
    if (!Number.isFinite(servings) || servings < 1 || servings > 12) {
      wx.showToast({ title: '人份需要在 1–12 之间', icon: 'none' })
      return
    }
    if (!Number.isFinite(cookingMinutes) || cookingMinutes <= 0) {
      wx.showToast({ title: '请填写预计时间', icon: 'none' })
      return
    }
    if (!ingredients.length) {
      wx.showToast({ title: '至少写一样食材', icon: 'none' })
      return
    }
    if (!steps.length) {
      wx.showToast({ title: '至少写一个步骤', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    const input = {
      title: form.title,
      description: form.description,
      servings,
      cookingMinutes,
      ingredients,
      steps,
    }
    if (this.data.recipeId) {
      updateDemoMenuRecipe(this.data.recipeId, input)
    } else {
      addDemoMenuRecipe(input)
    }
    wx.showToast({
      title: this.data.recipeId ? '修改已保存' : '菜单已收好',
      icon: 'success',
    })
    navigateBackOrTab('/pages/home/index')
  },
})
