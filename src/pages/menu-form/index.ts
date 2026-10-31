import {
  formatDemoMenuIngredients,
  formatDemoMenuSteps,
  parseDemoMenuIngredients,
  parseDemoMenuSteps,
  type DemoMenuIngredient,
  type DemoMenuStep,
} from '../../domain/demo-menu'
import { mediaGateway } from '../../services/media'
import { getMediaErrorMessage } from '../../services/media-gateway'
import { menuGateway } from '../../services/menu'
import {
  getMenuErrorMessage,
  isMenuVersionConflict,
  type MenuIngredientWriteInput,
  type MenuStepWriteInput,
  type MenuWriteInput,
} from '../../services/menu-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { createRequestGate } from '../../utils/request-control'

interface MenuFormImage {
  mediaId: string
  src: string
  caption?: string
}

const formRequestGate = createRequestGate()

Page({
  data: {
    loading: false,
    saving: false,
    imageUploading: false,
    loadError: '',
    recipeId: '',
    version: 0,
    pageTitle: '收一道家常菜',
    saveText: '保存到菜单',
    ingredientPlaceholder: '牛腩 | 400g | 冰箱冷冻\n番茄 | 3 个 | 冰箱冷藏',
    stepPlaceholder: '焯水 | 牛腩冷水下锅，煮开后洗净浮沫。\n炒香 | 番茄炒出汁，再放入牛腩。',
    image: null as MenuFormImage | null,
    imageMediaId: '',
    originalIngredients: [] as DemoMenuIngredient[],
    originalSteps: [] as DemoMenuStep[],
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

    this.setData({
      recipeId: id,
      loading: true,
      pageTitle: '把这道菜，再整理一下',
      saveText: '保存修改',
    })
    wx.setNavigationBarTitle({ title: '编辑菜单' })
    void this.loadRecipe(id)
  },

  async loadRecipe(id: string) {
    const sequence = formRequestGate.begin()
    this.setData({ loading: true, loadError: '' })
    try {
      const recipe = await menuGateway.get(id)
      if (!formRequestGate.isCurrent(sequence)) return
      if (!recipe) {
        wx.showToast({ title: '这份菜单不存在', icon: 'none' })
        navigateBackOrTab('/pages/menu/index')
        return
      }

      this.setData({
        recipeId: recipe.id,
        version: recipe.version,
        imageMediaId: recipe.imageMediaId,
        image: recipe.image
          ? {
              mediaId: recipe.imageMediaId,
              src: recipe.image.src,
              ...(recipe.image.caption ? { caption: recipe.image.caption } : {}),
            }
          : null,
        originalIngredients: recipe.ingredients,
        originalSteps: recipe.steps,
        form: {
          title: recipe.title,
          description: recipe.description,
          servings: String(recipe.servings),
          cookingMinutes: String(recipe.cookingMinutes),
          ingredientsText: formatDemoMenuIngredients(recipe.ingredients),
          stepsText: formatDemoMenuSteps(recipe.steps),
        },
        loading: false,
        loadError: '',
      })
    } catch (error) {
      if (!formRequestGate.isCurrent(sequence)) return
      this.setData({
        loading: false,
        loadError: getMenuErrorMessage(error, '这份菜单暂时没有加载出来'),
      })
    }
  },

  onRetryLoad() {
    if (this.data.recipeId) void this.loadRecipe(this.data.recipeId)
  },

  onBack() {
    navigateBackOrTab('/pages/menu/index')
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

  onChooseImage() {
    if (this.data.imageUploading || this.data.saving) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file) return
        if (file.size > 10 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过 10 MiB', icon: 'none' })
          return
        }
        void this.uploadImage(file.tempFilePath, file.size)
      },
    })
  },

  async uploadImage(filePath: string, fileSize: number) {
    this.setData({ imageUploading: true })
    try {
      const asset = await mediaGateway.upload(filePath, 'menu', fileSize)
      this.setData({
        image: {
          mediaId: asset.id,
          src: asset.display.url,
          caption: this.data.form.title.trim() || '这道菜的成品图',
        },
        imageMediaId: asset.id,
      })
      wx.showToast({ title: '菜品图片已准备好', icon: 'success' })
    } catch (error) {
      wx.showToast({
        title: getMediaErrorMessage(error, '图片上传没有完成'),
        icon: 'none',
      })
    } finally {
      this.setData({ imageUploading: false })
    }
  },

  onPreviewImage() {
    const src = this.data.image?.src
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
  },

  onRemoveImage() {
    if (this.data.imageUploading || this.data.saving) return
    this.setData({ image: null, imageMediaId: '' })
  },

  async onSave() {
    if (
      this.data.saving ||
      this.data.imageUploading ||
      this.data.loading ||
      this.data.loadError
    ) return

    const form = this.data.form
    const parsedIngredients = parseDemoMenuIngredients(form.ingredientsText)
    const parsedSteps = parseDemoMenuSteps(form.stepsText)
    const servings = Number(form.servings)
    const cookingMinutes = Number(form.cookingMinutes)

    if (!form.title.trim()) {
      wx.showToast({ title: '先写下菜名吧', icon: 'none' })
      return
    }
    if (form.title.trim().length > 30) {
      wx.showToast({ title: '菜名最多 30 个字符', icon: 'none' })
      return
    }
    if (!Number.isFinite(servings) || servings < 1 || servings > 12) {
      wx.showToast({ title: '人份需要在 1–12 之间', icon: 'none' })
      return
    }
    if (!Number.isFinite(cookingMinutes) || cookingMinutes <= 0 || cookingMinutes > 1440) {
      wx.showToast({ title: '预计时间需要在 1–1440 分钟之间', icon: 'none' })
      return
    }
    if (!parsedIngredients.length) {
      wx.showToast({ title: '至少写一样食材', icon: 'none' })
      return
    }
    if (!parsedSteps.length) {
      wx.showToast({ title: '至少写一个步骤', icon: 'none' })
      return
    }

    const input: MenuWriteInput = {
      title: form.title,
      description: form.description,
      servings,
      cookingMinutes,
      imageMediaId: this.data.imageMediaId,
      ingredients: preserveIngredientIds(parsedIngredients, this.data.originalIngredients),
      steps: preserveStepIds(parsedSteps, this.data.originalSteps),
    }

    this.setData({ saving: true })
    try {
      if (this.data.recipeId) {
        const updated = await menuGateway.update(
          this.data.recipeId,
          input,
          this.data.version,
        )
        this.setData({
          version: updated.version,
          imageMediaId: updated.imageMediaId,
        })
      } else {
        await menuGateway.create(input)
      }
      wx.showToast({
        title: this.data.recipeId ? '修改已保存' : '菜单已收好',
        icon: 'success',
      })
      navigateBackOrTab('/pages/menu/index')
    } catch (error) {
      if (isMenuVersionConflict(error) && this.data.recipeId) {
        const reload = await showConfirm(
          '菜单已在别处更新',
          '你刚才的修改没有覆盖最新内容。重新载入后可以再整理一次。',
          '载入最新版',
        )
        if (reload) await this.loadRecipe(this.data.recipeId)
        return
      }
      wx.showToast({
        title: getMenuErrorMessage(error, '保存失败，请稍后再试'),
        icon: 'none',
      })
    } finally {
      this.setData({ saving: false })
    }
  },
})

function preserveIngredientIds(
  items: Array<Pick<DemoMenuIngredient, 'name' | 'amount' | 'source'>>,
  original: DemoMenuIngredient[],
): MenuIngredientWriteInput[] {
  const buckets = groupByName(original, (item) => item.name)
  return items.map((item) => {
    const matched = takeMatch(buckets, item.name)
    return {
      ...(matched ? { id: matched.id } : {}),
      name: item.name,
      amount: item.amount,
      source: item.source,
    }
  })
}

function preserveStepIds(
  items: Array<Pick<DemoMenuStep, 'title' | 'description'>>,
  original: DemoMenuStep[],
): MenuStepWriteInput[] {
  const buckets = groupByName(original, (item) => item.title)
  return items.map((item) => {
    const matched = takeMatch(buckets, item.title)
    return {
      ...(matched ? { id: matched.id } : {}),
      title: item.title,
      description: item.description,
    }
  })
}

function groupByName<T>(items: T[], getName: (item: T) => string): Map<string, T[]> {
  const buckets = new Map<string, T[]>()
  for (const item of items) {
    const key = getName(item).trim().toLocaleLowerCase()
    if (!key) continue
    const bucket = buckets.get(key) ?? []
    bucket.push(item)
    buckets.set(key, bucket)
  }
  return buckets
}

function takeMatch<T>(buckets: Map<string, T[]>, name: string): T | undefined {
  const bucket = buckets.get(name.trim().toLocaleLowerCase())
  return bucket?.shift()
}

function showConfirm(title: string, content: string, confirmText: string): Promise<boolean> {
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
