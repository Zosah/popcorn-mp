import {
  buildPetCalendar,
  buildPetCareCards,
  PET_EVENT_LABELS,
  shiftPetCalendarMonth,
  type DemoPetEvent,
} from '../../domain/demo-pet'
import { PET_EVENT_ICON_NAMES } from '../../constants/icon-names'
import { getShanghaiDateOnly } from '../../domain/expiry'
import { petGateway } from '../../services/pet'
import { activePetFrom, getPetErrorMessage } from '../../services/pet-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'

interface CalendarEventView {
  id: string
  eventId: string
  date: string
  title: string
  typeLabel: string
  iconName: string
  kindLabel: string
}

Page({
  data: {
    petName: '',
    yearMonth: '',
    monthLabel: '',
    weekdays: ['日', '一', '二', '三', '四', '五', '六'],
    cells: [] as Array<ReturnType<typeof buildPetCalendar>[number]>,
    selectedDate: '',
    selectedEvents: [] as CalendarEventView[],
    calendarEvents: [] as CalendarEventView[],
    loading: true,
    errorText: '',
  },

  onLoad() {
    const today = getShanghaiDateOnly(Date.now())
    this.setData(
      { yearMonth: today.slice(0, 7), selectedDate: today },
      () => { void this.loadCalendar() },
    )
  },

  onShow() {
    if (this.data.yearMonth) void this.loadCalendar()
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onPreviousMonth() {
    this.setData(
      { yearMonth: shiftPetCalendarMonth(this.data.yearMonth, -1) },
      () => { void this.loadCalendar(false) },
    )
  },

  onNextMonth() {
    this.setData(
      { yearMonth: shiftPetCalendarMonth(this.data.yearMonth, 1) },
      () => { void this.loadCalendar(false) },
    )
  },

  onSelectDate(event: { currentTarget: { dataset: { date: string } } }) {
    const selectedDate = event.currentTarget.dataset.date
    this.setData({
      selectedDate,
      selectedEvents: this.data.calendarEvents.filter(
        (item) => item.date === selectedDate,
      ),
    })
  },

  onAddEvent() {
    wx.navigateTo({
      url: `/pages/pet-event-form/index?date=${this.data.selectedDate}`,
    })
  },

  onOpenEvent(event: { currentTarget: { dataset: { id: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/pet-event-detail/index?id=${id}` })
  },

  async loadCalendar(keepSelection = true) {
    this.setData({ loading: true, errorText: '' })
    try {
      const collection = await petGateway.list()
      const state = activePetFrom(collection)
      if (!state) {
        this.setData({ loading: false, errorText: '还没有宠物档案' })
        return
      }
      const today = getShanghaiDateOnly(Date.now())
      const actualEvents: CalendarEventView[] = state.events.map((event) => ({
        id: event.id,
        eventId: event.id,
        date: event.occurredOn,
        title: event.title,
        typeLabel: PET_EVENT_LABELS[event.type],
        iconName: PET_EVENT_ICON_NAMES[event.type],
        kindLabel: '已记录',
      }))
      const plannedEvents: CalendarEventView[] = state.events
        .filter((event) => event.nextOn)
        .map((event) => ({
          id: `${event.id}-next`,
          eventId: event.id,
          date: event.nextOn!,
          title: `下次${PET_EVENT_LABELS[event.type]}`,
          typeLabel: PET_EVENT_LABELS[event.type],
          iconName: PET_EVENT_ICON_NAMES[event.type],
          kindLabel: '计划',
        }))
      const careEvents: CalendarEventView[] = buildPetCareCards(
        state.events,
        today,
      )
        .filter(
          (item) =>
            item.nextOn &&
            !state.events.some(
              (event) => event.type === item.type && event.nextOn === item.nextOn,
            ),
        )
        .map((item) => ({
          id: `care-${item.type}`,
          eventId: '',
          date: item.nextOn!,
          title: item.title,
          typeLabel: '周期照护',
          iconName: PET_EVENT_ICON_NAMES[item.type],
          kindLabel: '自动推算',
        }))
      const calendarEvents = [...actualEvents, ...plannedEvents, ...careEvents]
      const eventDates: DemoPetEvent[] = calendarEvents.map((item) => ({
        id: item.id,
        type: 'outing',
        occurredOn: item.date,
        title: item.title,
        note: '',
        createdAt: '',
      }))
      const [year, month] = this.data.yearMonth.split('-').map(Number)
      const selectedDate = keepSelection
        ? this.data.selectedDate
        : `${this.data.yearMonth}-01`
      this.setData({
        petName: state.profile.name,
        monthLabel: year && month ? `${year} 年 ${month} 月` : this.data.yearMonth,
        cells: buildPetCalendar(eventDates, this.data.yearMonth, today),
        selectedDate,
        calendarEvents,
        selectedEvents: calendarEvents.filter((item) => item.date === selectedDate),
      })
      this.setData({ loading: false })
    } catch (error) {
      this.setData({
        loading: false,
        errorText: getPetErrorMessage(error, '宠物月历暂时没有同步过来'),
      })
    }
  },
})
