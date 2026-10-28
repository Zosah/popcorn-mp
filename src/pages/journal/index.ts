import { appConfig } from '../../config/env'
import {
  DEMO_NOTE_CATEGORY_LABELS,
  type DemoNoteCategory,
} from '../../domain/demo-journal'
import { journalGateway } from '../../services/journal'
import {
  getJournalErrorMessage,
  type JournalItem,
} from '../../services/journal-gateway'
import { syncDemoTabBar } from '../../utils/demo-tab-bar'

const NOTE_CATEGORY_ORDER: DemoNoteCategory[] = ['home', 'health', 'pet', 'other']
const NOTE_CATEGORY_ICONS: Record<DemoNoteCategory, string> = {
  home: 'house',
  health: 'heart-pulse',
  pet: 'paw-print',
  other: 'file-text',
}

interface DemoNoteGroup {
  key: DemoNoteCategory
  label: string
  icon: string
  entries: JournalItem[]
}

function buildNoteGroups(entries: JournalItem[]): DemoNoteGroup[] {
  return NOTE_CATEGORY_ORDER.map((category) => ({
    key: category,
    label: DEMO_NOTE_CATEGORY_LABELS[category],
    icon: NOTE_CATEGORY_ICONS[category],
    entries: entries.filter((entry) => (entry.category ?? 'other') === category),
  })).filter((group) => group.entries.length > 0)
}

Page({
  data: {
    activeView: 'moments',
    entries: [] as JournalItem[],
    noteGroups: [] as DemoNoteGroup[],
    notesCount: 0,
    loading: true,
    loadError: '',
    syncState: appConfig.demoMode ? 'local' : 'pending',
    syncText: appConfig.demoMode ? '只在本机' : '正在同步',
  },

  onShow() {
    syncDemoTabBar(this, 2)
    void this.refresh()
  },

  async refresh() {
    this.setData({
      loading: true,
      loadError: '',
      syncState: appConfig.demoMode ? 'local' : 'pending',
      syncText: appConfig.demoMode ? '只在本机' : '正在同步',
    })
    try {
      const [moments, notes] = await Promise.all([
        journalGateway.list({ kinds: ['moment'] }),
        journalGateway.list({ kinds: ['note'] }),
      ])
      this.setData({
        entries: moments,
        noteGroups: buildNoteGroups(notes),
        notesCount: notes.length,
        loading: false,
        syncState: appConfig.demoMode ? 'local' : 'synced',
        syncText: appConfig.demoMode ? '只在本机' : '已同步',
      })
    } catch (error) {
      const message = getJournalErrorMessage(error, '生活记录暂时没有加载出来')
      this.setData({
        loading: false,
        loadError: message,
        syncState: 'pending',
        syncText: appConfig.demoMode ? '本机读取失败' : '同步失败',
      })
      if (this.data.entries.length || this.data.notesCount) {
        wx.showToast({ title: message, icon: 'none' })
      }
    }
  },

  onRetryLoad() {
    void this.refresh()
  },

  onSwitchView(event: { currentTarget: { dataset: { value: string } } }) {
    this.setData({ activeView: event.currentTarget.dataset.value })
  },

  onCreate() {
    const kind = this.data.activeView === 'notes' ? 'note' : 'moment'
    wx.navigateTo({ url: `/pages/journal-form/index?kind=${kind}` })
  },

  onOpenEntry(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/journal-detail/index?id=${encodeURIComponent(id)}` })
  },
})
