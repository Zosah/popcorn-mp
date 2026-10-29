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
import { createRequestGate } from '../../utils/request-control'

const NOTE_CATEGORY_ORDER: DemoNoteCategory[] = ['home', 'health', 'pet', 'other']
const NOTE_CATEGORY_ICONS: Record<DemoNoteCategory, string> = {
  home: 'house',
  health: 'heart-pulse',
  pet: 'paw-print',
  other: 'file-text',
}

const journalRequestGate = createRequestGate()

interface DemoNoteGroup {
  key: DemoNoteCategory
  label: string
  icon: string
  entries: JournalItem[]
}

interface JournalFilterView {
  key: 'moments' | DemoNoteCategory
  label: string
  count: number
}

const NOTE_CATEGORY_LABELS: Record<DemoNoteCategory, string> = {
  ...DEMO_NOTE_CATEGORY_LABELS,
  other: '其他资料',
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
    visibleNoteGroups: [] as DemoNoteGroup[],
    notesCount: 0,
    activeFilter: 'moments' as 'moments' | DemoNoteCategory,
    filterOptions: [] as JournalFilterView[],
    loading: true,
    loadError: '',
    syncState: appConfig.demoMode ? 'local' : 'pending',
    syncText: appConfig.demoMode ? '只在本机' : '正在同步',
  },

  onShow() {
    void this.refresh()
  },

  async refresh() {
    const sequence = journalRequestGate.begin()
    const hasExistingData = this.data.entries.length > 0 || this.data.notesCount > 0
    this.setData({
      loading: !hasExistingData,
      loadError: '',
      syncState: appConfig.demoMode ? 'local' : 'pending',
      syncText: appConfig.demoMode ? '只在本机' : '正在同步',
    })
    try {
      const [moments, notes] = await Promise.all([
        journalGateway.list({ kinds: ['moment'] }),
        journalGateway.list({ kinds: ['note'] }),
      ])
      if (!journalRequestGate.isCurrent(sequence)) return
      const noteGroups = buildNoteGroups(notes)
      const filterOptions: JournalFilterView[] = [
        { key: 'moments', label: '生活点滴', count: moments.length },
        ...NOTE_CATEGORY_ORDER.map((category) => ({
          key: category,
          label: NOTE_CATEGORY_LABELS[category],
          count: notes.filter((entry) => (entry.category ?? 'other') === category).length,
        })),
      ]
      this.setData({
        entries: moments,
        noteGroups,
        visibleNoteGroups: noteGroups,
        notesCount: notes.length,
        filterOptions,
        loading: false,
        syncState: appConfig.demoMode ? 'local' : 'synced',
        syncText: appConfig.demoMode ? '只在本机' : '已同步',
      })
    } catch (error) {
      if (!journalRequestGate.isCurrent(sequence)) return
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

  onSelectFilter(event: {
    currentTarget: { dataset: { value?: 'moments' | DemoNoteCategory } }
  }) {
    const value = event.currentTarget.dataset.value
    if (!value) return
    if (value === 'moments') {
      this.setData({
        activeView: 'moments',
        activeFilter: value,
        visibleNoteGroups: this.data.noteGroups,
      })
      return
    }
    this.setData({
      activeView: 'notes',
      activeFilter: value,
      visibleNoteGroups: this.data.noteGroups.filter((group) => group.key === value),
    })
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

  onUnload() {
    journalRequestGate.invalidate()
  },
})
