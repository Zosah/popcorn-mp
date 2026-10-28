import { appConfig } from '../../config/env'
import {
  DEMO_NOTE_CATEGORY_LABELS,
  type DemoJournalEntryInput,
  type DemoJournalImage,
  type DemoJournalKind,
  type DemoJournalVisibility,
  type DemoNoteCategory,
} from '../../domain/demo-journal'
import { journalGateway } from '../../services/journal'
import { mediaGateway } from '../../services/media'
import { getMediaErrorMessage } from '../../services/media-gateway'
import {
  getJournalErrorMessage,
  isJournalVersionConflict,
} from '../../services/journal-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'

const NOTE_CATEGORY_OPTIONS = Object.entries(DEMO_NOTE_CATEGORY_LABELS).map(
  ([value, label]) => ({ value: value as DemoNoteCategory, label }),
)

Page({
  data: {
    saving: false,
    loading: false,
    imageUploading: false,
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
    image: null as DemoJournalImage | null,
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
        image: entry.image ?? null,
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
      const asset = await mediaGateway.upload(filePath, 'journal', fileSize)
      this.setData({
        image: {
          mediaId: asset.id,
          src: asset.display.url,
          thumbSrc: asset.thumb.url,
          caption: this.data.image?.caption ?? '',
        },
      })
      wx.showToast({ title: '图片已准备好', icon: 'success' })
    } catch (error) {
      wx.showToast({
        title: getMediaErrorMessage(error, '图片上传没有完成'),
        icon: 'none',
      })
    } finally {
      this.setData({ imageUploading: false })
    }
  },

  onImageCaptionInput(event: { detail: { value: string } }) {
    if (!this.data.image) return
    this.setData({ 'image.caption': event.detail.value.slice(0, 120) })
  },

  onRemoveImage() {
    if (this.data.imageUploading) return
    this.setData({ image: null })
  },

  onPreviewImage() {
    const src = this.data.image?.src
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
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
      imageMediaId: this.data.image?.mediaId ?? '',
      imageCaption: this.data.image?.caption ?? '',
      ...(this.data.kind === 'note' ? { category: this.data.category } : {}),
      ...(this.data.image ? { image: this.data.image } : {}),
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
