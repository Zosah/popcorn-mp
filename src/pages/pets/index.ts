import { getShanghaiDateOnly } from '../../domain/expiry'
import {
  PET_DAILY_ICON_NAMES,
  PET_SUPPLY_ICON_NAMES,
  PET_TIMELINE_ICON_NAMES,
} from '../../constants/icon-names'
import {
  buildPetCareCards,
  buildPetDailySummary,
  buildPetTimeline,
  filterPetSupplies,
  formatPetAge,
  getCurrentPetSupplies,
  getPetSupplyStatusLabel,
  PET_DAILY_LOG_LABELS,
  PET_SUPPLY_CATEGORY_LABELS,
  type DemoPetProfile,
  type DemoPetState,
  type PetCareType,
  type PetDailyLogType,
  type PetSpecies,
  type PetSupplyCategory,
  type PetSupplyStatus,
} from '../../domain/demo-pet'
import {
  addDemoPet,
  addDemoPetDailyLog,
  addDemoPetEvent,
  addDemoPetSupply,
  addDemoPetWeight,
  getDemoPetState,
  listDemoPetProfiles,
  switchDemoPet,
  updateDemoPetProfile,
  updateDemoPetSupplyStatus,
} from '../../services/demo-pet'
import { navigateBackOrTab } from '../../utils/demo-navigation'

type PetSection = 'profile' | 'care' | 'calendar' | 'daily' | 'supplies'
type SupplyFilter = PetSupplyCategory | 'all'

const EMPTY_PROFILE: DemoPetProfile = {
  id: '',
  name: '糯米',
  species: 'cat',
  breed: '英国短毛猫',
  sex: 'female',
  birthday: '',
  homeOn: '',
  neuteredOn: null,
  status: '精神不错',
}

const SUPPLY_CATEGORIES: Array<{
  value: SupplyFilter
  label: string
}> = [
  { value: 'all', label: '全部' },
  { value: 'kibble', label: '主粮' },
  { value: 'can', label: '罐头' },
  { value: 'freeze-dried', label: '冻干' },
  { value: 'soup', label: '汤包' },
  { value: 'litter', label: '猫砂' },
]

const SUPPLY_STATUS_OPTIONS: Array<{
  value: PetSupplyStatus
  label: string
}> = [
  { value: 'current', label: '正在用' },
  { value: 'loved', label: '爱吃 / 好用' },
  { value: 'tried', label: '吃过 / 用过' },
  { value: 'wishlist', label: '种草' },
  { value: 'dropped', label: '拔草' },
]

const DAILY_LOG_DEFAULTS: Record<PetDailyLogType, string> = {
  meal: '吃了一餐，食欲正常',
  water: '主动喝水一次',
  stool: '便便形态正常',
  urine: '尿团大小正常',
}

function formatShortDate(value: string | null): string {
  if (!value) return '待补充'
  const [, month, day] = value.split('-')
  return month && day ? `${month}.${day}` : value
}

function formatDailyTime(value: string): string {
  const date = new Date(Date.parse(value) + 8 * 60 * 60 * 1000)
  return `${String(date.getUTCHours()).padStart(2, '0')}:${String(
    date.getUTCMinutes(),
  ).padStart(2, '0')}`
}

Page({
  data: {
    activeSection: 'profile' as PetSection,
    profile: EMPTY_PROFILE,
    profileInitial: '糯',
    petTabs: [] as Array<{
      id: string
      name: string
      initial: string
      speciesLabel: string
      selected: boolean
    }>,
    profileDraft: EMPTY_PROFILE,
    editingProfile: false,
    ageLabel: '',
    birthdayLabel: '',
    homeOnLabel: '',
    neuteredOnLabel: '',
    latestWeight: '—',
    companionDays: 0,
    dailyDoneCount: 0,
    nextCare: null as {
      title: string
      monthLabel: string
      dayLabel: string
      meta: string
      statusLabel: string
    } | null,
    featuredSupply: null as {
      id: string
      categoryLabel: string
      iconName: string
      name: string
      note: string
    } | null,
    weightPoints: [] as Array<{
      value: string
      dateLabel: string
      height: number
      active: boolean
    }>,
    weightTrendLabel: '',
    timeline: [] as Array<
      ReturnType<typeof buildPetTimeline>[number] & {
        iconName: string
        detailText: string
      }
    >,
    careCards: [] as Array<ReturnType<typeof buildPetCareCards>[number]>,
    careTimeline: [] as Array<
      ReturnType<typeof buildPetTimeline>[number] & {
        iconName: string
        detailText: string
      }
    >,
    dailySummary: [] as Array<
      ReturnType<typeof buildPetDailySummary>[number] & {
        iconName: string
      }
    >,
    recentDailyLogs: [] as Array<{
      id: string
      iconName: string
      typeLabel: string
      summary: string
      timeLabel: string
    }>,
    supplyCategories: SUPPLY_CATEGORIES,
    selectedSupplyCategory: 'all' as SupplyFilter,
    currentSupplies: [] as Array<{
      id: string
      categoryLabel: string
      name: string
      note: string
    }>,
    supplies: [] as Array<{
      id: string
      category: PetSupplyCategory
      categoryLabel: string
      iconName: string
      name: string
      status: PetSupplyStatus
      statusLabel: string
      note: string
      recordedOn: string
    }>,
  },

  onLoad(options: Record<string, string | undefined>) {
    const section = options.section
    if (
      section === 'profile' ||
      section === 'care' ||
      section === 'calendar' ||
      section === 'daily' ||
      section === 'supplies'
    ) {
      this.setData({ activeSection: section })
    }
  },

  onShow() {
    this.loadState(getDemoPetState())
    this.loadPetTabs()
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onSwitchSection(event: {
    currentTarget: { dataset: { value: PetSection } }
  }) {
    this.setData({ activeSection: event.currentTarget.dataset.value })
  },

  loadState(state: DemoPetState) {
    const today = getShanghaiDateOnly(Date.now())
    const timeline = buildPetTimeline(state).map((item) => {
      const event = state.events.find((candidate) => candidate.id === item.id)
      return {
        ...item,
        iconName: PET_TIMELINE_ICON_NAMES[item.type],
        detailText: [
          item.note,
          event?.provider,
          event?.cost ? `¥${event.cost}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
      }
    })
    const weights = state.weights.slice(-6)
    const values = weights.map((item) => Number(item.value))
    const min = Math.min(...values)
    const max = Math.max(...values)
    const spread = Math.max(max - min, 0.1)
    const weightPoints = weights.map((item, index) => ({
      value: item.value,
      dateLabel: formatShortDate(item.recordedOn),
      height: Math.round(30 + ((Number(item.value) - min) / spread) * 58),
      active: index === weights.length - 1,
    }))
    const latestValue = weights[weights.length - 1]
    const previousValue = weights[weights.length - 2]
    const weightDelta =
      latestValue && previousValue
        ? Number(latestValue.value) - Number(previousValue.value)
        : null
    const weightTrendLabel =
      weightDelta === null
        ? '还没有上一次记录'
        : Math.abs(weightDelta) < 0.05
          ? '和上次持平'
          : `较上次 ${weightDelta > 0 ? '+' : ''}${weightDelta.toFixed(1)} kg`
    const todayDailyLogs = state.dailyLogs.filter(
      (item) => getShanghaiDateOnly(Date.parse(item.recordedAt)) === today,
    )
    const dailySummary = buildPetDailySummary(state.dailyLogs, today).map((item) => ({
      ...item,
      iconName: PET_DAILY_ICON_NAMES[item.type],
    }))
    const careCards = buildPetCareCards(state.events, today)
    const carePriority: Record<string, number> = {
      overdue: 0,
      'due-soon': 1,
      normal: 2,
      unrecorded: 3,
    }
    const nextCareCard = [...careCards].sort((left, right) =>
      (carePriority[left.status] ?? 9) - (carePriority[right.status] ?? 9) ||
      (left.nextOn ?? '9999-12-31').localeCompare(right.nextOn ?? '9999-12-31'),
    )[0]
    const nextOnParts = nextCareCard?.nextOn?.split('-') ?? []
    const currentSupplies = getCurrentPetSupplies(state.supplies).map((item) => ({
      id: item.id,
      categoryLabel: PET_SUPPLY_CATEGORY_LABELS[item.category],
      iconName: PET_SUPPLY_ICON_NAMES[item.category],
      name: item.name,
      note: item.note,
    }))
    const homeTimestamp = Date.parse(`${state.profile.homeOn}T00:00:00.000Z`)
    const todayTimestamp = Date.parse(`${today}T00:00:00.000Z`)
    const companionDays =
      Number.isFinite(homeTimestamp) && Number.isFinite(todayTimestamp)
        ? Math.max(1, Math.floor((todayTimestamp - homeTimestamp) / 86400000) + 1)
        : 0

    this.setData({
      profile: state.profile,
      profileInitial: state.profile.name.slice(0, 1),
      profileDraft: { ...state.profile },
      ageLabel: formatPetAge(state.profile.birthday, today),
      birthdayLabel: formatShortDate(state.profile.birthday),
      homeOnLabel: formatShortDate(state.profile.homeOn),
      neuteredOnLabel: formatShortDate(state.profile.neuteredOn),
      latestWeight: latestValue?.value ?? '—',
      companionDays,
      dailyDoneCount: dailySummary.filter((item) => item.done).length,
      nextCare: nextCareCard
        ? {
            title: nextCareCard.title,
            monthLabel: nextOnParts[1] ? `${Number(nextOnParts[1])}月` : '待定',
            dayLabel: nextOnParts[2] ? String(Number(nextOnParts[2])) : '—',
            meta: `${nextCareCard.statusLabel} · ${nextCareCard.intervalLabel}`,
            statusLabel: nextCareCard.statusLabel,
          }
        : null,
      featuredSupply: currentSupplies[0] ?? null,
      weightPoints,
      weightTrendLabel,
      timeline,
      careCards,
      careTimeline: timeline
        .filter((item) => item.type !== 'birthday' && item.type !== 'home')
        .slice(0, 6),
      dailySummary,
      recentDailyLogs: todayDailyLogs.slice(0, 6).map((item) => ({
        id: item.id,
        iconName: PET_DAILY_ICON_NAMES[item.type],
        typeLabel: PET_DAILY_LOG_LABELS[item.type],
        summary: item.summary,
        timeLabel: formatDailyTime(item.recordedAt),
      })),
      currentSupplies,
      supplies: filterPetSupplies(
        state.supplies,
        this.data.selectedSupplyCategory,
      ).map((item) => ({
        ...item,
        categoryLabel: PET_SUPPLY_CATEGORY_LABELS[item.category],
        iconName: PET_SUPPLY_ICON_NAMES[item.category],
        statusLabel: getPetSupplyStatusLabel(item.category, item.status),
      })),
    })
  },

  loadPetTabs() {
    const activeId = getDemoPetState().profile.id
    const speciesLabels: Record<PetSpecies, string> = {
      cat: '猫咪',
      dog: '狗狗',
      other: '伙伴',
    }
    this.setData({
      petTabs: listDemoPetProfiles().map((profile) => ({
        id: profile.id,
        name: profile.name,
        initial: profile.name.slice(0, 1),
        speciesLabel: speciesLabels[profile.species],
        selected: profile.id === activeId,
      })),
    })
  },

  onSwitchPet(event: { currentTarget: { dataset: { id: string } } }) {
    this.setData({ editingProfile: false, selectedSupplyCategory: 'all' })
    this.loadState(switchDemoPet(event.currentTarget.dataset.id))
    this.loadPetTabs()
  },

  onChoosePet() {
    if (this.data.petTabs.length <= 1) {
      this.onAddPet()
      return
    }
    wx.showActionSheet({
      itemList: this.data.petTabs.map((item) => item.name),
      success: (selection) => {
        const selected = this.data.petTabs[selection.tapIndex]
        if (selected) this.onSwitchPet({ currentTarget: { dataset: { id: selected.id } } })
      },
    })
  },

  onAddPet() {
    const species: Array<{ value: PetSpecies; label: string }> = [
      { value: 'cat', label: '猫咪' },
      { value: 'dog', label: '狗狗' },
      { value: 'other', label: '其他伙伴' },
    ]
    wx.showActionSheet({
      itemList: species.map((item) => item.label),
      success: (selection) => {
        const selected = species[selection.tapIndex]
        if (!selected) return
        wx.showModal({
          title: `添加${selected.label}`,
          editable: true,
          placeholderText: '它叫什么名字？',
          confirmText: '加入这个家',
          success: (result) => {
            const name = result.content?.trim()
            if (!result.confirm || !name) return
            this.loadState(addDemoPet({ name, species: selected.value }))
            this.loadPetTabs()
            wx.showToast({ title: `${name}已加入`, icon: 'success' })
          },
        })
      },
    })
  },

  onToggleProfileEditor() {
    this.setData({
      editingProfile: !this.data.editingProfile,
      profileDraft: { ...this.data.profile },
    })
  },

  onBirthdayChange(event: { detail: { value: string } }) {
    this.setData({ 'profileDraft.birthday': event.detail.value })
  },

  onHomeDateChange(event: { detail: { value: string } }) {
    this.setData({ 'profileDraft.homeOn': event.detail.value })
  },

  onNeuteredToggle(event: { detail: { value: boolean } }) {
    this.setData({
      'profileDraft.neuteredOn': event.detail.value
        ? this.data.profileDraft.neuteredOn ?? getShanghaiDateOnly(Date.now())
        : null,
    })
  },

  onNeuteredDateChange(event: { detail: { value: string } }) {
    this.setData({ 'profileDraft.neuteredOn': event.detail.value })
  },

  onSaveProfile() {
    const draft = this.data.profileDraft
    const today = getShanghaiDateOnly(Date.now())
    if (!draft.birthday || draft.birthday > today) {
      wx.showToast({ title: '请填写正确的出生日期', icon: 'none' })
      return
    }
    if (!draft.homeOn || draft.homeOn < draft.birthday) {
      wx.showToast({ title: '到家日期不能早于出生日期', icon: 'none' })
      return
    }
    if (draft.neuteredOn && draft.neuteredOn < draft.birthday) {
      wx.showToast({ title: '绝育日期不能早于出生日期', icon: 'none' })
      return
    }

    const state = updateDemoPetProfile({
      birthday: draft.birthday,
      homeOn: draft.homeOn,
      neuteredOn: draft.neuteredOn,
    })
    this.setData({ editingProfile: false })
    this.loadState(state)
    wx.showToast({ title: '档案已更新', icon: 'success' })
  },

  onRecordWeight() {
    wx.showModal({
      title: `记录${this.data.profile.name}的体重`,
      editable: true,
      placeholderText: '输入体重，例如 3.9',
      confirmText: '保存',
      success: (result) => {
        if (!result.confirm) return
        const value = Number(result.content)
        if (!Number.isFinite(value) || value <= 0 || value > 100) {
          wx.showToast({ title: '请输入有效体重', icon: 'none' })
          return
        }
        this.loadState(addDemoPetWeight(value.toFixed(1)))
        wx.showToast({ title: '体重已记下', icon: 'success' })
      },
    })
  },

  onAddEvent() {
    wx.navigateTo({ url: '/pages/pet-event-form/index' })
  },

  onOpenEvent(event: { currentTarget: { dataset: { id: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!getDemoPetState().events.some((item) => item.id === id)) return
    wx.navigateTo({ url: `/pages/pet-event-detail/index?id=${id}` })
  },

  onOpenCalendar() {
    wx.navigateTo({ url: '/pages/pet-calendar/index' })
  },

  onCompleteCare(event: {
    currentTarget: { dataset: { type: PetCareType } }
  }) {
    const type = event.currentTarget.dataset.type
    const title = type === 'internal-deworm' ? '完成体内驱虫' : '完成体外驱虫'
    wx.showModal({
      title,
      content: '确认今天已经完成？记录后会自动计算下一次日期。',
      confirmText: '完成并记录',
      success: (result) => {
        if (!result.confirm) return
        this.loadState(addDemoPetEvent({ type, title, note: '' }))
        wx.showToast({ title: '下次日期已更新', icon: 'success' })
      },
    })
  },

  onSelectSupplyCategory(event: {
    currentTarget: { dataset: { value: SupplyFilter } }
  }) {
    this.setData(
      { selectedSupplyCategory: event.currentTarget.dataset.value },
      () => this.loadState(getDemoPetState()),
    )
  },

  onAddDailyLog(event: {
    currentTarget: { dataset: { type: PetDailyLogType } }
  }) {
    const type = event.currentTarget.dataset.type
    wx.showModal({
      title: `记录${PET_DAILY_LOG_LABELS[type]}`,
      content: DAILY_LOG_DEFAULTS[type],
      editable: true,
      placeholderText: '写下这次的情况',
      confirmText: '记下来',
      success: (result) => {
        const summary = result.content?.trim()
        if (!result.confirm || !summary) return
        this.loadState(addDemoPetDailyLog({ type, summary }))
        wx.showToast({ title: '今日状态已更新', icon: 'success' })
      },
    })
  },

  onAddSupply() {
    const categories = SUPPLY_CATEGORIES.filter((item) => item.value !== 'all')
    wx.showActionSheet({
      itemList: categories.map((item) => item.label),
      success: (categorySelection) => {
        const category = categories[categorySelection.tapIndex]
        if (!category || category.value === 'all') return
        const categoryValue: PetSupplyCategory = category.value
        wx.showModal({
          title: `添加${category.label}`,
          editable: true,
          placeholderText:
            categoryValue === 'litter'
              ? '例如：豆腐混合猫砂'
              : `写下${category.label}名称`,
          confirmText: '下一步',
          success: (nameResult) => {
            const name = nameResult.content?.trim()
            if (!nameResult.confirm || !name) return
            wx.showActionSheet({
              itemList: SUPPLY_STATUS_OPTIONS.map((item) => item.label),
              success: (statusSelection) => {
                const status = SUPPLY_STATUS_OPTIONS[statusSelection.tapIndex]
                if (!status) return
                this.loadState(
                  addDemoPetSupply({
                    category: categoryValue,
                    name,
                    status: status.value,
                  }),
                )
                wx.showToast({ title: '已加入集合', icon: 'success' })
              },
            })
          },
        })
      },
    })
  },

  onChangeSupplyStatus(event: {
    currentTarget: { dataset: { id: string } }
  }) {
    const id = event.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: SUPPLY_STATUS_OPTIONS.map((item) => item.label),
      success: (selection) => {
        const status = SUPPLY_STATUS_OPTIONS[selection.tapIndex]
        if (!status) return
        this.loadState(updateDemoPetSupplyStatus(id, status.value))
        wx.showToast({ title: `已标记为${status.label}`, icon: 'none' })
      },
    })
  },
})
