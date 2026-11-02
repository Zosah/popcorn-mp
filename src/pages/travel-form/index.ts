import {
  formatTravelDuration,
  toTravelDateTimeParts,
  toTravelISO,
  travelDuration,
} from '../../domain/travel'
import { requireAuthForWrite } from '../../services/auth-preview'
import { travelGateway } from '../../services/travel'
import {
  getTravelErrorMessage,
  isTravelVersionConflict,
  type TravelTrip,
  type TravelTripWriteInput,
} from '../../services/travel-gateway'
import { decodeQueryValue } from '../../utils/app-navigation'
import { navigateBackOrTab } from '../../utils/demo-navigation'

type TravelFormMode = 'create' | 'edit' | 'copy'

interface TravelDraftItem {
  name: string
  packed: boolean
}

const EMPTY_FORM = {
  title: '',
  destination: '',
  departDate: '',
  departTime: '',
  returnDate: '',
  returnTime: '',
  note: '',
}

Page({
  data: {
    mode: 'create' as TravelFormMode,
    tripId: '',
    version: 0,
    loading: false,
    loadError: '',
    saving: false,
    pageTitle: '新建行程',
    heroTitle: '这次，想去哪里',
    durationLabel: '时间待定',
    itemInput: '',
    items: [] as TravelDraftItem[],
    form: { ...EMPTY_FORM },
  },

  onLoad(options: Record<string, string | undefined>) {
    const id = decodeQueryValue(options.id ?? '')
    const mode: TravelFormMode = options.mode === 'copy'
      ? 'copy'
      : id ? 'edit' : 'create'
    const copy = mode === 'copy'
    this.setData({
      mode,
      tripId: id,
      pageTitle: copy ? '复制行程' : mode === 'edit' ? '编辑行程' : '新建行程',
      heroTitle: copy ? '换一个时间，再出发' : mode === 'edit' ? '把行程再理顺一点' : '这次，想去哪里',
    })
    wx.setNavigationBarTitle({ title: this.data.pageTitle })
    if (id) void this.loadSource(id, copy)
  },

  async loadSource(id: string, copy: boolean) {
    this.setData({ loading: true, loadError: '' })
    try {
      const trip = await travelGateway.getTrip(id)
      if (!trip) {
        wx.showToast({ title: '这次出行已经不存在', icon: 'none' })
        navigateBackOrTab('/pages/travel/index')
        return
      }
      this.applySource(trip, copy)
    } catch (error) {
      this.setData({
        loadError: getTravelErrorMessage(error, '行程暂时没有加载出来'),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  applySource(trip: TravelTrip, copy: boolean) {
    const depart = copy ? { date: '', time: '' } : toTravelDateTimeParts(trip.departAt)
    const returnAt = copy ? { date: '', time: '' } : toTravelDateTimeParts(trip.returnAt)
    this.setData({
      version: copy ? 0 : trip.version,
      items: trip.items.map((item) => ({ name: item.name, packed: copy ? false : item.packed })),
      form: {
        title: trip.title,
        destination: trip.destination,
        departDate: depart.date,
        departTime: depart.time,
        returnDate: returnAt.date,
        returnTime: returnAt.time,
        note: trip.note,
      },
    }, () => this.syncDuration())
  },

  onRetryLoad() {
    if (!this.data.tripId) return
    void this.loadSource(this.data.tripId, this.data.mode === 'copy')
  },

  onBack() {
    navigateBackOrTab('/pages/travel/index')
  },

  onTitleInput(event: { detail: { value: string } }) {
    this.setData({ 'form.title': event.detail.value })
  },

  onDestinationInput(event: { detail: { value: string } }) {
    this.setData({ 'form.destination': event.detail.value })
  },

  onNoteInput(event: { detail: { value: string } }) {
    this.setData({ 'form.note': event.detail.value })
  },

  onDateChange(event: {
    currentTarget: { dataset: { kind?: 'depart' | 'return' } }
    detail: { value: string }
  }) {
    const kind = event.currentTarget.dataset.kind
    if (!kind) return
    this.setData({
      [kind === 'depart' ? 'form.departDate' : 'form.returnDate']: event.detail.value,
    }, () => this.syncDuration())
  },

  onTimeChange(event: {
    currentTarget: { dataset: { kind?: 'depart' | 'return' } }
    detail: { value: string }
  }) {
    const kind = event.currentTarget.dataset.kind
    if (!kind) return
    this.setData({
      [kind === 'depart' ? 'form.departTime' : 'form.returnTime']: event.detail.value,
    }, () => this.syncDuration())
  },

  syncDuration() {
    const form = this.data.form
    const departAt = toTravelISO(form.departDate, form.departTime)
    const returnAt = toTravelISO(form.returnDate, form.returnTime)
    if (!departAt || !returnAt || Date.parse(returnAt) <= Date.parse(departAt)) {
      this.setData({ durationLabel: '时间待定' })
      return
    }
    const duration = travelDuration(departAt, returnAt)
    this.setData({ durationLabel: formatTravelDuration(duration.days, duration.nights) })
  },

  onItemInput(event: { detail: { value: string } }) {
    this.setData({ itemInput: event.detail.value })
  },

  onAddItem() {
    const name = this.data.itemInput.trim()
    if (!name) return
    if (this.data.items.some((item) => item.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      wx.showToast({ title: '已经放进行李里了', icon: 'none' })
      return
    }
    if (this.data.items.length >= 100) {
      wx.showToast({ title: '最多 100 件物品', icon: 'none' })
      return
    }
    this.setData({
      items: [...this.data.items, { name, packed: false }],
      itemInput: '',
    })
  },

  onRemoveItem(event: { currentTarget: { dataset: { index?: number } } }) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index) || index < 0) return
    this.setData({
      items: this.data.items.filter((_, itemIndex) => itemIndex !== index),
    })
  },

  async onSave() {
    if (this.data.saving || this.data.loading) return
    if (!requireAuthForWrite()) return
    const form = this.data.form
    const title = form.title.trim()
    const destination = form.destination.trim()
    if (!title) {
      wx.showToast({ title: '写一下这次出行', icon: 'none' })
      return
    }
    if (!destination) {
      wx.showToast({ title: '填一下目的地', icon: 'none' })
      return
    }
    const departAt = toTravelISO(form.departDate, form.departTime)
    const returnAt = toTravelISO(form.returnDate, form.returnTime)
    if (!departAt) {
      wx.showToast({ title: '选好出发时间', icon: 'none' })
      return
    }
    if (!returnAt) {
      wx.showToast({ title: '选好返回时间', icon: 'none' })
      return
    }
    if (Date.parse(returnAt) <= Date.parse(departAt)) {
      wx.showToast({ title: '返回要晚于出发', icon: 'none' })
      return
    }
    const input: TravelTripWriteInput = {
      title,
      destination,
      departAt,
      returnAt,
      note: form.note.trim(),
      items: this.data.items.map((item) => ({ name: item.name, packed: item.packed })),
    }
    this.setData({ saving: true })
    try {
      if (this.data.mode === 'edit') {
        await travelGateway.updateTrip(this.data.tripId, input, this.data.version)
        wx.showToast({ title: '行程已更新', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 260)
        return
      }
      const created = await travelGateway.createTrip(input)
      wx.showToast({ title: this.data.mode === 'copy' ? '复制好了' : '行程已建好', icon: 'none' })
      wx.redirectTo({
        url: `/pages/travel-detail/index?id=${encodeURIComponent(created.id)}`,
      })
    } catch (error) {
      const message = isTravelVersionConflict(error)
        ? '行程已在别处更新，返回详情刷新后再试'
        : getTravelErrorMessage(error, '行程没有保存成功')
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },
})
