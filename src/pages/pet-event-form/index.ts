import {
  PET_EVENT_LABELS,
  type PetEventType,
} from '../../domain/demo-pet'
import { getShanghaiDateOnly } from '../../domain/expiry'
import {
  addDemoPetEvent,
  getDemoPetEvent,
  getDemoPetState,
  updateDemoPetEvent,
} from '../../services/demo-pet'
import { navigateBackOrTab } from '../../utils/demo-navigation'

const EVENT_TYPES = Object.entries(PET_EVENT_LABELS).map(([value, label]) => ({
  value: value as PetEventType,
  label,
}))

Page({
  data: {
    petName: '',
    editingEventId: '',
    pageTitle: '记录一件事',
    saveText: '保存到时间线',
    eventTypeIndex: 0,
    eventTypeLabels: EVENT_TYPES.map((item) => item.label),
    hasNextDate: false,
    form: {
      type: 'vaccine' as PetEventType,
      occurredOn: '',
      title: '',
      note: '',
      provider: '',
      cost: '',
      nextOn: '',
    },
  },

  onLoad(options: Record<string, string | undefined>) {
    const state = getDemoPetState()
    const editingEvent = options.id ? getDemoPetEvent(options.id) : null
    const requestedType = options.type as PetEventType | undefined
    const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(options.date ?? '')
      ? options.date!
      : getShanghaiDateOnly(Date.now())
    const selectedType = editingEvent?.type ?? requestedType
    const eventTypeIndex = Math.max(
      0,
      EVENT_TYPES.findIndex((item) => item.value === selectedType),
    )
    const eventType = EVENT_TYPES[eventTypeIndex] ?? EVENT_TYPES[0]!
    this.setData({
      petName: state.profile.name,
      editingEventId: editingEvent?.id ?? '',
      pageTitle: editingEvent ? '编辑这件事' : '记录一件事',
      saveText: editingEvent ? '保存修改' : '保存到时间线',
      eventTypeIndex,
      hasNextDate: Boolean(editingEvent?.nextOn),
      form: {
        ...this.data.form,
        type: eventType.value,
        occurredOn: editingEvent?.occurredOn ?? requestedDate,
        title: editingEvent?.title ?? `${eventType.label}记录`,
        note: editingEvent?.note ?? '',
        provider: editingEvent?.provider ?? '',
        cost: editingEvent?.cost ?? '',
        nextOn: editingEvent?.nextOn ?? '',
      },
    })
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onTypeChange(event: { detail: { value: string } }) {
    const index = Number(event.detail.value)
    const option = EVENT_TYPES[index]
    if (!option) return
    this.setData({
      eventTypeIndex: index,
      'form.type': option.value,
      'form.title': `${option.label}记录`,
    })
  },

  onDateChange(event: { detail: { value: string } }) {
    this.setData({ 'form.occurredOn': event.detail.value })
  },

  onTitleInput(event: { detail: { value: string } }) {
    this.setData({ 'form.title': event.detail.value })
  },

  onNoteInput(event: { detail: { value: string } }) {
    this.setData({ 'form.note': event.detail.value })
  },

  onProviderInput(event: { detail: { value: string } }) {
    this.setData({ 'form.provider': event.detail.value })
  },

  onCostInput(event: { detail: { value: string } }) {
    this.setData({ 'form.cost': event.detail.value })
  },

  onNextToggle(event: { detail: { value: boolean } }) {
    this.setData({
      hasNextDate: event.detail.value,
      'form.nextOn': event.detail.value ? this.data.form.nextOn : '',
    })
  },

  onNextDateChange(event: { detail: { value: string } }) {
    this.setData({ 'form.nextOn': event.detail.value })
  },

  onSave() {
    const form = this.data.form
    if (!form.title.trim()) {
      wx.showToast({ title: '请填写事件标题', icon: 'none' })
      return
    }
    if (!form.occurredOn) {
      wx.showToast({ title: '请选择发生日期', icon: 'none' })
      return
    }
    if (this.data.hasNextDate && !form.nextOn) {
      wx.showToast({ title: '请选择下次日期', icon: 'none' })
      return
    }
    if (this.data.hasNextDate && form.nextOn < form.occurredOn) {
      wx.showToast({ title: '下次日期不能早于发生日期', icon: 'none' })
      return
    }
    if (form.cost && (!Number.isFinite(Number(form.cost)) || Number(form.cost) < 0)) {
      wx.showToast({ title: '请填写正确的费用', icon: 'none' })
      return
    }

    const input = {
      type: form.type,
      occurredOn: form.occurredOn,
      title: form.title,
      note: form.note,
      provider: form.provider,
      cost: form.cost,
      nextOn: this.data.hasNextDate ? form.nextOn : null,
    }
    if (this.data.editingEventId) {
      updateDemoPetEvent(this.data.editingEventId, input)
    } else {
      addDemoPetEvent(input)
    }
    wx.showToast({
      title: this.data.editingEventId ? '修改已保存' : '事件已保存',
      icon: 'success',
    })
    navigateBackOrTab('/pages/home/index')
  },
})
