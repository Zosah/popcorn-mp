import { appConfig } from '../../config/env'
import type { JournalItem } from '../../services/journal-gateway'
import {
  getJournalErrorMessage,
  isJournalVersionConflict,
} from '../../services/journal-gateway'
import { journalGateway } from '../../services/journal'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    id: '',
    entry: null as JournalItem | null,
    loading: true,
    loadError: '',
    deleting: false,
    syncState: appConfig.demoMode ? 'local' : 'pending',
    syncText: appConfig.demoMode ? '只在本机' : '空间同步',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ id: options.id ?? '' })
  },

  onShow() {
    if (this.data.id) void this.loadEntry()
  },

  async loadEntry() {
    this.setData({ loading: true, loadError: '' })
    try {
      const entry = await journalGateway.get(this.data.id)
      if (!entry) {
        wx.showToast({ title: '这条记录不存在', icon: 'none' })
        navigateBackOrTab('/pages/journal/index')
        return
      }
      this.setData({
        entry,
        syncState: appConfig.demoMode ? 'local' : 'synced',
        syncText: appConfig.demoMode ? '只在本机' : '空间同步',
      })
      wx.setNavigationBarTitle({
        title: entry.kind === 'note' ? '重要记录' : '记录详情',
      })
    } catch (error) {
      this.setData({
        loadError: getJournalErrorMessage(error, '这条记录暂时没有加载出来'),
        syncState: 'pending',
        syncText: appConfig.demoMode ? '本机读取失败' : '同步失败',
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onRetryLoad() {
    void this.loadEntry()
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
    if (!entry || this.data.deleting) return
    wx.showModal({
      title: entry.kind === 'note' ? '删除这份重要记录？' : '删除这条记录？',
      content: '删除后无法恢复，请确认不再需要它。',
      confirmText: '删除',
      confirmColor: '#e8695c',
      success: (result) => {
        if (result.confirm) void this.deleteEntry(entry.id, entry.version)
      },
    })
  },

  async deleteEntry(id: string, version: number) {
    if (this.data.deleting) return
    this.setData({ deleting: true })
    try {
      await journalGateway.remove(id, version)
      wx.showToast({ title: '记录已删除', icon: 'success' })
      navigateBackOrTab('/pages/journal/index')
    } catch (error) {
      if (isJournalVersionConflict(error)) {
        wx.showToast({ title: '记录已更新，已加载最新版本', icon: 'none' })
        await this.loadEntry()
      } else {
        wx.showToast({
          title: getJournalErrorMessage(error, '删除没有完成'),
          icon: 'none',
        })
      }
    } finally {
      this.setData({ deleting: false })
    }
  },
})
