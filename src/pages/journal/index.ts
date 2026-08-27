import type { DemoJournalEntry } from '../../domain/demo-journal'
import { listDemoJournalEntries } from '../../services/demo-journal'
import { syncDemoTabBar } from '../../utils/demo-tab-bar'

Page({
  data: {
    activeView: 'moments',
    entries: [] as DemoJournalEntry[],
  },

  onShow() {
    syncDemoTabBar(this, 2)
    this.setData({ entries: listDemoJournalEntries() })
  },

  onSwitchView(event: { currentTarget: { dataset: { value: string } } }) {
    this.setData({ activeView: event.currentTarget.dataset.value })
  },

  onCreate() {
    wx.navigateTo({ url: '/pages/journal-form/index' })
  },

  onOpenNote(event: { currentTarget: { dataset: { title: string } } }) {
    wx.showModal({
      title: event.currentTarget.dataset.title,
      content: '这是重要记录的前端预览。正式版本会支持正文、附件、标签与独立可见范围。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
