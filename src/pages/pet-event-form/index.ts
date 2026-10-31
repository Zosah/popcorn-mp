import {
  PET_EVENT_LABELS,
  type PetEventType,
} from '../../domain/demo-pet'
import { PET_EVENT_ICON_NAMES } from '../../constants/icon-names'
import { getShanghaiDateOnly } from '../../domain/expiry'
import { petGateway } from '../../services/pet'
import {
  activePetFrom,
  getPetErrorMessage,
} from '../../services/pet-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'

const EVENT_TYPES = Object.entries(PET_EVENT_LABELS).map(([value, label]) => ({
  value: value as PetEventType,
  label,
}))

Page({
  data: {
    petName: '',
    petId: '',
    editingEventId: '',
    editingEventVersion: 0,
    requestedEventId: '',
    requestedType: '',
    requestedDate: '',
    loading: true,
    saving: false,
    loadErrorText: '',
    errorText: '',
    pageTitle: '记录一件事',
    saveText: '保存到时间线',
    eventTypeIndex: 0,
    eventTypeLabels: EVENT_TYPES.map((item) => item.label),
    eventTypeIconNames: EVENT_TYPES.map(
      (item) => PET_EVENT_ICON_NAMES[item.value],
    ),
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

  async onLoad(options: Record<string, string | undefined>) {
    const requestedType = options.type as PetEventType | undefined
    const requestedDate = /^\d{4}-\d{2}-\d{2}$/.test(options.date ?? '')
      ? options.date!
      : getShanghaiDateOnly(Date.now())
    this.setData({
      loading: true,
      loadErrorText: '',
      errorText: '',
      requestedEventId: options.id ?? '',
      requestedType: requestedType ?? '',
      requestedDate,
    })
    try {
      const match = options.id
        ? await petGateway.findEvent(options.id)
        : null
      let pet = match?.pet ?? null
      if (!pet) {
        const collection = await petGateway.list()
        pet = activePetFrom(collection)
      }
      if (!pet) throw new Error('还没有宠物档案')
      const editingEvent = match?.event ?? null
      const selectedType = editingEvent?.type ?? requestedType
      const eventTypeIndex = Math.max(
        0,
        EVENT_TYPES.findIndex((item) => item.value === selectedType),
      )
      const eventType = EVENT_TYPES[eventTypeIndex] ?? EVENT_TYPES[0]!
      this.setData({
        petName: pet.profile.name,
        petId: pet.profile.id,
        editingEventId: editingEvent?.id ?? '',
        editingEventVersion: editingEvent?.version ?? 0,
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
    } catch (error) {
      this.setData({
        loadErrorText: getPetErrorMessage(error, '宠物事件暂时没有加载出来'),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onRetry() {
    void this.onLoad({
      id: this.data.requestedEventId || undefined,
      type: this.data.requestedType || undefined,
      date: this.data.requestedDate || undefined,
    })
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

  async onSave() {
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
    if (!this.data.petId) {
      wx.showToast({ title: '还没有宠物档案', icon: 'none' })
      return
    }
    this.setData({ saving: true, errorText: '' })
    try {
      if (this.data.editingEventId) {
        await petGateway.updateEvent(
          this.data.petId,
          this.data.editingEventId,
          input,
          this.data.editingEventVersion,
        )
      } else {
        await petGateway.createEvent(this.data.petId, input)
      }
      wx.showToast({
        title: this.data.editingEventId ? '修改已保存' : '事件已保存',
        icon: 'success',
      })
      navigateBackOrTab('/pages/home/index')
    } catch (error) {
      const message = getPetErrorMessage(error, '宠物事件没有保存成功')
      this.setData({ errorText: message })
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
