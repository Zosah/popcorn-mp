import {
  PET_EVENT_LABELS,
  type DemoPetEvent,
} from '../../domain/demo-pet'
import { PET_EVENT_ICON_NAMES } from '../../constants/icon-names'
import { petGateway } from '../../services/pet'
import { getPetErrorMessage } from '../../services/pet-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'

Page({
  data: {
    eventId: '',
    petId: '',
    petName: '',
    typeLabel: '',
    iconName: 'heart-pulse',
    event: null as DemoPetEvent | null,
    loading: true,
    loaded: false,
    deleting: false,
    errorText: '',
  },

  onLoad(options: Record<string, string | undefined>) {
    this.setData({ eventId: options.id ?? '' }, () => void this.loadEvent())
  },

  onShow() {
    if (this.data.eventId && this.data.loaded) void this.loadEvent()
  },

  async loadEvent() {
    if (!this.data.eventId) {
      this.setData({
        loading: false,
        loaded: true,
        errorText: '缺少事件编号，请返回重试',
      })
      return
    }
    this.setData({ loading: true, errorText: '' })
    try {
      const match = await petGateway.findEvent(this.data.eventId)
      if (!match) {
        this.setData({
          event: null,
          errorText: '这条事件已经不存在',
        })
        return
      }
      this.setData({
        petId: match.pet.profile.id,
        petName: match.pet.profile.name,
        typeLabel: PET_EVENT_LABELS[match.event.type],
        iconName: PET_EVENT_ICON_NAMES[match.event.type],
        event: match.event,
      })
    } catch (error) {
      this.setData({
        errorText: getPetErrorMessage(error, '宠物事件暂时没有加载出来'),
      })
    } finally {
      this.setData({ loading: false, loaded: true })
    }
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onEdit() {
    wx.navigateTo({
      url: `/pages/pet-event-form/index?id=${this.data.eventId}`,
    })
  },

  onRetry() {
    void this.loadEvent()
  },

  onDelete() {
    if (!this.data.event || this.data.deleting) return
    wx.showModal({
      title: '删除这条事件？',
      content: '删除后，时间线和月历中的这条记录会同时消失。',
      confirmText: '删除',
      confirmColor: '#e8695c',
      success: (result) => {
        if (!result.confirm) return
        void this.deleteEvent()
      },
    })
  },

  async deleteEvent() {
    const event = this.data.event
    if (!event || !this.data.petId) return
    this.setData({ deleting: true, errorText: '' })
    try {
      await petGateway.removeEvent(
        this.data.petId,
        event.id,
        event.version ?? 1,
      )
      wx.showToast({ title: '事件已删除', icon: 'success' })
      navigateBackOrTab('/pages/home/index')
    } catch (error) {
      this.setData({
        errorText: getPetErrorMessage(error, '宠物事件没有删除成功'),
      })
    } finally {
      this.setData({ deleting: false })
    }
  },
})
