import type { DemoJournalEntry } from '../../domain/demo-journal'
import {
  getDemoJournalEntry,
  removeDemoJournalEntry,
} from '../../services/demo-journal'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    id: '',
    entry: null as DemoJournalEntry | null,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id ?? '' })
  },

  onShow() {
    if (this.data.id) this.loadEntry()
  },

  loadEntry() {
    const entry = getDemoJournalEntry(this.data.id)
    if (!entry) {
      wx.showToast({ title: '这条记录不存在', icon: 'none' })
      navigateBackOrTab('/pages/journal/index')
      return
    }
    this.setData({ entry })
    wx.setNavigationBarTitle({
      title: entry.kind === 'note' ? '重要记录' : '记录详情',
    })
  },

  onBack() {
    navigateBackOrTab('/pages/journal/index')
  },

  onEdit() {
    if (!this.data.entry) return
    wx.navigateTo({
      url: `/pages/journal-form/index?id=${encodeURIComponent(this.data.entry.id)}`,
    })
  },

  onDelete() {
    const entry = this.data.entry
    if (!entry) return
    wx.showModal({
      title: entry.kind === 'note' ? '删除这份重要记录？' : '删除这条记录？',
      content: '删除后无法恢复，请确认不再需要它。',
      confirmText: '删除',
      confirmColor: '#e8695c',
      success: (result) => {
        if (!result.confirm) return
        const removed = removeDemoJournalEntry(entry.id)
        if (!removed) {
          wx.showToast({ title: '记录不存在', icon: 'none' })
          return
        }
        wx.showToast({ title: '记录已删除', icon: 'success' })
        navigateBackOrTab('/pages/journal/index')
      },
    })
  },
})
