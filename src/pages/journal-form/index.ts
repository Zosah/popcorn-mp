import { appConfig } from '../../config/env'
import {
  DEMO_NOTE_CATEGORY_LABELS,
  MAX_JOURNAL_IMAGES,
  type DemoJournalEntryInput,
  type DemoJournalImage,
  type DemoJournalKind,
  type DemoJournalVisibility,
  type DemoNoteCategory,
} from '../../domain/demo-journal'
import { journalGateway } from '../../services/journal'
import { mediaGateway } from '../../services/media'
import {
  getJournalErrorMessage,
  isJournalVersionConflict,
} from '../../services/journal-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { showMediaUploadError } from '../../utils/media-error'

const NOTE_CATEGORY_OPTIONS = Object.entries(DEMO_NOTE_CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as DemoNoteCategory, label }),
)

Page({
  data: {
    saving: false,
    loading: false,
    imageUploading: false,
    uploadProgress: '',
    loadError: '',
    editingEntryId: '',
    version: 0,
    kind: 'moment' as DemoJournalKind,
    pageTitle: '今天，想记下什么？',
    pageCopy: '不用写得完整，一句话也能把这个瞬间留下来。',
    saveText: '把这一刻记下来',
    storageCopy: appConfig.demoMode
      ? '内容只保存在这台手机。'
      : '保存后会同步给当前空间里的成员。',
    category: 'home' as DemoNoteCategory,
    categoryIndex: 0,
    categoryLabels: NOTE_CATEGORY_OPTIONS.map((item) => item.label),
    visibility: 'space' as DemoJournalVisibility,
    images: [] as DemoJournalImage[],
    form: {
      title: '',
      content: '',
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = options.id ?? ''
    if (id) {
      this.setData({
        editingEntryId: id,
        loading: true,
        pageTitle: '把这段记录找回来',
        saveText: '保存修改',
      })
      wx.setNavigationBarTitle({ title: '编辑记录' })
      void this.loadEntry(id)
      return
    }

    const kind: DemoJournalKind = options.kind === 'note' ? 'note' : 'moment'
    this.applyKind(kind, false)
  },

  async loadEntry(id: string) {
    this.setData({ loading: true, loadError: '' })
    try {
      const entry = await journalGateway.get(id)
      if (!entry) {
        wx.showToast({ title: '这条记录不存在', icon: 'none' })
        navigateBackOrTab('/pages/journal/index')
        return
      }

      const category = entry.category ?? 'home'
      const categoryIndex = Math.max(
        0,
        NOTE_CATEGORY_OPTIONS.findIndex((item) => item.value === category),
      )
      this.setData({
        editingEntryId: entry.id,
        version: entry.version,
        category,
        categoryIndex,
        visibility: entry.visibility,
        images: entry.images?.length ? entry.images : entry.image ? [entry.image] : [],
        form: {
          title: entry.title,
          content: entry.content,
        },
      })
      this.applyKind(entry.kind, true)
      wx.setNavigationBarTitle({
        title: entry.kind === 'note' ? '编辑重要记录' : '编辑记录',
      })
    } catch (error) {
      this.setData({
        loadError: getJournalErrorMessage(error, '这条记录暂时没有加载出来'),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onRetryLoad() {
    if (this.data.editingEntryId) void this.loadEntry(this.data.editingEntryId)
  },

  applyKind(kind: DemoJournalKind, editing: boolean) {
    const isNote = kind === 'note'
    const pageTitle = editing
      ? isNote
        ? '把这份记录，再写清楚一点'
        : '把这一刻，再写清楚一点'
      : isNote
        ? '把重要的事，收在这里'
        : '今天，想记下什么？'
    const pageCopy = isNote
      ? '写下需要长期保存的信息，之后仍可以修改或删除。'
      : '不用写得完整，一句话也能把这个瞬间留下来。'
    this.setData({
      kind,
      pageTitle,
      pageCopy,
      saveText: editing ? '保存修改' : isNote ? '保存重要记录' : '把这一刻记下来',
    })
    wx.setNavigationBarTitle({
      title: editing ? (isNote ? '编辑重要记录' : '编辑记录') : isNote ? '存一份' : '记一下',
    })
  },

  onBack() {
    navigateBackOrTab('/pages/journal/index')
  },

  onTitleInput(event: { detail: { value: string } }) {
    this.setData({ 'form.title': event.detail.value })
  },

  onContentInput(event: { detail: { value: string } }) {
    this.setData({ 'form.content': event.detail.value })
  },

  onChooseImage() {
    if (this.data.imageUploading) return
    const remaining = MAX_JOURNAL_IMAGES - this.data.images.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多添加 9 张图片', icon: 'none' })
      return
    }
    wx.chooseMedia({
      count: remaining,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const files = result.tempFiles.filter((file) => file.size <= 10 * 1024 * 1024)
        if (files.length !== result.tempFiles.length) {
          wx.showToast({ title: '图片不能超过 10 MiB', icon: 'none' })
        }
        if (files.length) void this.uploadImages(files)
      },
    })
  },

  async uploadImages(files: Array<{ tempFilePath: string; size: number }>) {
    this.setData({ imageUploading: true, uploadProgress: `正在上传 1/${files.length}` })
    let firstError: unknown
    try {
      for (const [index, file] of files.entries()) {
        this.setData({ uploadProgress: `正在上传 ${index + 1}/${files.length}` })
        try {
          const asset = await mediaGateway.upload(file.tempFilePath, 'journal', file.size)
          this.setData({
            images: [...this.data.images, {
              mediaId: asset.id,
              src: asset.display.url,
              thumbSrc: asset.thumb.url,
              caption: '',
            }].slice(0, MAX_JOURNAL_IMAGES),
          })
        } catch (error) {
          firstError ??= error
        }
      }
      if (firstError) {
        showMediaUploadError(firstError, '有图片没有上传成功')
      }
    } finally {
      this.setData({ imageUploading: false, uploadProgress: '' })
    }
  },

  onImageCaptionInput(event: { detail: { value: string } }) {
    if (!this.data.images.length) return
    const images = [...this.data.images]
    const primaryImage = images[0]
    if (!primaryImage) return
    images[0] = {
      ...primaryImage,
      caption: event.detail.value.slice(0, 120),
    }
    this.setData({ images })
  },

  onRemoveImage(event: { currentTarget: { dataset: { index?: string | number } } }) {
    if (this.data.imageUploading) return
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0) return
    this.setData({ images: this.data.images.filter((_, imageIndex) => imageIndex !== index) })
  },

  onPreviewImage(event: { currentTarget: { dataset: { index?: string | number } } }) {
    const index = Number(event.currentTarget.dataset.index ?? 0)
    const images = this.data.images
    const urls = images.map((image) => image.src || image.thumbSrc || '').filter(Boolean)
    if (!urls.length) return
    const selected = images[index]
    const current = selected?.src || selected?.thumbSrc || urls[0]
    wx.previewImage({ current, urls })
  },

  onCategoryChange(event: { detail: { value: string } }) {
    const categoryIndex = Number(event.detail.value)
    const option = NOTE_CATEGORY_OPTIONS[categoryIndex]
    if (!option) return
    this.setData({ categoryIndex, category: option.value })
  },

  onVisibilityChange(event: {
    currentTarget: { dataset: { value: DemoJournalVisibility } }
  }) {
    this.setData({ visibility: event.currentTarget.dataset.value })
  },

  async onSave() {
    if (
      this.data.saving ||
      this.data.imageUploading ||
      this.data.loading ||
      this.data.loadError
    ) return
    const title = this.data.form.title.trim()
    if (!title) {
      wx.showToast({ title: '先写一句标题吧', icon: 'none' })
      return
    }
    if (title.length > 80) {
      wx.showToast({ title: '标题最多 80 个字符', icon: 'none' })
      return
    }
    if (this.data.form.content.trim().length > 5000) {
      wx.showToast({ title: '正文最多 5000 个字符', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    const input: DemoJournalEntryInput = {
      title,
      content: this.data.form.content,
      visibility: this.data.visibility,
      kind: this.data.kind,
      imageMediaId: this.data.images[0]?.mediaId ?? '',
      imageCaption: this.data.images[0]?.caption ?? '',
      images: this.data.images,
      ...(this.data.kind === 'note' ? { category: this.data.category } : {}),
    }
    try {
      if (this.data.editingEntryId) {
        await journalGateway.update(
          this.data.editingEntryId,
          input,
          this.data.version,
        )
      } else {
        await journalGateway.create(input)
      }
      wx.showToast({
        title: this.data.editingEntryId ? '修改已保存' : '已经记下来了',
        icon: 'success',
      })
      navigateBackOrTab('/pages/journal/index')
    } catch (error) {
      if (isJournalVersionConflict(error) && this.data.editingEntryId) {
        wx.showToast({ title: '记录已更新，已加载最新版本', icon: 'none' })
        await this.loadEntry(this.data.editingEntryId)
      } else {
        wx.showToast({
          title: getJournalErrorMessage(error, '保存失败，请稍后再试'),
          icon: 'none',
        })
      }
    } finally {
      this.setData({ saving: false })
    }
  },
})
