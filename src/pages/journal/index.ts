import { pullRefreshBehavior } from '../../utils/pull-refresh'
import { appConfig } from '../../config/env'
import {
  DEMO_NOTE_CATEGORY_LABELS,
  type DemoNoteCategory,
} from '../../domain/demo-journal'
import { journalGateway } from '../../services/journal'
import { hydrateAuthState } from '../../services/auth'
import { promptAuthGateIfNeeded, requireAuthForWrite } from '../../services/auth-preview'
import { readPageCache, writePageCache as persistPageCache } from '../../services/page-cache'
import {
  getJournalErrorMessage,
  type JournalItem,
} from '../../services/journal-gateway'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

const NOTE_CATEGORY_ORDER: DemoNoteCategory[] = ['home', 'health', 'pet', 'other']
const NOTE_CATEGORY_ICONS: Record<DemoNoteCategory, string> = {
  home: 'journal-note-home',
  health: 'journal-note-health',
  pet: 'journal-note-pet',
  other: 'journal-note-other',
}

const journalRequestGate = createRequestGate()
const JOURNAL_PAGE_CACHE_KEY = 'journal:overview'
/** 同一条记录在一次页面生命周期内只重新换取一次签名地址，避免失败循环。 */
const retriedImageEntries = new Set<string>()

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

/** 签名地址失效时清空该图地址，让列表回退到 system-image 占位而不是裂图。 */
function removeEntryImageUrls(entry: JournalItem, index: number): JournalItem {
  const images = [...(entry.images ?? [])]
  const current = images[index]
  if (!current) return entry
  images[index] = { ...current, src: '', thumbSrc: '' }
  return { ...entry, images, image: index === 0 ? images[0] : entry.image }
}

Page({
  behaviors: [pullRefreshBehavior],
  data: {
    activeView: 'moments',
    activeSection: 'moments' as 'moments' | 'notes',
    entries: [] as JournalItem[],
    noteGroups: [] as DemoNoteGroup[],
    visibleNoteGroups: [] as DemoNoteGroup[],
    notesCount: 0,
    activeFilter: 'moments' as 'moments' | DemoNoteCategory,
    filterOptions: [] as JournalFilterView[],
    loading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    loadError: '',
    syncState: appConfig.demoMode ? 'local' : 'pending',
    syncText: appConfig.demoMode ? '只在本机' : '正在同步',
  },

  onLoad() {
    const cached = readPageCache<Record<string, unknown>>(JOURNAL_PAGE_CACHE_KEY)
    if (cached) {
      this.setData({
        ...cached.value,
        loading: false,
        hasLoaded: true,
        cacheFresh: cached.fresh,
        hasShown: false,
      })
      // 旧缓存里可能还留着已下线的「全部」，统一回落到生活点滴。
      if ((cached.value as { activeSection?: unknown }).activeSection === 'all') {
        this.setData({ activeSection: 'moments', activeView: 'moments' })
      }
    }
  },

  onShow() {
    promptAuthGateIfNeeded()
    const firstShow = !this.data.hasShown
    if (firstShow) this.setData({ hasShown: true })
    if (firstShow && this.data.cacheFresh) return
    void this.refresh()
  },

  onPullRefreshTask() {
    void this.refresh(true)
  },

  async refresh(fromPullDown = false) {
    const sequence = journalRequestGate.begin()
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    const auth = await hydrateAuthState()
    if (!journalRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    if (!appConfig.demoMode && !auth.isLoggedIn) {
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.setData({
        entries: [],
        noteGroups: [],
        visibleNoteGroups: [],
        notesCount: 0,
        filterOptions: [],
        loading: false,
        hasLoaded: true,
        cacheFresh: false,
        loadError: '',
        syncState: 'local',
        syncText: '登录后同步',
      })
      if (fromPullDown) wx.stopPullDownRefresh()
      promptAuthGateIfNeeded()
      return
    }
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
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!journalRequestGate.isCurrent(sequence)) return
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
        hasLoaded: true,
        cacheFresh: true,
        syncState: appConfig.demoMode ? 'local' : 'synced',
        syncText: appConfig.demoMode ? '只在本机' : '已同步',
      }, () => this.cacheCurrentPage())
    } catch (error) {
      if (!journalRequestGate.isCurrent(sequence)) return
      const message = getJournalErrorMessage(error, '生活记录暂时没有加载出来')
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!journalRequestGate.isCurrent(sequence)) return
      this.setData({
        loading: false,
        hasLoaded: true,
        loadError: message,
        syncState: 'pending',
        syncText: appConfig.demoMode ? '本机读取失败' : '同步失败',
      })
      if (this.data.entries.length || this.data.notesCount) {
        wx.showToast({ title: message, icon: 'none' })
      }
    } finally {
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  cacheCurrentPage() {
    const data = this.data as unknown as Record<string, unknown>
    const {
      loading: _loading,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      ...snapshot
    } = data
    persistPageCache(JOURNAL_PAGE_CACHE_KEY, snapshot)
  },

  onRetryLoad() {
    void this.refresh()
  },

  onSwitchView(event: { currentTarget: { dataset: { value: string } } }) {
    this.setData({ activeView: event.currentTarget.dataset.value })
  },

  onSelectSection(event: {
    currentTarget: { dataset: { value?: 'moments' | 'notes' } }
  }) {
    const value = event.currentTarget.dataset.value
    if (!value) return
    if (value === 'notes') {
      this.setData({
        activeSection: value,
        activeView: 'notes',
        visibleNoteGroups: this.data.noteGroups,
      })
      return
    }
    this.setData({
      activeSection: 'moments',
      activeView: 'moments',
      activeFilter: 'moments',
      visibleNoteGroups: this.data.noteGroups,
    })
  },

  onSelectFilter(event: {
    currentTarget: { dataset: { value?: 'moments' | DemoNoteCategory } }
  }) {
    const value = event.currentTarget.dataset.value
    if (!value) return
    if (value === 'moments') {
      this.setData({
        activeSection: 'moments',
        activeView: 'moments',
        activeFilter: value,
        visibleNoteGroups: this.data.noteGroups,
      })
      return
    }
    this.setData({
      activeSection: 'notes',
      activeView: 'notes',
      activeFilter: value,
      visibleNoteGroups: this.data.noteGroups.filter((group) => group.key === value),
    })
  },

  onCreate() {
    if (!requireAuthForWrite()) return
    const kind = this.data.activeView === 'notes' ? 'note' : 'moment'
    wx.navigateTo({ url: `/pages/journal-form/index?kind=${kind}` })
  },

  onOpenEntry(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/journal-detail/index?id=${encodeURIComponent(id)}` })
  },

  onPreviewEntryImage(event: {
    currentTarget: { dataset: { entryId?: string; imageIndex?: string | number } }
  }) {
    const entryId = event.currentTarget.dataset.entryId
    const imageIndex = Number(event.currentTarget.dataset.imageIndex ?? 0)
    if (!entryId || !Number.isInteger(imageIndex) || imageIndex < 0) return

    let entry = this.data.entries.find((item) => item.id === entryId)
    if (!entry) {
      for (const group of this.data.noteGroups) {
        entry = group.entries.find((item) => item.id === entryId)
        if (entry) break
      }
    }
    if (!entry) return

    const images = entry.images?.length ? entry.images : entry.image ? [entry.image] : []
    const urls = images.map((image) => image.src || image.thumbSrc || '').filter(Boolean)
    if (!urls.length) return
    const selected = images[imageIndex]
    const current = selected?.src || selected?.thumbSrc || urls[0]
    wx.previewImage({ current, urls })
  },

  onEntryAvatarError(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    // 头像地址失效时回退到昵称首字，不留白色空白。
    this.patchEntry(id, (entry) => ({ ...entry, authorAvatarUrl: '' }))
  },

  async onEntryImageError(event: {
    currentTarget: { dataset: { entryId?: string; imageIndex?: string | number } }
  }) {
    const entryId = event.currentTarget.dataset.entryId
    const imageIndex = Number(event.currentTarget.dataset.imageIndex ?? -1)
    if (!entryId || !Number.isInteger(imageIndex) || imageIndex < 0) return
    // 先按记录 ID 重新换取一次短时签名地址；仍失败则回退 system-image 占位。
    if (!retriedImageEntries.has(entryId)) {
      retriedImageEntries.add(entryId)
      try {
        const fresh = await journalGateway.get(entryId)
        if (fresh) {
          this.patchEntry(entryId, () => fresh)
          return
        }
      } catch {
        // 刷新失败不打断列表浏览，继续走占位回退。
      }
    }
    this.patchEntry(entryId, (entry) => removeEntryImageUrls(entry, imageIndex))
  },

  patchEntry(entryId: string, patch: (entry: JournalItem) => JournalItem) {
    const apply = (entry: JournalItem) => (entry.id === entryId ? patch(entry) : entry)
    const patchGroup = (group: DemoNoteGroup) => ({
      ...group,
      entries: group.entries.map(apply),
    })
    this.setData({
      entries: this.data.entries.map(apply),
      noteGroups: this.data.noteGroups.map(patchGroup),
      visibleNoteGroups: this.data.visibleNoteGroups.map(patchGroup),
    })
  },

  onUnload() {
    journalRequestGate.invalidate()
    retriedImageEntries.clear()
  },
})
