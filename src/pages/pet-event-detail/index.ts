import { PET_EVENT_LABELS } from '../../domain/demo-pet'
import {
  getDemoPetEvent,
  getDemoPetState,
  removeDemoPetEvent,
} from '../../services/demo-pet'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    eventId: '',
    petName: '',
    typeLabel: '',
    event: null as ReturnType<typeof getDemoPetEvent>,
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ eventId: options.id ?? '' }, () => this.loadEvent())
  },

  onShow() {
    if (this.data.eventId) this.loadEvent()
  },

  loadEvent() {
    const event = getDemoPetEvent(this.data.eventId)
    if (!event) {
      wx.showToast({ title: '这条事件不存在', icon: 'none' })
      return
    }
    this.setData({
      petName: getDemoPetState().profile.name,
      typeLabel: PET_EVENT_LABELS[event.type],
      event,
    })
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onEdit() {
    wx.navigateTo({
      url: `/pages/pet-event-form/index?id=${this.data.eventId}`,
    })
  },

  onDelete() {
    wx.showModal({
      title: '删除这条事件？',
      content: '删除后，时间线和月历中的这条记录会同时消失。',
      confirmText: '删除',
      confirmColor: '#e76f65',
      success: (result) => {
        if (!result.confirm) return
        removeDemoPetEvent(this.data.eventId)
        wx.showToast({ title: '事件已删除', icon: 'success' })
        navigateBackOrTab('/pages/home/index')
      },
    })
  },
})
