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
  quantity: string
  unit: string
  unitIndex: number
  source: string
}

const formRequestGate = createRequestGate()
let draftSequence = 0

const UNIT_OPTIONS = ['个', '克', '毫升', '捆', '包', '盒', '袋', '勺', '片', '根', '颗', '碗']
const UNCATEGORIZED_OPTION: MenuCategory = {
  id: '',
  name: '未分类',
  isSystem: true,
  sortOrder: 0,
}

function nextDraftKey(prefix: string): string {
  draftSequence += 1
  return `${prefix}-${Date.now()}-${draftSequence}`
}

function emptyIngredient(): IngredientDraft {
  return {
    key: nextDraftKey('ingredient'),
    name: '',
    quantity: '1',
    unit: UNIT_OPTIONS[0] ?? '个',
    unitIndex: 0,
    source: '',
  }
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
    defaultCategoryId: '',
    categoryOptions: [UNCATEGORIZED_OPTION] as MenuCategory[],
    categoryIndex: 0,
    image: null as MenuFormImage | null,
    imageMediaId: '',
    noteImages: [] as MenuFormImage[],
    ingredients: [emptyIngredient()] as IngredientDraft[],
    unitOptions: [...UNIT_OPTIONS],
    stepsText: '',
    form: {
      title: '',
      description: '',
      servings: '2',
      cookingMinutes: '30',
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    this.setData({ defaultCategoryId: options.categoryId ?? '' })
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
      const categoryOptions = [UNCATEGORIZED_OPTION, ...categories]
      const selectedCategoryId = recipe?.categoryId || this.data.defaultCategoryId
      const categoryIndex = Math.max(
        0,
        categoryOptions.findIndex((item) => item.id === selectedCategoryId),
      )
      this.setData({
        categoryOptions,
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
      const categoryOptions = [...this.data.categoryOptions, category]
      this.setData({
        categoryOptions,
        categoryIndex: categoryOptions.length - 1,
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

  onIngredientStep(event: {
    currentTarget: { dataset: { index?: string; delta?: string } }
  }) {
    const index = Number(event.currentTarget.dataset.index)
    const delta = Number(event.currentTarget.dataset.delta)
    if (!Number.isInteger(index) || !Number.isFinite(delta)) return
    const current = Number(this.data.ingredients[index]?.quantity)
    const next = Math.min(999, Math.max(0, (Number.isFinite(current) ? current : 1) + delta))
    this.setData({ [`ingredients[${index}].quantity`]: formatQuantity(next) })
  },

  onIngredientUnitChange(event: {
    currentTarget: { dataset: { index?: string } }
    detail: { value: string | number }
  }) {
    const index = Number(event.currentTarget.dataset.index)
    const unitIndex = Number(event.detail.value)
    const unit = this.data.unitOptions[unitIndex]
    if (!Number.isInteger(index) || !unit) return
    this.setData({
      [`ingredients[${index}].unit`]: unit,
      [`ingredients[${index}].unitIndex`]: unitIndex,
    })
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

  onStepsInput(event: { detail: { value: string } }) {
    this.setData({ stepsText: event.detail.value })
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
      .map((item) => toIngredientInput(item, this.data.unitOptions))
      .filter((item) => item.name)
    const steps = toStepInputs(this.data.stepsText)

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

    const category = this.data.categoryOptions[this.data.categoryIndex]
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
  const unitOptions = buildUnitOptions(recipe)
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
    unitOptions,
    ingredients: recipe.ingredients.length
      ? recipe.ingredients.map((item) => ingredientDraftFromRecipe(item, unitOptions))
      : [emptyIngredient()],
    stepsText: recipe.steps.map((item) => {
      const title = item.title.trim()
      const description = item.description.trim()
      if (title && description) return `${title}：${description}`
      return title || description
    }).filter(Boolean).join('\n'),
    form: {
      title: recipe.title,
      description: recipe.description,
      servings: String(recipe.servings),
      cookingMinutes: String(recipe.cookingMinutes),
    },
  }
}

function ingredientDraftFromRecipe(
  item: MenuRecipe['ingredients'][number],
  unitOptions: string[],
): IngredientDraft {
  const parsed = parseAmount(item.amount)
  return {
    key: nextDraftKey('ingredient'),
    id: item.id,
    name: item.name,
    quantity: parsed.quantity,
    unit: parsed.unit,
    unitIndex: unitOptions.indexOf(parsed.unit),
    source: item.source,
  }
}

function toIngredientInput(
  item: IngredientDraft,
  unitOptions: string[],
): MenuIngredientWriteInput {
  const unit = item.unit || unitOptions[item.unitIndex] || '个'
  const quantity = item.quantity.trim() || '1'
  return {
    ...(item.id ? { id: item.id } : {}),
    name: item.name.trim(),
    amount: `${quantity} ${unit}`.trim(),
    source: item.source.trim(),
  }
}

function toStepInputs(value: string): MenuStepWriteInput[] {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({ title: line, description: '' }))
}

function buildUnitOptions(recipe: MenuRecipe): string[] {
  const units = [...UNIT_OPTIONS]
  recipe.ingredients.forEach((item) => {
    const unit = parseAmount(item.amount).unit
    if (!units.includes(unit)) units.push(unit)
  })
  return units
}

function parseAmount(amount: string): {
  quantity: string
  unit: string
} {
  const value = amount.trim()
  if (!value) return { quantity: '1', unit: UNIT_OPTIONS[0] ?? '个' }
  const matched = value.match(/^(\d+(?:\.\d+)?)\s*(.+)?$/)
  if (!matched) {
    return { quantity: '1', unit: value }
  }
  return {
    quantity: matched[1] ?? '1',
    unit: matched[2]?.trim() || UNIT_OPTIONS[0] || '个',
  }
}

function formatQuantity(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)))
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
