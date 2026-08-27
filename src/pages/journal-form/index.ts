import type { DemoJournalVisibility } from '../../domain/demo-journal'
import { addDemoJournalEntry } from '../../services/demo-journal'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    saving: false,
    visibility: 'space' as DemoJournalVisibility,
    form: {
      title: '',
      content: '',
    },
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

  onVisibilityChange(event: {
    currentTarget: { dataset: { value: DemoJournalVisibility } }
  }) {
    this.setData({ visibility: event.currentTarget.dataset.value })
  },

  onSave() {
    const title = this.data.form.title.trim()
    if (!title) {
      wx.showToast({ title: '先写一句标题吧', icon: 'none' })
      return
    }
    this.setData({ saving: true })
    addDemoJournalEntry({
      title,
      content: this.data.form.content,
      visibility: this.data.visibility,
    })
    wx.showToast({ title: '已经记下来了', icon: 'success' })
    navigateBackOrTab('/pages/journal/index')
  },
})
