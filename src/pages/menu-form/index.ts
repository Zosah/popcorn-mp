import { mediaGateway } from '../../services/media'
import { menuGateway } from '../../services/menu'
import {
  getMenuErrorMessage,
  isMenuVersionConflict,
  type MenuCategory,
  type MenuIngredientWriteInput,
  type MenuRecipe,
  type MenuStepWriteInput,
  type MenuWriteInput,
} from '../../services/menu-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { createRequestGate } from '../../utils/request-control'
import { showMediaUploadError } from '../../utils/media-error'

interface MenuFormImage {
  mediaId: string
  src: string
  caption?: string
}

interface IngredientDraft {
  key: string
  id?: string
  name: string
  amount: string
  source: string
}

interface StepDraft {
  key: string
  id?: string
  title: string
  description: string
}

const formRequestGate = createRequestGate()
let draftSequence = 0

function nextDraftKey(prefix: string): string {
  draftSequence += 1
  return `${prefix}-${Date.now()}-${draftSequence}`
}

function emptyIngredient(): IngredientDraft {
  return { key: nextDraftKey('ingredient'), name: '', amount: '', source: '' }
}

function emptyStep(): StepDraft {
  return { key: nextDraftKey('step'), title: '', description: '' }
}

Page({
  data: {
    loading: true,
    saving: false,
    imageUploading: false,
    noteImageUploading: false,
    loadError: '',
    recipeId: '',
    version: 0,
    pageTitle: '记一道家常菜',
    saveText: '保存到菜谱本',
    categories: [] as MenuCategory[],
    categoryIndex: 0,
    image: null as MenuFormImage | null,
    imageMediaId: '',
    noteImages: [] as MenuFormImage[],
    ingredients: [emptyIngredient()] as IngredientDraft[],
    steps: [emptyStep()] as StepDraft[],
    form: {
      title: '',
      description: '',
      servings: '2',
      cookingMinutes: '30',
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    if (id) {
      this.setData({
        recipeId: id,
        pageTitle: '把这道菜，再整理一下',
        saveText: '保存修改',
      })
      wx.setNavigationBarTitle({ title: '编辑菜谱' })
    }
    void this.initialize(id)
  },

  async initialize(id: string) {
    const sequence = formRequestGate.begin()
    this.setData({ loading: true, loadError: '' })
    try {
      const [categories, recipe] = await Promise.all([
        menuGateway.listCategories(),
        id ? menuGateway.get(id) : Promise.resolve(null),
      ])
      if (!formRequestGate.isCurrent(sequence)) return
      if (id && !recipe) {
        wx.showToast({ title: '这份菜谱不存在', icon: 'none' })
        navigateBackOrTab('/pages/menu/index')
        return
      }
      const categoryIndex = recipe?.categoryId
        ? Math.max(0, categories.findIndex((item) => item.id === recipe.categoryId))
        : 0
      this.setData({
        categories,
        categoryIndex,
        loading: false,
        loadError: '',
        ...(recipe ? recipeFormData(recipe) : {}),
      })
    } catch (error) {
      if (!formRequestGate.isCurrent(sequence)) return
      this.setData({
        loading: false,
        loadError: getMenuErrorMessage(error, '菜谱暂时没有加载出来'),
      })
    }
  },

  onRetryLoad() {
    void this.initialize(this.data.recipeId)
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

  onCategoryChange(event: { detail: { value: string | number } }) {
    this.setData({ categoryIndex: Number(event.detail.value) })
  },

  onCreateCategory() {
    wx.showModal({
      title: '新建分类',
      editable: true,
      placeholderText: '例如：烘焙、快手菜',
      confirmText: '添加',
      success: (result) => {
        if (!result.confirm || !result.content?.trim()) return
        void this.createCategory(result.content.trim())
      },
    })
  },

  async createCategory(name: string) {
    try {
      const category = await menuGateway.createCategory(name)
      const categories = [...this.data.categories, category]
      this.setData({
        categories,
        categoryIndex: categories.length - 1,
      })
      wx.showToast({ title: '分类已添加', icon: 'success' })
    } catch (error) {
      wx.showToast({
        title: getMenuErrorMessage(error, '分类没有添加成功'),
        icon: 'none',
      })
    }
  },

  onIngredientInput(event: {
    currentTarget: { dataset: { index?: string; field?: keyof IngredientDraft } }
    detail: { value: string }
  }) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    if (!Number.isInteger(index) || !field || field === 'key' || field === 'id') return
    this.setData({ [`ingredients[${index}].${field}`]: event.detail.value })
  },

  onAddIngredient() {
    this.setData({ ingredients: [...this.data.ingredients, emptyIngredient()] })
  },

  onRemoveIngredient(event: { currentTarget: { dataset: { index?: string } } }) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index)) return
    const ingredients = this.data.ingredients.filter((_, itemIndex) => itemIndex !== index)
    this.setData({ ingredients: ingredients.length ? ingredients : [emptyIngredient()] })
  },

  onStepInput(event: {
    currentTarget: { dataset: { index?: string; field?: keyof StepDraft } }
    detail: { value: string }
  }) {
    const index = Number(event.currentTarget.dataset.index)
    const field = event.currentTarget.dataset.field
    if (!Number.isInteger(index) || !field || field === 'key' || field === 'id') return
    this.setData({ [`steps[${index}].${field}`]: event.detail.value })
  },

  onAddStep() {
    this.setData({ steps: [...this.data.steps, emptyStep()] })
  },

  onRemoveStep(event: { currentTarget: { dataset: { index?: string } } }) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index)) return
    const steps = this.data.steps.filter((_, itemIndex) => itemIndex !== index)
    this.setData({ steps: steps.length ? steps : [emptyStep()] })
  },

  onChooseImage() {
    if (this.data.imageUploading || this.data.saving) return
    chooseImages(1, (files) => {
      if (files[0]) void this.uploadFinishedImage(files[0])
    })
  },

  async uploadFinishedImage(file: WechatMiniprogram.MediaFile) {
    this.setData({ imageUploading: true })
    try {
      const asset = await mediaGateway.upload(file.tempFilePath, 'menu', file.size)
      this.setData({
        image: { mediaId: asset.id, src: asset.display.url },
        imageMediaId: asset.id,
      })
      wx.showToast({ title: '成品图已添加', icon: 'success' })
    } catch (error) {
      showMediaUploadError(error, '成品图没有上传成功')
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

  onChooseNoteImages() {
    if (this.data.noteImageUploading || this.data.saving) return
    const remaining = 9 - this.data.noteImages.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多放 9 张参考图', icon: 'none' })
      return
    }
    chooseImages(remaining, (files) => {
      if (files.length) void this.uploadNoteImages(files)
    })
  },

  async uploadNoteImages(files: WechatMiniprogram.MediaFile[]) {
    this.setData({ noteImageUploading: true })
    try {
      const uploaded = await Promise.all(files.map(async (file) => {
        const asset = await mediaGateway.upload(file.tempFilePath, 'menu', file.size)
        return { mediaId: asset.id, src: asset.display.url }
      }))
      this.setData({
        noteImages: [...this.data.noteImages, ...uploaded].slice(0, 9),
      })
    } catch (error) {
      showMediaUploadError(error, '参考图没有上传成功')
    } finally {
      this.setData({ noteImageUploading: false })
    }
  },

  onPreviewNoteImage(event: { currentTarget: { dataset: { index?: string } } }) {
    const index = Number(event.currentTarget.dataset.index)
    const current = this.data.noteImages[index]
    if (!current) return
    wx.previewImage({
      current: current.src,
      urls: this.data.noteImages.map((item) => item.src),
    })
  },

  onRemoveNoteImage(event: { currentTarget: { dataset: { index?: string } } }) {
    if (this.data.noteImageUploading || this.data.saving) return
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index)) return
    this.setData({
      noteImages: this.data.noteImages.filter((_, itemIndex) => itemIndex !== index),
    })
  },

  async onSave() {
    if (this.data.saving || this.data.imageUploading || this.data.noteImageUploading) return

    const form = this.data.form
    const servings = Number(form.servings)
    const cookingMinutes = Number(form.cookingMinutes)
    const ingredients = this.data.ingredients
      .map(toIngredientInput)
      .filter((item) => item.name)
    const steps = this.data.steps
      .map(toStepInput)
      .filter((item) => item.title || item.description)

    if (!form.title.trim()) {
      wx.showToast({ title: '先写下菜名吧', icon: 'none' })
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
    if (!ingredients.length) {
      wx.showToast({ title: '至少写一样食材', icon: 'none' })
      return
    }
    if (!steps.length) {
      wx.showToast({ title: '至少写一个做法步骤', icon: 'none' })
      return
    }

    const category = this.data.categories[this.data.categoryIndex]
    const input: MenuWriteInput = {
      title: form.title,
      description: form.description,
      categoryId: category?.id ?? '',
      servings,
      cookingMinutes,
      imageMediaId: this.data.imageMediaId,
      noteImageMediaIds: this.data.noteImages.map((item) => item.mediaId),
      ingredients,
      steps,
    }

    this.setData({ saving: true })
    try {
      if (this.data.recipeId) {
        const updated = await menuGateway.update(
          this.data.recipeId,
          input,
          this.data.version,
        )
        this.setData({ version: updated.version, imageMediaId: updated.imageMediaId })
      } else {
        await menuGateway.create(input)
      }
      wx.showToast({
        title: this.data.recipeId ? '修改已保存' : '菜谱已收好',
        icon: 'success',
      })
      navigateBackOrTab('/pages/menu/index')
    } catch (error) {
      if (isMenuVersionConflict(error) && this.data.recipeId) {
        const reload = await showConfirm(
          '菜谱已在别处更新',
          '你刚才的修改没有覆盖最新内容。重新载入后可以再整理一次。',
          '载入最新版',
        )
        if (reload) await this.initialize(this.data.recipeId)
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

function recipeFormData(recipe: MenuRecipe) {
  return {
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
    noteImages: recipe.noteImages.map((item) => ({
      mediaId: item.mediaId,
      src: item.src,
    })),
    ingredients: recipe.ingredients.length
      ? recipe.ingredients.map((item) => ({
          key: nextDraftKey('ingredient'),
          id: item.id,
          name: item.name,
          amount: item.amount,
          source: item.source,
        }))
      : [emptyIngredient()],
    steps: recipe.steps.length
      ? recipe.steps.map((item) => ({
          key: nextDraftKey('step'),
          id: item.id,
          title: item.title,
          description: item.description,
        }))
      : [emptyStep()],
    form: {
      title: recipe.title,
      description: recipe.description,
      servings: String(recipe.servings),
      cookingMinutes: String(recipe.cookingMinutes),
    },
  }
}

function toIngredientInput(item: IngredientDraft): MenuIngredientWriteInput {
  return {
    ...(item.id ? { id: item.id } : {}),
    name: item.name.trim(),
    amount: item.amount.trim(),
    source: item.source.trim(),
  }
}

function toStepInput(item: StepDraft): MenuStepWriteInput {
  return {
    ...(item.id ? { id: item.id } : {}),
    title: item.title.trim(),
    description: item.description.trim(),
  }
}

function chooseImages(
  count: number,
  onSelected: (files: WechatMiniprogram.MediaFile[]) => void,
): void {
  wx.chooseMedia({
    count,
    mediaType: ['image'],
    sourceType: ['album', 'camera'],
    success: (result) => {
      const files = result.tempFiles.filter((file) => {
        if (file.size <= 10 * 1024 * 1024) return true
        wx.showToast({ title: '单张图片不能超过 10 MiB', icon: 'none' })
        return false
      })
      onSelected(files)
    },
  })
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
