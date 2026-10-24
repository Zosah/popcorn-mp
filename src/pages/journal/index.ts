import {
  DEMO_NOTE_CATEGORY_LABELS,
  type DemoJournalEntry,
  type DemoNoteCategory,
} from '../../domain/demo-journal'
import {
  listDemoImportantNotes,
  listDemoJournalMoments,
} from '../../services/demo-journal'
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
  entries: DemoJournalEntry[]
}

function buildNoteGroups(entries: DemoJournalEntry[]): DemoNoteGroup[] {
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
    entries: [] as DemoJournalEntry[],
    noteGroups: [] as DemoNoteGroup[],
    notesCount: 0,
  },

  onShow() {
    syncDemoTabBar(this, 2)
    const entries = listDemoJournalMoments()
    const notes = listDemoImportantNotes()
    this.setData({
      entries,
      noteGroups: buildNoteGroups(notes),
      notesCount: notes.length,
    })
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
