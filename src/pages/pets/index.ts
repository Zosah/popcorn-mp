import { appConfig } from '../../config/env'
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
  formatPetWeight,
  getDefaultPetCareInterval,
  getCurrentPetSupplies,
  getPetSupplyPreferenceLabel,
  PET_BACKGROUND_LABELS,
  PET_DAILY_LOG_LABELS,
  PET_EVENT_LABELS,
  PET_SUPPLY_CATEGORY_LABELS,
  type DemoPetProfile,
  type DemoPetState,
  type PetCareType,
  type PetBackgroundKey,
  type PetDailyLogType,
  type PetSpecies,
  type PetSupplyCategory,
  type PetSupplyPreference,
} from '../../domain/demo-pet'
import { mediaGateway } from '../../services/media'
import { getMediaErrorMessage } from '../../services/media-gateway'
import { hydrateAuthState } from '../../services/auth'
import { promptAuthGateIfNeeded, requireAuthForWrite } from '../../services/auth-preview'
import { readPageCache, writePageCache } from '../../services/page-cache'
import { petGateway } from '../../services/pet'
import {
  activePetFrom,
  getPetErrorMessage,
  PetGatewayError,
  toPetProfileInput,
  type PetCollection,
} from '../../services/pet-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { waitForMinimumLoading } from '../../utils/loading'
import { showMediaUploadError } from '../../utils/media-error'

type PetSection = 'profile' | 'care' | 'daily' | 'supplies'

type CropImageApi = (options: {
  src: string
  cropScale: '1:1'
  success: (result: { tempFilePath: string }) => void
  fail: () => void
}) => void
type SupplyFilter = PetSupplyCategory | 'all'

const EMPTY_PROFILE: DemoPetProfile = {
  id: '',
  name: '',
  species: 'cat',
  breed: '',
  sex: 'female',
  birthday: '',
  homeOn: '',
  neuteredOn: null,
  status: '',
  version: 1,
  avatarMediaId: '',
  avatarUrl: '',
  backgroundKey: 'sage',
  backgroundMediaId: '',
  backgroundUrl: '',
}

const EMPTY_PET_STATE: DemoPetState = {
  profile: EMPTY_PROFILE,
  events: [],
  supplies: [],
  weights: [],
  dailyLogs: [],
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
  { value: 'custom', label: '自定义' },
]

const SUPPLY_PREFERENCE_OPTIONS: Array<{
  value: PetSupplyPreference
  label: string
}> = [
  { value: 'loved', label: '种草' },
  { value: 'neutral', label: '一般' },
  { value: 'dropped', label: '拔草' },
]

const SUPPLY_EDITOR_CATEGORIES: Array<{
  value: PetSupplyCategory
  label: string
}> = [
  { value: 'kibble', label: '主粮' },
  { value: 'can', label: '罐头' },
  { value: 'freeze-dried', label: '冻干' },
  { value: 'soup', label: '汤包' },
  { value: 'litter', label: '猫砂' },
  { value: 'custom', label: '自定义' },
]

const DAILY_LOG_DEFAULTS: Record<PetDailyLogType, string> = {
  meal: '吃了一餐，食欲正常',
  water: '主动喝水一次',
  stool: '便便形态正常',
  urine: '尿团大小正常',
  'litter-change': '换掉结块，并补了新猫砂',
  'water-change': '清洗水碗，换上干净饮水',
}

const PET_PAGE_CACHE_KEY = 'pets:overview'

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
    hasActivePet: false,
    loading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    syncing: false,
    errorText: '',
    syncState: 'pending',
    uploadingAvatar: false,
    avatarPreviewOpen: false,
    backgroundPickerOpen: false,
    uploadingBackground: false,
    backgroundOptions: (Object.keys(PET_BACKGROUND_LABELS) as PetBackgroundKey[]).map((key) => ({
      key,
      label: PET_BACKGROUND_LABELS[key],
      selected: key === EMPTY_PROFILE.backgroundKey,
    })),
    supplyEditorOpen: false,
    supplySaving: false,
    supplyPreferenceOptions: SUPPLY_PREFERENCE_OPTIONS,
    supplyEditorCategories: SUPPLY_EDITOR_CATEGORIES,
    supplyDraft: {
      category: 'kibble' as PetSupplyCategory,
      categoryLabel: '',
      name: '',
      brand: '',
      preference: 'neutral' as PetSupplyPreference,
      note: '',
      mediaId: '',
      mediaUrl: '',
    },
    petState: EMPTY_PET_STATE,
    petStates: [] as DemoPetState[],
    profile: EMPTY_PROFILE,
    profileInitial: '糯',
    petTabs: [] as Array<{
      id: string
      name: string
      initial: string
      speciesLabel: string
      avatarUrl: string
      selected: boolean
    }>,
    profileDraft: EMPTY_PROFILE,
    editingProfile: false,
    ageLabel: '',
    birthdayLabel: '',
    homeOnLabel: '',
    neuteredOnLabel: '',
    latestVaccineLabel: '还没有记录',
    vaccineNextLabel: '',
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
        interval: boolean
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
      brand: string
      mediaUrl: string
      preference: PetSupplyPreference
      preferenceLabel: string
      note: string
      recordedOn: string
    }>,
  },

  onLoad(options: Record<string, string | undefined>) {
    const cached = readPageCache<Record<string, unknown>>(PET_PAGE_CACHE_KEY)
    if (cached) {
      const cachedProfile = cached.value.profile as DemoPetProfile | undefined
      this.setData({
        ...cached.value,
        loading: false,
        syncing: false,
        hasLoaded: true,
        cacheFresh: cached.fresh,
        hasShown: false,
        editingProfile: false,
        profileDraft: cachedProfile ?? EMPTY_PROFILE,
        uploadingAvatar: false,
      })
    }
    const section = options.section
    if (
      section === 'profile' ||
      section === 'care' ||
      section === 'daily' ||
      section === 'supplies'
    ) {
      this.setData({ activeSection: section })
    }
  },

  onShow() {
    promptAuthGateIfNeeded()
    const firstShow = !this.data.hasShown
    if (firstShow) this.setData({ hasShown: true })
    void this.refreshPetData()
  },

  onPullDownRefresh() {
    void this.refreshPetData('', true)
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  async refreshPetData(preferredPetId = '', fromPullDown = false) {
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    this.setData({
      loading: firstLoad,
      syncing: true,
      syncState: 'pending',
      errorText: '',
    })
    try {
      const auth = await hydrateAuthState()
      if (!appConfig.demoMode && !auth.isLoggedIn) {
        if (firstLoad) await waitForMinimumLoading(startedAt)
        this.setData({
          hasActivePet: false,
          petStates: [],
          petTabs: [],
          petState: EMPTY_PET_STATE,
          profile: EMPTY_PROFILE,
          profileDraft: EMPTY_PROFILE,
          profileInitial: '',
          editingProfile: false,
          loading: false,
          hasLoaded: true,
          cacheFresh: false,
          errorText: '',
          syncState: 'local',
        })
        promptAuthGateIfNeeded()
        return
      }
      let collection = await petGateway.list()
      if (
        preferredPetId
        && collection.pets.some((pet) => pet.profile.id === preferredPetId)
        && collection.activePetId !== preferredPetId
      ) {
        collection = await petGateway.setActivePet(preferredPetId)
      }
      this.applyCollection(collection)
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.setData({
        syncState: 'synced',
        hasLoaded: true,
        cacheFresh: true,
        errorText: '',
      })
    } catch (error) {
      if (firstLoad) await waitForMinimumLoading(startedAt)
      this.setData({
        hasLoaded: true,
        errorText: getPetErrorMessage(error, '宠物照护暂时没有同步过来'),
        syncState: 'local',
      })
    } finally {
      this.setData({ loading: false, syncing: false })
      if (fromPullDown) wx.stopPullDownRefresh()
    }
  },

  applyCollection(collection: PetCollection) {
    const active = activePetFrom(collection)
    this.setData({ petStates: collection.pets })
    if (!active) {
      this.setData({
        hasActivePet: false,
        petState: EMPTY_PET_STATE,
        profile: EMPTY_PROFILE,
        profileDraft: EMPTY_PROFILE,
        profileInitial: '',
        editingProfile: false,
        petTabs: [],
      })
      this.loadPetTabs(collection)
      return
    }
    this.loadState(active)
    this.loadPetTabs(collection)
  },

  applyPetState(state: DemoPetState) {
    const pets = this.data.petStates.some(
      (pet) => pet.profile.id === state.profile.id,
    )
      ? this.data.petStates.map((pet) =>
          pet.profile.id === state.profile.id ? state : pet,
        )
      : [...this.data.petStates, state]
    this.setData({ petStates: pets, syncState: 'synced', hasActivePet: true })
    this.loadState(state)
    this.loadPetTabs()
  },

  cacheCurrentPage() {
    const data = this.data as unknown as Record<string, unknown>
    const {
      loading: _loading,
      syncing: _syncing,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      uploadingAvatar: _uploadingAvatar,
      avatarPreviewOpen: _avatarPreviewOpen,
      backgroundPickerOpen: _backgroundPickerOpen,
      uploadingBackground: _uploadingBackground,
      supplyEditorOpen: _supplyEditorOpen,
      supplySaving: _supplySaving,
      ...snapshot
    } = data
    writePageCache(PET_PAGE_CACHE_KEY, {
      ...snapshot,
      loading: false,
      syncing: false,
      uploadingAvatar: false,
      avatarPreviewOpen: false,
      backgroundPickerOpen: false,
      uploadingBackground: false,
      supplyEditorOpen: false,
      supplySaving: false,
      editingProfile: false,
      profileDraft: this.data.profile,
    })
  },

  async runPetMutation(
    operation: () => Promise<DemoPetState>,
    successText: string,
  ): Promise<boolean> {
    if (!requireAuthForWrite()) return false
    this.setData({ syncing: true, syncState: 'pending', errorText: '' })
    try {
      const state = await operation()
      this.applyPetState(state)
      wx.showToast({ title: successText, icon: 'success' })
      return true
    } catch (error) {
      const message = getPetErrorMessage(error, '这次没有保存成功')
      this.setData({ errorText: message, syncState: 'local' })
      wx.showToast({ title: message, icon: 'none' })
      return false
    } finally {
      this.setData({ syncing: false })
    }
  },

  onRetry() {
    void this.refreshPetData()
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
      value: formatPetWeight(item.value),
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
    const vaccineEvents = state.events
      .filter((item) => item.type === 'vaccine')
      .sort((left, right) => right.occurredOn.localeCompare(left.occurredOn))
    const latestVaccine = vaccineEvents[0]
    const vaccineNextLabel = latestVaccine?.nextOn
      ? `下次 ${formatShortDate(latestVaccine.nextOn)}`
      : ''
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
      hasActivePet: true,
      petState: state,
      profile: state.profile,
      profileInitial: state.profile.name.slice(0, 1),
      profileDraft: { ...state.profile },
      ageLabel: formatPetAge(state.profile.birthday, today),
      birthdayLabel: formatShortDate(state.profile.birthday),
      homeOnLabel: formatShortDate(state.profile.homeOn),
      neuteredOnLabel: formatShortDate(state.profile.neuteredOn),
      latestVaccineLabel: latestVaccine ? formatShortDate(latestVaccine.occurredOn) : '还没有记录',
      vaccineNextLabel,
      latestWeight: latestValue ? formatPetWeight(latestValue.value) : '—',
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
      dailySummary: dailySummary.map((item) => ({
        ...item,
        interval: item.type === 'litter-change' || item.type === 'water-change',
      })),
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
        categoryLabel: item.categoryLabel || PET_SUPPLY_CATEGORY_LABELS[item.category],
        iconName: PET_SUPPLY_ICON_NAMES[item.category],
        mediaUrl: item.mediaUrl ?? '',
        preferenceLabel: getPetSupplyPreferenceLabel(item.preference),
      })),
    }, () => this.cacheCurrentPage())
  },

  loadPetTabs(collection?: PetCollection) {
    const activeId = collection?.activePetId ?? this.data.petState.profile.id
    const pets = collection?.pets ?? this.data.petStates
    const speciesLabels: Record<PetSpecies, string> = {
      cat: '猫咪',
      dog: '狗狗',
      other: '伙伴',
    }
    this.setData({
      petTabs: pets.map(({ profile }) => ({
        id: profile.id,
        name: profile.name,
        initial: profile.name.slice(0, 1),
        speciesLabel: speciesLabels[profile.species],
        avatarUrl: profile.avatarUrl ?? '',
        selected: profile.id === activeId,
      })),
    }, () => this.cacheCurrentPage())
  },

  async onSwitchPet(event: { currentTarget: { dataset: { id: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id || id === this.data.petState.profile.id) return
    if (!requireAuthForWrite()) return
    this.setData({ editingProfile: false, selectedSupplyCategory: 'all', syncing: true })
    try {
      const collection = await petGateway.setActivePet(id)
      this.applyCollection(collection)
      this.setData({ syncState: 'synced' })
    } catch (error) {
      wx.showToast({
        title: getPetErrorMessage(error, '切换宠物没有成功'),
        icon: 'none',
      })
    } finally {
      this.setData({ syncing: false })
    }
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
    if (!requireAuthForWrite()) return
    wx.navigateTo({ url: '/pages/pet-form/index' })
  },

  onToggleProfileEditor() {
    if (!requireAuthForWrite()) return
    this.setData({
      editingProfile: !this.data.editingProfile,
      profileDraft: { ...this.data.profile },
    })
  },

  noop() {},

  onOpenAvatarPreview() {
    if (!this.data.profile.id) return
    this.setData({ avatarPreviewOpen: true })
  },

  onCloseAvatarPreview() {
    if (this.data.uploadingAvatar) return
    this.setData({ avatarPreviewOpen: false })
  },

  onChooseAvatar() {
    if (this.data.uploadingAvatar || this.data.syncing) return
    if (!requireAuthForWrite()) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file?.tempFilePath) return
        const cropImage = (wx as unknown as { cropImage?: CropImageApi }).cropImage
        if (!cropImage) {
          wx.showToast({ title: '当前微信版本不支持 1:1 裁切，请升级微信', icon: 'none' })
          return
        }
        cropImage({
          src: file.tempFilePath,
          cropScale: '1:1',
          success: (cropped) => {
            if (cropped.tempFilePath) {
              void this.uploadPetAvatar(cropped.tempFilePath, file.size)
            }
          },
          fail: () => {
            // 取消裁切不产生上传副作用。
          },
        })
      },
    })
  },

  async uploadPetAvatar(filePath: string, fileSize: number) {
    this.setData({ uploadingAvatar: true, errorText: '' })
    try {
      const asset = await mediaGateway.upload(filePath, 'avatar', fileSize)
      const profile = this.data.profile
      const updated = await petGateway.updateProfile(
        profile.id,
        { ...toPetProfileInput(profile), avatarMediaId: asset.id },
        profile.version ?? 1,
      )
      this.applyPetState(updated)
      this.setData({ avatarPreviewOpen: false })
      wx.showToast({ title: '照片已更新', icon: 'success' })
    } catch (error) {
      if (error instanceof PetGatewayError) {
        const message = getPetErrorMessage(error, '照片没有保存成功')
        this.setData({ errorText: message })
        wx.showToast({ title: message, icon: 'none' })
      } else {
        const message = getMediaErrorMessage(error, '照片没有上传成功')
        this.setData({ errorText: message })
        showMediaUploadError(error, '照片没有上传成功')
      }
    } finally {
      this.setData({ uploadingAvatar: false })
    }
  },

  onRemoveAvatar() {
    const profile = this.data.profile
    if (!profile.avatarMediaId || this.data.uploadingAvatar || this.data.syncing) return
    if (!requireAuthForWrite()) return
    wx.showModal({
      title: '移除宠物照片',
      content: '照片会从档案中移除，原文件暂不物理删除。',
      confirmText: '移除',
      confirmColor: '#b86757',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ uploadingAvatar: true, errorText: '' })
        try {
          const updated = await petGateway.updateProfile(
            profile.id,
            { ...toPetProfileInput(profile), avatarMediaId: '' },
            profile.version ?? 1,
          )
          this.applyPetState(updated)
          this.setData({ avatarPreviewOpen: false })
          wx.showToast({ title: '照片已移除', icon: 'success' })
        } catch (error) {
          const message = getPetErrorMessage(error, '照片没有移除成功')
          this.setData({ errorText: message })
          wx.showToast({ title: message, icon: 'none' })
        } finally {
          this.setData({ uploadingAvatar: false })
        }
      },
    })
  },

  onAvatarError() {
    this.setData({ 'profile.avatarUrl': '' })
  },

  onOpenBackgroundPicker() {
    if (!requireAuthForWrite()) return
    this.setData({
      backgroundPickerOpen: true,
      backgroundOptions: this.data.backgroundOptions.map((item) => ({
        ...item,
        selected: item.key === this.data.profile.backgroundKey,
      })),
    })
  },

  onCloseBackgroundPicker() {
    if (this.data.uploadingBackground) return
    this.setData({ backgroundPickerOpen: false })
  },

  async onSelectBackgroundTheme(event: {
    currentTarget: { dataset: { key: PetBackgroundKey } }
  }) {
    const key = event.currentTarget.dataset.key
    const profile = this.data.profile
    if (!key || (profile.backgroundKey === key && !profile.backgroundMediaId)) {
      this.setData({ backgroundPickerOpen: false })
      return
    }
    this.setData({ uploadingBackground: true })
    try {
      const updated = await petGateway.updateProfile(
        profile.id,
        {
          ...toPetProfileInput(profile),
          backgroundKey: key,
          backgroundMediaId: '',
        },
        profile.version ?? 1,
      )
      this.applyPetState(updated)
      this.setData({ backgroundPickerOpen: false })
    } catch (error) {
      wx.showToast({ title: getPetErrorMessage(error, '背景没有保存成功'), icon: 'none' })
    } finally {
      this.setData({ uploadingBackground: false })
    }
  },

  onChooseBackground() {
    if (this.data.uploadingBackground || this.data.syncing) return
    if (!requireAuthForWrite()) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (file?.tempFilePath) void this.uploadPetBackground(file.tempFilePath, file.size)
      },
    })
  },

  async uploadPetBackground(filePath: string, fileSize: number) {
    this.setData({ uploadingBackground: true, errorText: '' })
    try {
      const asset = await mediaGateway.upload(filePath, 'pet', fileSize)
      const profile = this.data.profile
      const updated = await petGateway.updateProfile(
        profile.id,
        {
          ...toPetProfileInput(profile),
          backgroundMediaId: asset.id,
        },
        profile.version ?? 1,
      )
      this.applyPetState(updated)
      this.setData({ backgroundPickerOpen: false })
      wx.showToast({ title: '背景已更新', icon: 'success' })
    } catch (error) {
      if (error instanceof PetGatewayError) {
        wx.showToast({ title: getPetErrorMessage(error, '背景没有保存成功'), icon: 'none' })
      } else {
        showMediaUploadError(error, '背景没有上传成功')
      }
    } finally {
      this.setData({ uploadingBackground: false })
    }
  },

  onOpenSupplyEditor() {
    if (!requireAuthForWrite()) return
    this.setData({
      supplyEditorOpen: true,
      supplyDraft: {
        category: 'kibble',
        categoryLabel: '',
        name: '',
        brand: '',
        preference: 'neutral',
        note: '',
        mediaId: '',
        mediaUrl: '',
      },
    })
  },

  onCloseSupplyEditor() {
    if (this.data.supplySaving) return
    this.setData({ supplyEditorOpen: false })
  },

  onSupplyCategorySelect(event: {
    currentTarget: { dataset: { value: PetSupplyCategory } }
  }) {
    this.setData({ 'supplyDraft.category': event.currentTarget.dataset.value })
  },

  onSupplyPreferenceSelect(event: {
    currentTarget: { dataset: { value: PetSupplyPreference } }
  }) {
    this.setData({ 'supplyDraft.preference': event.currentTarget.dataset.value })
  },

  onSupplyFieldInput(event: WechatMiniprogram.Input) {
    const field = event.currentTarget.dataset.field as
      | 'name'
      | 'brand'
      | 'categoryLabel'
      | 'note'
    if (!field) return
    this.setData({ [`supplyDraft.${field}`]: event.detail.value })
  },

  onChooseSupplyImage() {
    if (this.data.supplySaving) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (result) => {
        const file = result.tempFiles[0]
        if (!file?.tempFilePath) return
        this.setData({ supplySaving: true })
        try {
          const asset = await mediaGateway.upload(file.tempFilePath, 'pet', file.size)
          this.setData({
            'supplyDraft.mediaId': asset.id,
            'supplyDraft.mediaUrl': asset.thumb.url || asset.display.url,
          })
        } catch (error) {
          showMediaUploadError(error, '用品图片没有上传成功')
        } finally {
          this.setData({ supplySaving: false })
        }
      },
    })
  },

  onRemoveSupplyImage() {
    this.setData({
      'supplyDraft.mediaId': '',
      'supplyDraft.mediaUrl': '',
    })
  },

  async onSaveSupply() {
    const draft = this.data.supplyDraft
    if (!draft.name.trim()) {
      wx.showToast({ title: '先写下用品名称', icon: 'none' })
      return
    }
    if (draft.category === 'custom' && !draft.categoryLabel.trim()) {
      wx.showToast({ title: '给自定义类型起个名字', icon: 'none' })
      return
    }
    this.setData({ supplySaving: true })
    const saved = await this.runPetMutation(
      () => petGateway.createSupply(this.data.petState.profile.id, {
        category: draft.category,
        categoryLabel: draft.categoryLabel.trim(),
        name: draft.name.trim(),
        brand: draft.brand.trim(),
        preference: draft.preference,
        note: draft.note.trim(),
        mediaId: draft.mediaId,
      }),
      '用品已收进清单',
    )
    this.setData({ supplySaving: false, supplyEditorOpen: !saved })
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

  async onSaveProfile() {
    if (!requireAuthForWrite()) return
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

    await this.runPetMutation(
      () => petGateway.updateProfile(
        draft.id,
        toPetProfileInput(draft),
        draft.version ?? 1,
      ),
      '档案已更新',
    )
    this.setData({ editingProfile: false })
  },

  onDeletePet() {
    const profile = this.data.profile
    if (!profile.id || this.data.syncing) return
    if (!requireAuthForWrite()) return
    wx.showModal({
      title: '删除宠物档案',
      content: '档案、照护记录和用品记录会一起移除；已上传的照片暂不物理删除。',
      confirmText: '继续',
      confirmColor: '#b86757',
      success: (first) => {
        if (!first.confirm) return
        wx.showModal({
          title: `确认删除${profile.name}？`,
          content: '删除后无法在页面恢复，请确认这只伙伴的档案不再需要。',
          confirmText: '确认删除',
          confirmColor: '#b86757',
          success: async (second) => {
            if (!second.confirm) return
            this.setData({ syncing: true, syncState: 'pending', errorText: '' })
            try {
              await petGateway.remove(profile.id, profile.version ?? 1)
              await this.refreshPetData()
              wx.showToast({ title: '宠物档案已删除', icon: 'success' })
            } catch (error) {
              const message = getPetErrorMessage(error, '宠物档案没有删除成功')
              this.setData({ errorText: message, syncState: 'local' })
              wx.showToast({ title: message, icon: 'none' })
              if (error instanceof PetGatewayError && error.code === 'VERSION_CONFLICT') {
                await this.refreshPetData()
              }
            } finally {
              this.setData({ syncing: false })
            }
          },
        })
      },
    })
  },

  onRecordWeight() {
    if (!requireAuthForWrite()) return
    wx.showModal({
      title: `记录${this.data.profile.name}的体重`,
      editable: true,
      placeholderText: '输入体重，例如 3.9',
      confirmText: '保存',
      success: async (result) => {
        if (!result.confirm) return
        const value = Number(result.content)
        if (!Number.isFinite(value) || value <= 0 || value > 100) {
          wx.showToast({ title: '请输入有效体重', icon: 'none' })
          return
        }
        await this.runPetMutation(
          () => petGateway.addWeight(
            this.data.petState.profile.id,
            value.toFixed(1),
          ),
          '体重已记下',
        )
      },
    })
  },

  onAddEvent() {
    if (!requireAuthForWrite()) return
    wx.navigateTo({ url: '/pages/pet-event-form/index' })
  },

  onOpenEvent(event: { currentTarget: { dataset: { id: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!this.data.petState.events.some((item) => item.id === id)) return
    wx.navigateTo({ url: `/pages/pet-event-detail/index?id=${id}` })
  },

  onOpenCalendar() {
    wx.navigateTo({ url: '/pages/pet-calendar/index' })
  },

  onCompleteCare(event: {
    currentTarget: { dataset: { type: PetCareType; intervalDays: number } }
  }) {
    if (!requireAuthForWrite()) return
    const type = event.currentTarget.dataset.type
    const intervalDays = Number(event.currentTarget.dataset.intervalDays)
    const recurrenceDays = Number.isInteger(intervalDays) && intervalDays > 0
      ? intervalDays
      : getDefaultPetCareInterval(type)
    const title = `完成${PET_EVENT_LABELS[type]}`
    wx.showModal({
      title,
      content: '确认今天已经完成？记录后会自动计算下一次日期。',
      confirmText: '完成并记录',
      success: async (result) => {
        if (!result.confirm) return
        await this.runPetMutation(
          () => petGateway.createEvent(
            this.data.petState.profile.id,
            {
              type,
              title,
              note: '',
              occurredOn: getShanghaiDateOnly(Date.now()),
              recurrenceDays,
            },
          ),
          '下次日期已更新',
        )
      },
    })
  },

  onSelectSupplyCategory(event: {
    currentTarget: { dataset: { value: SupplyFilter } }
  }) {
    this.setData(
      { selectedSupplyCategory: event.currentTarget.dataset.value },
      () => this.loadState(this.data.petState),
    )
  },

  onAddDailyLog(event: {
    currentTarget: { dataset: { type: PetDailyLogType } }
  }) {
    if (!requireAuthForWrite()) return
    const type = event.currentTarget.dataset.type
    wx.showModal({
      title: `记录${PET_DAILY_LOG_LABELS[type]}`,
      content: DAILY_LOG_DEFAULTS[type],
      editable: true,
      placeholderText: '写下这次的情况',
      confirmText: '记下来',
      success: async (result) => {
        const summary = result.content?.trim()
        if (!result.confirm || !summary) return
        await this.runPetMutation(
          () => petGateway.addDailyLog(
            this.data.petState.profile.id,
            { type, summary },
          ),
          '今日状态已更新',
        )
      },
    })
  },

  onAddSupply() {
    this.onOpenSupplyEditor()
  },

  onChangeSupplyStatus(event: {
    currentTarget: { dataset: { id: string } }
  }) {
    if (!requireAuthForWrite()) return
    const id = event.currentTarget.dataset.id
    wx.showActionSheet({
      itemList: SUPPLY_PREFERENCE_OPTIONS.map((item) => item.label),
      success: async (selection) => {
        const preference = SUPPLY_PREFERENCE_OPTIONS[selection.tapIndex]
        const supply = this.data.petState.supplies.find((item) => item.id === id)
        if (!preference || !supply) return
        await this.runPetMutation(
          () => petGateway.setSupplyStatus(
            this.data.petState.profile.id,
            id,
            preference.value,
            supply.version ?? 1,
          ),
          `已标记为${preference.label}`,
        )
      },
    })
  },

})
