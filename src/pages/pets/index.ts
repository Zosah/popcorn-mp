import { appConfig } from '../../config/env'
import { getShanghaiDateOnly } from '../../domain/expiry'
import { toTravelDateTimeParts, toTravelISO } from '../../domain/travel'
import {
  PET_DAILY_ICON_NAMES,
  PET_EVENT_ICON_NAMES,
  PET_SUPPLY_ICON_NAMES,
} from '../../constants/icon-names'
import {
  buildPetCareCards,
  buildPetCareTimeline,
  buildPetDailySummary,
  buildPetDailyTimeline,
  buildPetGrowthTimeline,
  filterPetSupplies,
  type PetSupplyFilter,
  formatPetAge,
  formatPetElapsed,
  formatPetWeight,
  getCurrentPetSupplies,
  getPetSupplyPreferenceHearts,
  getPetSupplyPreferenceLabel,
  PET_BACKGROUND_LABELS,
  PET_CARE_TYPES,
  PET_DAILY_LOG_LABELS,
  PET_EVENT_LABELS,
  PET_SUPPLY_CATEGORY_LABELS,
  type DemoPetProfile,
  type DemoPetSupply,
  type DemoPetState,
  type PetCareType,
  type PetBackgroundKey,
  type PetDailyLogType,
  type PetGrowthItemType,
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
import { chooseEditableImages, editRemoteImage, isImageEditCancelled } from '../../utils/image-editor'

type PetSection = 'profile' | 'care' | 'daily' | 'supplies'

type SupplyFilter = PetSupplyFilter
type PetWeightUnit = 'jin' | 'kg'
type GrowthFilter = 'all' | 'vaccine' | 'weight' | 'visit' | 'checkup'
type CareFilter = 'all' | PetCareType

type DailyTimelineView = ReturnType<typeof buildPetDailyTimeline>[number] & {
  iconName: string
  metaLabel: string
}

type GrowthTimelineView = ReturnType<typeof buildPetGrowthTimeline>[number] & {
  iconName: string
  yearLabel: string
  dateLabel: string
  elapsedLabel: string
}

type CareTimelineView = ReturnType<typeof buildPetCareTimeline>[number] & {
  iconName: string
  yearLabel: string
  dateLabel: string
  elapsedLabel: string
}

type CareCardView = ReturnType<typeof buildPetCareCards>[number] & {
  iconName: string
  lastOnLabel: string
}

const GROWTH_FILTER_OPTIONS: Array<{ value: GrowthFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'vaccine', label: '疫苗' },
  { value: 'weight', label: '体重' },
  { value: 'visit', label: '就诊' },
  { value: 'checkup', label: '体检' },
]

const CARE_FILTER_OPTIONS: Array<{ value: CareFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'grooming', label: '洗澡' },
  { value: 'internal-deworm', label: '内驱' },
  { value: 'external-deworm', label: '外驱' },
]

function filterGrowthTimeline(
  items: readonly GrowthTimelineView[],
  filter: GrowthFilter,
): GrowthTimelineView[] {
  if (filter === 'all') return [...items]
  if (filter === 'visit') {
    return items.filter((item) => item.type === 'visit' || item.type === 'illness')
  }
  return items.filter((item) => item.type === filter)
}

function filterCareTimeline(
  items: readonly CareTimelineView[],
  filter: CareFilter,
): CareTimelineView[] {
  return filter === 'all'
    ? [...items]
    : items.filter((item) => item.type === filter)
}

const GROWTH_ICON_NAMES: Record<PetGrowthItemType, string> = {
  birthday: 'pet-care-birthday',
  home: 'pet-care-homecoming',
  neuter: 'pet-care-neuter',
  vaccine: 'pet-care-vaccine',
  weight: 'pet-metric-weight',
  visit: 'pet-care-visit',
  illness: 'pet-care-visit',
  checkup: 'pet-care-visit',
}

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
  statusNotes: [],
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
  hearts: string
}> = [
  { value: 'loved', label: '超爱', hearts: '♥♥♥' },
  { value: 'neutral', label: '还行', hearts: '♥♥' },
  { value: 'dropped', label: '不爱', hearts: '♥' },
]

const HIDDEN_SUPPLY_TAGS_KEY = 'popcorn_pet_hidden_supply_tags_v1'

interface SupplyTagView {
  key: string
  label: string
  count: number
  custom: boolean
}

function readHiddenSupplyTags(): string[] {
  const value = wx.getStorageSync<string[] | ''>(HIDDEN_SUPPLY_TAGS_KEY)
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

function writeHiddenSupplyTags(value: string[]): void {
  wx.setStorageSync(HIDDEN_SUPPLY_TAGS_KEY, value)
}

function buildSupplyTags(supplies: readonly DemoPetSupply[], hidden: readonly string[]): SupplyTagView[] {
  const countOf = (predicate: (item: DemoPetSupply) => boolean) => supplies.filter(predicate).length
  const customLabels = Array.from(new Set(
    supplies
      .filter((item) => item.category === 'custom')
      .map((item) => item.categoryLabel.trim() || '自定义'),
  )).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  return [
    ...SUPPLY_EDITOR_CATEGORIES
      .filter((item) => item.value !== 'custom' && !hidden.includes(item.value))
      .map((item) => ({
        key: item.value,
        label: item.label,
        count: countOf((supply) => supply.category === item.value),
        custom: false,
      })),
    ...customLabels.map((label) => ({
      key: `custom:${label}`,
      label,
      count: countOf((supply) => supply.category === 'custom'
        && (supply.categoryLabel.trim() || '自定义') === label),
      custom: true,
    })),
  ]
}

function buildSupplyCategories(supplies: readonly DemoPetSupply[], hidden: readonly string[]): Array<{ value: SupplyFilter; label: string; count: number }> {
  const countOf = (predicate: (item: DemoPetSupply) => boolean) => supplies.filter(predicate).length
  const customLabels = Array.from(new Set(
    supplies
      .filter((item) => item.category === 'custom')
      .map((item) => item.categoryLabel.trim() || '自定义'),
  )).sort((left, right) => left.localeCompare(right, 'zh-CN'))
  return [
    ...SUPPLY_CATEGORIES
      .filter((item) => item.value !== 'custom' && !hidden.includes(item.value))
      .map((item) => ({
        ...item,
        count: item.value === 'all'
          ? supplies.length
          : countOf((supply) => supply.category === item.value),
      }))
      .filter((item) => item.count > 0),
    ...customLabels.map((label) => ({
      value: `custom:${label}` as SupplyFilter,
      label,
      count: countOf((supply) => supply.category === 'custom'
        && (supply.categoryLabel.trim() || '自定义') === label),
    })).filter((item) => item.count > 0),
  ]
}

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

interface BackgroundHistoryOption {
  mediaId: string
  url: string
  usedAtLabel: string
  selected: boolean
}

interface DailyEditorOption {
  value: string
  label: string
}

interface DailyEditorConfig {
  choiceLabel: string
  detailLabel: string
  detailPlaceholder: string
  choices: DailyEditorOption[]
  freeform?: boolean
}

const WEIGHT_UNIT_STORAGE_KEY = 'popcorn_pet_weight_unit'

const DAILY_EDITOR_CONFIGS: Record<PetDailyLogType, DailyEditorConfig> = {
  meal: {
    choiceLabel: '吃了什么',
    detailLabel: '份量',
    detailPlaceholder: '例如 42g、半罐',
    choices: [
      { value: '猫粮', label: '猫粮' },
      { value: '罐头', label: '罐头' },
      { value: '冻干', label: '冻干' },
      { value: '其他', label: '其他' },
    ],
  },
  record: {
    choiceLabel: '记录内容',
    detailLabel: '记录内容',
    detailPlaceholder: '写下这次想留住的事',
    choices: [],
    freeform: true,
  },
  water: {
    choiceLabel: '这次',
    detailLabel: '在哪喝',
    detailPlaceholder: '例如 客厅水碗',
    choices: [
      { value: '主动喝', label: '主动喝' },
      { value: '少量', label: '少量' },
      { value: '多次', label: '多次' },
    ],
  },
  stool: {
    choiceLabel: '情况',
    detailLabel: '补充',
    detailPlaceholder: '例如 量少、带毛',
    choices: [
      { value: '正常', label: '正常' },
      { value: '偏软', label: '偏软' },
      { value: '偏硬', label: '偏硬' },
      { value: '异常', label: '异常' },
    ],
  },
  urine: {
    choiceLabel: '情况',
    detailLabel: '次数或尿团',
    detailPlaceholder: '例如 2 个尿团',
    choices: [
      { value: '正常', label: '正常' },
      { value: '偏少', label: '偏少' },
      { value: '偏多', label: '偏多' },
      { value: '未观察', label: '未观察' },
    ],
  },
  'litter-change': {
    choiceLabel: '怎么换的',
    detailLabel: '猫砂盆',
    detailPlaceholder: '例如 2 个',
    choices: [
      { value: '整盆更换', label: '整盆更换' },
      { value: '局部清理', label: '局部清理' },
    ],
  },
  'water-change': {
    choiceLabel: '怎么换的',
    detailLabel: '处数',
    detailPlaceholder: '例如 2 处',
    choices: [
      { value: '换水', label: '换水' },
      { value: '洗水碗', label: '洗水碗' },
      { value: '换水并洗', label: '换水并洗' },
    ],
  },
}

function composeDailyLogSummary(
  type: PetDailyLogType,
  choice: string,
  detail: string,
): string {
  const extra = detail.trim()
  if (type === 'meal') {
    return extra ? `${choice} · ${extra}` : choice
  }
  if (type === 'water-change') {
    if (choice === '换水') return `换了 ${extra || '1 处'}的水`
    if (choice === '洗水碗') return extra ? `${extra} · 洗了水碗` : '洗了水碗'
    return extra ? `换水并洗了 ${extra}` : '换水并洗了水碗'
  }
  return extra ? `${extra} · ${choice}` : choice
}

const PET_PAGE_CACHE_KEY = 'pets:overview:v7'

function weightUnitLabel(unit: PetWeightUnit): string {
  return unit === 'jin' ? '斤' : 'kg'
}

function compactProfileElapsed(from: string, today: string): string {
  const elapsed = formatPetElapsed(from, today)
  if (elapsed === '还没有记录') return ''
  return elapsed === '今天' ? '0天' : elapsed.replace(/\s+/g, '')
}

function weightInUnit(kgValue: string | number, unit: PetWeightUnit): number {
  const kg = Number(kgValue)
  return unit === 'jin' ? kg * 2 : kg
}

function formatWeightInUnit(kgValue: string, unit: PetWeightUnit): string {
  const value = weightInUnit(kgValue, unit)
  if (!Number.isFinite(value)) return '—'
  return formatPetWeight(value.toFixed(1))
}

function formatWeightDelta(deltaKg: number, unit: PetWeightUnit): string {
  const delta = weightInUnit(deltaKg, unit)
  if (Math.abs(delta) < 0.05) return '和上次持平'
  return `较上次 ${delta > 0 ? '+' : ''}${delta.toFixed(1)} ${weightUnitLabel(unit)}`
}

function formatShortDate(value: string | null): string {
  if (!value) return '待补充'
  const [, month, day] = value.split('-')
  return month && day ? `${month}.${day}` : value
}

function formatFullDate(value: string | null): string {
  if (!value) return '设置日期'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${year}.${month}.${day}` : value
}

function formatBackgroundUsedAt(value: string): string {
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return '用过的照片'
  return `${formatShortDate(getShanghaiDateOnly(timestamp))} 用过`
}


Page({
  data: {
    activeSection: 'daily' as PetSection,
    profileSectionActive: false,
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
    avatarPreviewUrl: '',
    backgroundPickerOpen: false,
    uploadingBackground: false,
    backgroundOptions: (Object.keys(PET_BACKGROUND_LABELS) as PetBackgroundKey[]).map((key) => ({
      key,
      label: PET_BACKGROUND_LABELS[key],
      selected: key === EMPTY_PROFILE.backgroundKey,
    })),
    backgroundHistoryOptions: [] as BackgroundHistoryOption[],
    statusManagerOpen: false,
    statusSaving: false,
    statusEditingId: '',
    statusEditingVersion: 0,
    statusDraft: '',
    supplyEditorOpen: false,
    supplyEditorMode: 'create' as 'create' | 'edit',
    supplyEditingId: '',
    supplyEditingVersion: 0,
    supplySaving: false,
    dailyEditorOpen: false,
    dailyEditorEditingId: '',
    dailySaving: false,
    dailyEditor: {
      type: 'urine' as PetDailyLogType,
      title: '尿尿',
      iconName: 'pet-daily-urine',
      choiceLabel: '情况',
      detailLabel: '次数或尿团',
      detailPlaceholder: '例如 2 个尿团',
      choices: [] as DailyEditorOption[],
      freeform: false,
      choice: '',
      detail: '',
      recordedDate: '',
      recordedTime: '',
    },
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
      mediaThumbUrl: '',
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
    ageLabel: '',
    todayDate: getShanghaiDateOnly(Date.now()),
    birthdayLabel: '',
    birthdayElapsedLabel: '',
    homeOnLabel: '',
    homeOnElapsedLabel: '',
    neuteredOnLabel: '',
    neuteredOnElapsedLabel: '',
    latestWeight: '—',
    latestWeightKg: '',
    weightUnit: 'jin' as PetWeightUnit,
    weightUnitLabel: '斤',
    weightEditorOpen: false,
    weightSaving: false,
    weightEditorMode: 'create' as 'create' | 'edit',
    weightEditingId: '',
    weightDraftValue: '',
    weightDraftDate: '',
    weightDraftUnit: 'jin' as PetWeightUnit,
    companionDays: 0,
    featuredSupply: null as {
      id: string
      categoryLabel: string
      iconName: string
      name: string
      note: string
    } | null,
    weightPoints: [] as Array<{
      id: string
      value: string
      valueKg: string
      dateLabel: string
      height: number
      active: boolean
    }>,
    weightTrendLabel: '',
    growthFilters: GROWTH_FILTER_OPTIONS,
    growthFilter: 'all' as GrowthFilter,
    growthTimeline: [] as GrowthTimelineView[],
    growthTimelineFiltered: [] as GrowthTimelineView[],
    growthTimelineVisible: [] as GrowthTimelineView[],
    growthTimelineExpanded: false,
    careFilters: CARE_FILTER_OPTIONS,
    careFilter: 'all' as CareFilter,
    careCards: [] as CareCardView[],
    careTimeline: [] as CareTimelineView[],
    careTimelineFiltered: [] as CareTimelineView[],
    careTimelineVisible: [] as CareTimelineView[],
    careTimelineExpanded: false,
    dailySummary: [] as Array<
      ReturnType<typeof buildPetDailySummary>[number] & {
        iconName: string
        metaLabel: string
      }
    >,
    dailyHistory: [] as DailyTimelineView[],
    dailyHistoryVisible: [] as DailyTimelineView[],
    dailyHistoryExpanded: false,
    supplyCategories: SUPPLY_CATEGORIES.map((item) => ({ ...item, count: 0 })),
    supplyTagManagerOpen: false,
    supplyTags: [] as SupplyTagView[],
    selectedSupplyTagKey: '',
    selectedSupplyTag: null as SupplyTagView | null,
    supplyTagDeleteConfirm: false,
    selectedSupplyCategory: 'all' as SupplyFilter,
    currentSupplies: [] as Array<{
      id: string
      category: PetSupplyCategory
      categoryLabel: string
      name: string
      note: string
      preference: PetSupplyPreference
      preferenceLabel: string
      preferenceHearts: string
    }>,
    supplies: [] as Array<{
      id: string
      category: PetSupplyCategory
      categoryLabel: string
      iconName: string
      name: string
      brand: string
      mediaUrl: string
      mediaThumbUrl: string
      preference: PetSupplyPreference
      preferenceLabel: string
      preferenceHearts: string
      note: string
      recordedOn: string
    }>,
  },

  onLoad(options: Record<string, string | undefined>) {
    const savedWeightUnit = String(wx.getStorageSync(WEIGHT_UNIT_STORAGE_KEY) || '')
    const weightUnit: PetWeightUnit = savedWeightUnit === 'kg' ? 'kg' : 'jin'
    this.setData({ weightUnit, weightUnitLabel: weightUnitLabel(weightUnit) })
    const cached = readPageCache<Record<string, unknown>>(PET_PAGE_CACHE_KEY)
    if (cached) {
      this.setData({
        ...cached.value,
        loading: false,
        syncing: false,
        hasLoaded: true,
        cacheFresh: cached.fresh,
        hasShown: false,
        activeSection: 'daily' as PetSection,
        profileSectionActive: false,
        uploadingAvatar: false,
        statusManagerOpen: false,
        statusSaving: false,
        statusEditingId: '',
        statusDraft: '',
        supplyEditorOpen: false,
        supplyEditorMode: 'create',
        supplyEditingId: '',
        weightEditorOpen: false,
        weightSaving: false,
        dailyEditorOpen: false,
        dailyEditorEditingId: '',
        dailySaving: false,
        dailyHistoryExpanded: false,
      })
    }
    const section = options.section
    if (
      section === 'profile' ||
      section === 'care' ||
      section === 'daily' ||
      section === 'supplies'
    ) {
      this.setData({
        activeSection: section,
        profileSectionActive: section === 'profile',
      })
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
          profileInitial: '',
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
        profileInitial: '',
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
      statusManagerOpen: _statusManagerOpen,
      statusSaving: _statusSaving,
      supplyEditorOpen: _supplyEditorOpen,
      supplyEditingId: _supplyEditingId,
      supplySaving: _supplySaving,
      weightEditorOpen: _weightEditorOpen,
      weightSaving: _weightSaving,
      dailyEditorOpen: _dailyEditorOpen,
      dailyEditorEditingId: _dailyEditorEditingId,
      dailySaving: _dailySaving,
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
      statusManagerOpen: false,
      statusSaving: false,
      supplyEditorOpen: false,
      supplyEditingId: '',
      supplySaving: false,
      weightEditorOpen: false,
      weightSaving: false,
      dailyEditorOpen: false,
      dailyEditorEditingId: '',
      dailySaving: false,
    })
  },

  async runPetMutation(
    operation: () => Promise<DemoPetState>,
    successText: string,
    showSuccess = true,
  ): Promise<boolean> {
    if (!requireAuthForWrite()) return false
    this.setData({ syncing: true, syncState: 'pending', errorText: '' })
    try {
      const state = await operation()
      this.applyPetState(state)
      if (showSuccess) wx.showToast({ title: successText, icon: 'success' })
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
    const activeSection = event.currentTarget.dataset.value
    this.setData({
      activeSection,
      profileSectionActive: activeSection === 'profile',
    })
  },

  onToggleGrowthTimeline() {
    const growthTimelineExpanded = !this.data.growthTimelineExpanded
    this.setData({
      growthTimelineExpanded,
      growthTimelineVisible: growthTimelineExpanded
        ? this.data.growthTimelineFiltered
        : this.data.growthTimelineFiltered.slice(0, 5),
    })
  },

  onSelectGrowthFilter(event: {
    currentTarget: { dataset: { value: GrowthFilter } }
  }) {
    const growthFilter = event.currentTarget.dataset.value
    const growthTimelineFiltered = filterGrowthTimeline(
      this.data.growthTimeline,
      growthFilter,
    )
    this.setData({
      growthFilter,
      growthTimelineExpanded: false,
      growthTimelineFiltered,
      growthTimelineVisible: growthTimelineFiltered.slice(0, 5),
    })
  },

  onToggleCareTimeline() {
    const careTimelineExpanded = !this.data.careTimelineExpanded
    this.setData({
      careTimelineExpanded,
      careTimelineVisible: careTimelineExpanded
        ? this.data.careTimelineFiltered
        : this.data.careTimelineFiltered.slice(0, 5),
    })
  },

  onSelectCareFilter(event: {
    currentTarget: { dataset: { value: CareFilter } }
  }) {
    const careFilter = event.currentTarget.dataset.value
    const careTimelineFiltered = filterCareTimeline(this.data.careTimeline, careFilter)
    this.setData({
      careFilter,
      careTimelineExpanded: false,
      careTimelineFiltered,
      careTimelineVisible: careTimelineFiltered.slice(0, 5),
    })
  },

  onToggleDailyHistory() {
    const dailyHistoryExpanded = !this.data.dailyHistoryExpanded
    this.setData({
      dailyHistoryExpanded,
      dailyHistoryVisible: dailyHistoryExpanded
        ? this.data.dailyHistory
        : this.data.dailyHistory.slice(0, 5),
    })
  },

  loadState(state: DemoPetState) {
    const today = getShanghaiDateOnly(Date.now())
    const growthTimeline: GrowthTimelineView[] = buildPetGrowthTimeline(state).map((item) => {
      const [, month = '', day = ''] = item.occurredOn.split('-')
      return {
        ...item,
        iconName: GROWTH_ICON_NAMES[item.type],
        yearLabel: item.occurredOn.slice(0, 4) || '日期',
        dateLabel: month && day ? `${Number(month)}月${Number(day)}日` : item.occurredOn,
        elapsedLabel: formatPetElapsed(item.occurredOn, today),
      }
    })
    const weights = state.weights.slice(-6)
    const values = weights.map((item) => Number(item.value)).filter(Number.isFinite)
    const min = values.length ? Math.min(...values) : 0
    const max = values.length ? Math.max(...values) : 0
    const spread = Math.max(max - min, 0.1)
    const weightPoints = weights.map((item, index) => ({
      id: item.id,
      value: formatWeightInUnit(item.value, this.data.weightUnit),
      valueKg: item.value,
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
        : formatWeightDelta(weightDelta, this.data.weightUnit)
    const dailySummary = buildPetDailySummary(state.dailyLogs, today).map((item) => ({
      ...item,
      iconName: PET_DAILY_ICON_NAMES[item.type],
    }))
    const dailyHistory: DailyTimelineView[] = buildPetDailyTimeline(state.dailyLogs).map((item) => ({
      ...item,
      iconName: PET_DAILY_ICON_NAMES[item.type],
      metaLabel: item.elapsedLabel === '刚刚' ? '刚刚' : `${item.elapsedLabel}前`,
    }))
    const careCards: CareCardView[] = buildPetCareCards(state.events, today).map((item) => ({
      ...item,
      iconName: PET_EVENT_ICON_NAMES[item.type],
      lastOnLabel: item.lastOn ? item.lastOn.replace(/-/g, '.') : '',
    }))
    const careTimeline: CareTimelineView[] = buildPetCareTimeline(state.events).map((item) => {
      const [, month = '', day = ''] = item.occurredOn.split('-')
      return {
        ...item,
        iconName: PET_EVENT_ICON_NAMES[item.type],
        yearLabel: item.occurredOn.slice(0, 4) || '日期',
        dateLabel: month && day ? `${Number(month)}月${Number(day)}日` : item.occurredOn,
        elapsedLabel: formatPetElapsed(item.occurredOn, today),
      }
    })
    const growthTimelineFiltered = filterGrowthTimeline(
      growthTimeline,
      this.data.growthFilter,
    )
    const careTimelineFiltered = filterCareTimeline(
      careTimeline,
      this.data.careFilter,
    )
    const currentSupplies = getCurrentPetSupplies(state.supplies).map((item) => ({
      id: item.id,
      category: item.category,
      categoryLabel: item.category === 'custom'
        ? (item.categoryLabel.trim() || '自定义')
        : PET_SUPPLY_CATEGORY_LABELS[item.category],
      iconName: PET_SUPPLY_ICON_NAMES[item.category],
      name: item.name,
      note: item.note,
      preference: item.preference,
      preferenceLabel: getPetSupplyPreferenceLabel(item.preference),
      preferenceHearts: getPetSupplyPreferenceHearts(item.preference),
    }))
    const homeTimestamp = Date.parse(`${state.profile.homeOn}T00:00:00.000Z`)
    const todayTimestamp = Date.parse(`${today}T00:00:00.000Z`)
    const companionDays =
      Number.isFinite(homeTimestamp) && Number.isFinite(todayTimestamp)
        ? Math.max(1, Math.floor((todayTimestamp - homeTimestamp) / 86400000) + 1)
        : 0
    const backgroundOptions = (Object.keys(PET_BACKGROUND_LABELS) as PetBackgroundKey[]).map((key) => ({
      key,
      label: PET_BACKGROUND_LABELS[key],
      selected: state.profile.backgroundKey === key && !state.profile.backgroundMediaId,
    }))
    const backgroundHistoryOptions = (state.profile.backgroundHistory ?? [])
      .filter((item) => Boolean(item.url))
      .map((item) => ({
        mediaId: item.mediaId,
        url: item.url ?? '',
        usedAtLabel: formatBackgroundUsedAt(item.usedAt),
        selected: state.profile.backgroundMediaId === item.mediaId,
      }))

    const hiddenSupplyTags = readHiddenSupplyTags()
    const supplyCategories = buildSupplyCategories(state.supplies, hiddenSupplyTags)
    const selectedSupplyCategory = supplyCategories.some(
      (item) => item.value === this.data.selectedSupplyCategory,
    ) ? this.data.selectedSupplyCategory : 'all'

    this.setData({
      hasActivePet: true,
      petState: state,
      profile: state.profile,
      profileInitial: state.profile.name.slice(0, 1),
      avatarPreviewUrl: '',
      backgroundOptions,
      backgroundHistoryOptions,
      ageLabel: formatPetAge(state.profile.birthday, today),
      todayDate: today,
      birthdayLabel: formatFullDate(state.profile.birthday),
      birthdayElapsedLabel: compactProfileElapsed(state.profile.birthday, today),
      homeOnLabel: formatFullDate(state.profile.homeOn),
      homeOnElapsedLabel: compactProfileElapsed(state.profile.homeOn, today),
      neuteredOnLabel: formatFullDate(state.profile.neuteredOn),
      neuteredOnElapsedLabel: compactProfileElapsed(state.profile.neuteredOn ?? '', today),
      latestWeight: latestValue ? formatWeightInUnit(latestValue.value, this.data.weightUnit) : '—',
      latestWeightKg: latestValue?.value ?? '',
      weightUnitLabel: weightUnitLabel(this.data.weightUnit),
      companionDays,
      featuredSupply: currentSupplies[0] ?? null,
      weightPoints,
      weightTrendLabel,
      growthTimeline,
      growthTimelineFiltered,
      growthTimelineVisible: this.data.growthTimelineExpanded
        ? growthTimelineFiltered
        : growthTimelineFiltered.slice(0, 5),
      careCards,
      careTimeline,
      careTimelineFiltered,
      careTimelineVisible: this.data.careTimelineExpanded
        ? careTimelineFiltered
        : careTimelineFiltered.slice(0, 5),
      dailySummary: dailySummary.map((item) => ({
        ...item,
        metaLabel: item.elapsedLabel === '还没有记录'
          ? '还没有记录'
          : item.count > 0
            ? `今天 ${item.count} 次 · ${item.elapsedLabel === '刚刚' ? '刚刚' : `${item.elapsedLabel}前`}`
            : `上次 ${item.elapsedLabel === '刚刚' ? '刚刚' : `${item.elapsedLabel}前`}`,
      })),
      dailyHistory,
      dailyHistoryVisible: this.data.dailyHistoryExpanded
        ? dailyHistory
        : dailyHistory.slice(0, 5),
      currentSupplies,
      supplyCategories,
      selectedSupplyCategory,
      supplies: filterPetSupplies(state.supplies, selectedSupplyCategory).map((item) => ({
        ...item,
        categoryLabel: item.category === 'custom'
          ? (item.categoryLabel.trim() || '自定义')
          : PET_SUPPLY_CATEGORY_LABELS[item.category],
        iconName: PET_SUPPLY_ICON_NAMES[item.category],
        mediaUrl: item.mediaUrl ?? '',
        mediaThumbUrl: item.mediaThumbUrl ?? item.mediaUrl ?? '',
        preferenceLabel: getPetSupplyPreferenceLabel(item.preference),
        preferenceHearts: getPetSupplyPreferenceHearts(item.preference),
      })),
    }, () => this.cacheCurrentPage())
    void this.loadAvatarPreview(state.profile)
  },

  async loadAvatarPreview(profile: DemoPetProfile) {
    if (!profile.id || !profile.avatarMediaId) return
    try {
      const asset = await mediaGateway.get(profile.avatarMediaId)
      if (
        this.data.petState.profile.id !== profile.id
        || this.data.profile.avatarMediaId !== profile.avatarMediaId
      ) return
      this.setData({ avatarPreviewUrl: asset.display.url || asset.thumb.url || '' })
    } catch {
      if (this.data.petState.profile.id === profile.id) {
        this.setData({ avatarPreviewUrl: profile.avatarUrl || '' })
      }
    }
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
    this.setData({ selectedSupplyCategory: 'all', syncing: true })
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
    if (this.data.petTabs.length <= 1) return
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

  onAddPetWithConfirm() {
    if (!requireAuthForWrite()) return
    wx.showModal({
      title: '再添加一只伙伴？',
      content: '会新建一份独立的宠物档案，已有记录不会受到影响。',
      confirmText: '继续添加',
      cancelText: '先不添加',
      confirmColor: '#b86772',
      success: (result) => {
        if (result.confirm) wx.navigateTo({ url: '/pages/pet-form/index' })
      },
    })
  },

  noop() {},

  onOpenStatusManager() {
    this.setData({
      statusManagerOpen: true,
      statusEditingId: '',
      statusEditingVersion: 0,
      statusDraft: '',
    })
  },

  onCloseStatusManager() {
    if (this.data.statusSaving) return
    this.setData({ statusManagerOpen: false })
  },

  onStartAddStatus() {
    if (!requireAuthForWrite()) return
    if (this.data.profile.statusNotes.length >= 2) {
      wx.showToast({ title: '最近状态最多保留 2 条', icon: 'none' })
      return
    }
    this.setData({
      statusEditingId: '',
      statusEditingVersion: 0,
      statusDraft: '',
    })
  },

  onEditStatus(event: {
    currentTarget: { dataset: { id: string; version: string } }
  }) {
    if (!requireAuthForWrite()) return
    const { id, version } = event.currentTarget.dataset
    const note = this.data.profile.statusNotes.find((item) => item.id === id)
    if (!note) return
    this.setData({
      statusEditingId: id,
      statusEditingVersion: Number(version) || note.version,
      statusDraft: note.content,
    })
  },

  onStatusDraftInput(event: WechatMiniprogram.Input) {
    this.setData({ statusDraft: event.detail.value })
  },

  async onSaveStatusNote() {
    const content = this.data.statusDraft.trim()
    if (!content) {
      wx.showToast({ title: '先写一条最近状态', icon: 'none' })
      return
    }
    this.setData({ statusSaving: true })
    const editingId = this.data.statusEditingId
    const saved = await this.runPetMutation(
      () => editingId
        ? petGateway.updateStatusNote(
            this.data.petState.profile.id,
            editingId,
            content,
            this.data.statusEditingVersion,
          )
        : petGateway.createStatusNote(this.data.petState.profile.id, content),
      editingId ? '状态已更新' : '状态已添加',
    )
    this.setData({
      statusSaving: false,
      statusEditingId: saved ? '' : this.data.statusEditingId,
      statusEditingVersion: saved ? 0 : this.data.statusEditingVersion,
      statusDraft: saved ? '' : this.data.statusDraft,
    })
  },

  onRemoveStatusNote(event: {
    currentTarget: { dataset: { id: string; version: string } }
  }) {
    if (!requireAuthForWrite()) return
    const { id } = event.currentTarget.dataset
    const note = this.data.profile.statusNotes.find((item) => item.id === id)
    if (!note) return
    wx.showModal({
      title: '删除这条最近状态？',
      content: '删除后只会移出最近状态，不影响日常记录。',
      confirmText: '删除',
      confirmColor: '#b35f6d',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ statusSaving: true })
        await this.runPetMutation(
          () => petGateway.removeStatusNote(
            this.data.petState.profile.id,
            note.id,
            note.version,
          ),
          '状态已删除',
        )
        this.setData({ statusSaving: false, statusEditingId: '', statusDraft: '' })
      },
    })
  },

  onOpenLatestDailyRecord() {
    this.setData({
      statusManagerOpen: false,
      activeSection: 'daily',
      profileSectionActive: false,
    }, () => {
      setTimeout(() => {
        wx.pageScrollTo({ selector: '#daily-history', duration: 260 })
      }, 40)
    })
  },

  async onOpenAvatarPreview() {
    if (!this.data.profile.id) return
    this.setData({ avatarPreviewOpen: true })
    if (!this.data.profile.avatarMediaId) return
    try {
      const asset = await mediaGateway.get(this.data.profile.avatarMediaId)
      this.setData({ avatarPreviewUrl: asset.display.url || asset.thumb.url || '' })
    } catch {
      // 预览失败时保留档案列表里的缩略图，不阻断弹层。
    }
  },

  onCloseAvatarPreview() {
    if (this.data.uploadingAvatar) return
    this.setData({ avatarPreviewOpen: false })
  },

  async onChooseAvatar() {
    if (this.data.uploadingAvatar || this.data.syncing) return
    if (!requireAuthForWrite()) return
    try {
      const [file] = await chooseEditableImages({ count: 1, cropSquare: true })
      if (file) await this.uploadPetAvatar(file.tempFilePath, file.size)
    } catch (error) {
      if (!isImageEditCancelled(error)) {
        showMediaUploadError(error, '照片没有准备好')
      }
    }
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
      this.setData({
        avatarPreviewOpen: false,
        avatarPreviewUrl: asset.display.url || asset.thumb.url || '',
      })
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
          this.setData({ avatarPreviewOpen: false, avatarPreviewUrl: '' })
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
    this.setData({ 'profile.avatarUrl': '', avatarPreviewUrl: '' })
  },

  onOpenBackgroundPicker() {
    if (!requireAuthForWrite()) return
    const profile = this.data.profile
    this.setData({
      backgroundPickerOpen: true,
      backgroundOptions: this.data.backgroundOptions.map((item) => ({
        ...item,
        selected: item.key === profile.backgroundKey && !profile.backgroundMediaId,
      })),
      backgroundHistoryOptions: this.data.backgroundHistoryOptions.map((item) => ({
        ...item,
        selected: item.mediaId === profile.backgroundMediaId,
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
          backgroundUrl: '',
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

  async onSelectBackgroundHistory(event: {
    currentTarget: { dataset: { mediaId: string } }
  }) {
    const mediaId = event.currentTarget.dataset.mediaId
    const option = this.data.backgroundHistoryOptions.find((item) => item.mediaId === mediaId)
    const profile = this.data.profile
    if (!option) return
    if (profile.backgroundMediaId === mediaId && profile.backgroundUrl === option.url) {
      this.setData({ backgroundPickerOpen: false })
      return
    }
    this.setData({ uploadingBackground: true })
    try {
      const updated = await petGateway.updateProfile(
        profile.id,
        {
          ...toPetProfileInput(profile),
          backgroundMediaId: option.mediaId,
          backgroundUrl: option.url,
        },
        profile.version ?? 1,
      )
      this.applyPetState(updated)
      this.setData({ backgroundPickerOpen: false })
      wx.showToast({ title: '已换回这张背景', icon: 'success' })
    } catch (error) {
      wx.showToast({ title: getPetErrorMessage(error, '背景没有保存成功'), icon: 'none' })
    } finally {
      this.setData({ uploadingBackground: false })
    }
  },

  async onChooseBackground() {
    if (this.data.uploadingBackground || this.data.syncing) return
    if (!requireAuthForWrite()) return
    try {
      const [file] = await chooseEditableImages({ count: 1 })
      if (file) await this.uploadPetBackground(file.tempFilePath, file.size)
    } catch (error) {
      if (!isImageEditCancelled(error)) {
        showMediaUploadError(error, '背景图没有准备好')
      }
    }
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
          backgroundUrl: asset.display.url || asset.thumb.url || '',
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
      supplyEditorMode: 'create',
      supplyEditingId: '',
      supplyEditingVersion: 0,
      supplyDraft: {
        category: 'kibble',
        categoryLabel: '',
        name: '',
        brand: '',
        preference: 'neutral',
        note: '',
        mediaId: '',
        mediaUrl: '',
        mediaThumbUrl: '',
      },
    })
  },

  onEditSupply(event: {
    currentTarget: { dataset: { id: string } }
  }) {
    if (!requireAuthForWrite()) return
    const id = event.currentTarget.dataset.id
    const supply = this.data.petState.supplies.find((item) => item.id === id)
    if (!supply) return
    this.setData({
      supplyEditorOpen: true,
      supplyEditorMode: 'edit',
      supplyEditingId: supply.id,
      supplyEditingVersion: supply.version ?? 1,
      supplyDraft: {
        category: supply.category,
        categoryLabel: supply.category === 'custom' ? supply.categoryLabel : '',
        name: supply.name,
        brand: supply.brand,
        preference: supply.preference,
        note: supply.note,
        mediaId: supply.mediaId ?? '',
        mediaUrl: supply.mediaUrl ?? '',
        mediaThumbUrl: supply.mediaThumbUrl ?? supply.mediaUrl ?? '',
      },
    })
  },

  async onPreviewSupplyImage(event: {
    currentTarget: { dataset: { id: string } }
  }) {
    const id = event.currentTarget.dataset.id
    const supply = this.data.petState.supplies.find((item) => item.id === id)
    if (!supply?.mediaId) return
    try {
      const asset = await mediaGateway.get(supply.mediaId)
      const url = asset.display.url || asset.thumb.url
      if (url) wx.previewImage({ current: url, urls: [url] })
    } catch (error) {
      showMediaUploadError(error, '图片暂时无法查看')
    }
  },

  async onPreviewSupplyEditorImage() {
    const url = this.data.supplyDraft.mediaUrl
      || this.data.supplyDraft.mediaThumbUrl
    if (!url) return
    wx.previewImage({ current: url, urls: [url] })
  },

  async onEditSupplyImage() {
    if (this.data.supplySaving) return
    const draft = this.data.supplyDraft
    let source = draft.mediaUrl
    if (!source && draft.mediaId) {
      try {
        const asset = await mediaGateway.get(draft.mediaId)
        source = asset.display.url || asset.thumb.url
      } catch (error) {
        showMediaUploadError(error, '图片暂时无法编辑')
        return
      }
    }
    if (!source) return
    try {
      this.setData({ supplySaving: true })
      const localPath = await editRemoteImage(source)
      const asset = await mediaGateway.upload(localPath, 'pet')
      this.setData({
        'supplyDraft.mediaId': asset.id,
        'supplyDraft.mediaUrl': asset.display.url || asset.thumb.url,
        'supplyDraft.mediaThumbUrl': asset.thumb.url || asset.display.url,
      })
      wx.showToast({ title: '图片已更新', icon: 'success' })
    } catch (error) {
      if (!isImageEditCancelled(error)) {
        showMediaUploadError(error, '用品图片没有更新成功')
      }
    } finally {
      this.setData({ supplySaving: false })
    }
  },

  onCloseSupplyEditor() {
    if (this.data.supplySaving) return
    this.setData({ supplyEditorOpen: false, supplyEditingId: '' })
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

  async onChooseSupplyImage() {
    if (this.data.supplySaving) return
    try {
      const [file] = await chooseEditableImages({ count: 1 })
      if (!file) return
      this.setData({ supplySaving: true })
      const asset = await mediaGateway.upload(file.tempFilePath, 'pet', file.size)
      this.setData({
        'supplyDraft.mediaId': asset.id,
        'supplyDraft.mediaUrl': asset.display.url || asset.thumb.url,
        'supplyDraft.mediaThumbUrl': asset.thumb.url || asset.display.url,
      })
    } catch (error) {
      if (!isImageEditCancelled(error)) {
        showMediaUploadError(error, '用品图片没有上传成功')
      }
    } finally {
      this.setData({ supplySaving: false })
    }
  },

  onRemoveSupplyImage() {
    this.setData({
      'supplyDraft.mediaId': '',
      'supplyDraft.mediaUrl': '',
      'supplyDraft.mediaThumbUrl': '',
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
    const hiddenTags = readHiddenSupplyTags()
    if (hiddenTags.includes(draft.category)) {
      writeHiddenSupplyTags(hiddenTags.filter((key) => key !== draft.category))
    }
    this.setData({ supplySaving: true })
    const input = {
      category: draft.category,
      categoryLabel: draft.category === 'custom' ? draft.categoryLabel.trim() : '',
      name: draft.name.trim(),
      brand: draft.brand.trim(),
      preference: draft.preference,
      note: draft.note.trim(),
      mediaId: draft.mediaId,
    }
    const editingId = this.data.supplyEditingId
    const saved = await this.runPetMutation(
      () => editingId
        ? petGateway.updateSupply(
            this.data.petState.profile.id,
            editingId,
            input,
            this.data.supplyEditingVersion,
          )
        : petGateway.createSupply(this.data.petState.profile.id, input),
      editingId ? '用品信息已更新' : '用品已收进清单',
    )
    this.setData({
      supplySaving: false,
      supplyEditorOpen: !saved,
      supplyEditingId: saved ? '' : this.data.supplyEditingId,
    })
  },

  async onProfileDateChange(event: {
    detail: { value: string }
    currentTarget: { dataset: { field?: string } }
  }) {
    if (!requireAuthForWrite()) return
    const field = event.currentTarget.dataset.field
    const value = event.detail.value
    if (
      field !== 'birthday'
      && field !== 'homeOn'
      && field !== 'neuteredOn'
    ) return

    const profile = this.data.profile
    const today = getShanghaiDateOnly(Date.now())
    if (!value || value > today) {
      wx.showToast({ title: '请选择正确的日期', icon: 'none' })
      return
    }
    if (field === 'homeOn' && (!profile.birthday || value < profile.birthday)) {
      wx.showToast({ title: '到家日期不能早于出生日期', icon: 'none' })
      return
    }
    if (field === 'birthday' && profile.homeOn && value > profile.homeOn) {
      wx.showToast({ title: '出生日期不能晚于到家日期', icon: 'none' })
      return
    }
    if (field === 'neuteredOn' && profile.birthday && value < profile.birthday) {
      wx.showToast({ title: '绝育日期不能早于出生日期', icon: 'none' })
      return
    }

    const nextProfile: DemoPetProfile = { ...profile, [field]: value }
    await this.runPetMutation(
      () => petGateway.updateProfile(
        profile.id,
        toPetProfileInput(nextProfile),
        profile.version ?? 1,
      ),
      '档案日期已更新',
    )
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

  onToggleWeightUnit() {
    const weightUnit: PetWeightUnit = this.data.weightUnit === 'jin' ? 'kg' : 'jin'
    wx.setStorageSync(WEIGHT_UNIT_STORAGE_KEY, weightUnit)
    this.setData(
      { weightUnit, weightUnitLabel: weightUnitLabel(weightUnit) },
      () => this.loadState(this.data.petState),
    )
  },

  onRecordWeight() {
    if (!requireAuthForWrite()) return
    const recordedDate = getShanghaiDateOnly(Date.now())
    this.setData({
      weightEditorOpen: true,
      weightEditorMode: 'create',
      weightEditingId: '',
      weightDraftValue: '',
      weightDraftDate: recordedDate,
      weightDraftUnit: this.data.weightUnit,
    })
  },

  onOpenWeightRecord(event: {
    currentTarget: { dataset: { id: string } }
  }) {
    if (!requireAuthForWrite()) return
    const id = event.currentTarget.dataset.id
    const weight = this.data.petState.weights.find((item) => item.id === id)
    if (!weight) return
    this.setData({
      weightEditorOpen: true,
      weightEditorMode: 'edit',
      weightEditingId: weight.id,
      weightDraftValue: formatWeightInUnit(weight.value, this.data.weightUnit),
      weightDraftDate: weight.recordedOn,
      weightDraftUnit: this.data.weightUnit,
    })
  },

  onCloseWeightEditor() {
    if (this.data.weightSaving) return
    this.setData({ weightEditorOpen: false })
  },

  onWeightDraftInput(event: WechatMiniprogram.Input) {
    this.setData({ weightDraftValue: event.detail.value })
  },

  onWeightDateChange(event: { detail: { value: string } }) {
    this.setData({ weightDraftDate: event.detail.value })
  },

  onWeightDraftUnitSelect(event: {
    currentTarget: { dataset: { value: PetWeightUnit } }
  }) {
    const nextUnit = event.currentTarget.dataset.value
    if (!nextUnit || nextUnit === this.data.weightDraftUnit) return
    const currentValue = Number(this.data.weightDraftValue)
    const convertedValue = Number.isFinite(currentValue)
      ? nextUnit === 'jin'
        ? currentValue * 2
        : currentValue / 2
      : null
    this.setData({
      weightDraftUnit: nextUnit,
      weightDraftValue: convertedValue === null
        ? ''
        : formatPetWeight(convertedValue.toFixed(1)),
    })
  },

  async onSaveWeight() {
    const numericValue = Number(this.data.weightDraftValue)
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      wx.showToast({ title: '请输入有效体重', icon: 'none' })
      return
    }
    const kgValue = this.data.weightDraftUnit === 'jin'
      ? numericValue / 2
      : numericValue
    if (kgValue > 100) {
      wx.showToast({ title: '体重看起来太大了，请检查单位', icon: 'none' })
      return
    }
    if (!this.data.weightDraftDate) {
      wx.showToast({ title: '请选择记录日期', icon: 'none' })
      return
    }
    const input = {
      value: kgValue.toFixed(2).replace(/0+$/, '').replace(/\.$/, ''),
      recordedOn: this.data.weightDraftDate,
    }
    this.setData({ weightSaving: true })
    const editingId = this.data.weightEditingId
    const saved = await this.runPetMutation(
      () => editingId
        ? petGateway.updateWeight(this.data.petState.profile.id, editingId, input)
        : petGateway.addWeight(this.data.petState.profile.id, input),
      editingId ? '体重记录已更新' : '体重已记下',
    )
    this.setData({ weightSaving: false, weightEditorOpen: !saved })
  },

  onDeleteWeight() {
    if (!requireAuthForWrite() || !this.data.weightEditingId) return
    const weightId = this.data.weightEditingId
    wx.showModal({
      title: '删除这条体重记录？',
      content: '删除后，体重曲线会重新计算。',
      confirmText: '删除',
      confirmColor: '#b35f6d',
      success: async (result) => {
        if (!result.confirm) return
        this.setData({ weightSaving: true })
        const saved = await this.runPetMutation(
          () => petGateway.removeWeight(this.data.petState.profile.id, weightId),
          '体重记录已删除',
        )
        this.setData({ weightSaving: false, weightEditorOpen: !saved })
      },
    })
  },

  onAddGrowthRecord() {
    if (!requireAuthForWrite()) return
    wx.showActionSheet({
      itemList: ['记录疫苗', '记录体重', '记录就诊', '记录体检'],
      success: (result) => {
        if (result.tapIndex === 0) {
          wx.navigateTo({
            url: `/pages/pet-event-form/index?type=vaccine&date=${getShanghaiDateOnly(Date.now())}`,
          })
          return
        }
        if (result.tapIndex === 1) {
          this.onRecordWeight()
          return
        }
        const type = result.tapIndex === 2 ? 'visit' : 'checkup'
        wx.navigateTo({
          url: `/pages/pet-event-form/index?type=${type}&date=${getShanghaiDateOnly(Date.now())}`,
        })
      },
    })
  },

  onAddCareEvent() {
    if (!requireAuthForWrite()) return
    wx.showActionSheet({
      itemList: PET_CARE_TYPES.map((type) => PET_EVENT_LABELS[type]),
      success: (result) => {
        const type = PET_CARE_TYPES[result.tapIndex]
        if (type) {
          wx.navigateTo({
            url: `/pages/pet-event-form/index?type=${type}&date=${getShanghaiDateOnly(Date.now())}`,
          })
        }
      },
    })
  },

  onOpenGrowthRecord(event: {
    currentTarget: {
      dataset: { eventId?: string; weightId?: string; type?: PetGrowthItemType }
    }
  }) {
    const { eventId, weightId, type } = event.currentTarget.dataset
    if (type === 'weight' && weightId) {
      this.onOpenWeightRecord({ currentTarget: { dataset: { id: weightId } } })
      return
    }
    if (eventId) {
      this.onOpenEvent({ currentTarget: { dataset: { id: eventId } } })
    }
  },

  onOpenEvent(event: { currentTarget: { dataset: { id: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!this.data.petState.events.some((item) => item.id === id)) return
    wx.navigateTo({ url: `/pages/pet-event-detail/index?id=${id}` })
  },

  onOpenCalendar() {
    wx.navigateTo({ url: '/pages/pet-calendar/index' })
  },

  onRecordCare(event: {
    currentTarget: { dataset: { type: PetCareType } }
  }) {
    if (!requireAuthForWrite()) return
    const type = event.currentTarget.dataset.type
    wx.navigateTo({
      url: `/pages/pet-event-form/index?type=${type}&date=${getShanghaiDateOnly(Date.now())}`,
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

  onManageSupplyCategories() {
    const tags = buildSupplyTags(this.data.petState.supplies, readHiddenSupplyTags())
    const selected = tags.find((tag) => tag.key === this.data.selectedSupplyCategory)
      ?? tags.find((tag) => tag.count > 0)
      ?? tags[0]
      ?? null
    this.setData({
      supplyTagManagerOpen: true,
      supplyTags: tags,
      selectedSupplyTagKey: selected?.key ?? '',
      selectedSupplyTag: selected,
    })
  },

  onCloseSupplyTagManager() {
    this.setData({
      supplyTagManagerOpen: false,
      supplyTags: [],
      selectedSupplyTagKey: '',
      selectedSupplyTag: null,
      supplyTagDeleteConfirm: false,
    })
  },

  onSelectSupplyTag(event: { currentTarget: { dataset: { key?: string } } }) {
    const key = event.currentTarget.dataset.key
    if (!key) return
    const selected = this.data.supplyTags.find((tag) => tag.key === key) ?? null
    this.setData({
      selectedSupplyTagKey: key,
      selectedSupplyTag: selected,
      supplyTagDeleteConfirm: false,
    })
  },

  onRenameSupplyTag() {
    const tag = this.data.selectedSupplyTag
    if (!tag) return
    if (!tag.custom) {
      wx.showToast({ title: '预设标签暂不支持重命名', icon: 'none' })
      return
    }
    this.promptRenameSupplyCategory(tag.label)
  },

  onDeleteSupplyTag() {
    const tag = this.data.selectedSupplyTag
    if (!tag) return
    if (tag.count > 0) {
      wx.showToast({ title: `标签内还有 ${tag.count} 件用品，不能删除`, icon: 'none' })
      return
    }
    if (!this.data.supplyTagDeleteConfirm) {
      this.setData({ supplyTagDeleteConfirm: true })
      return
    }
    if (!tag.custom) {
      writeHiddenSupplyTags([...new Set([...readHiddenSupplyTags(), tag.key])])
    }
    this.setData({
      supplyTagManagerOpen: false,
      supplyTags: [],
      selectedSupplyTagKey: '',
      selectedSupplyTag: null,
      supplyTagDeleteConfirm: false,
    })
    void this.loadState(this.data.petState)
    wx.showToast({ title: '标签已删除', icon: 'success' })
  },

  promptRenameSupplyCategory(oldLabel: string) {
    wx.showModal({
      title: '重命名自定义标签',
      content: oldLabel,
      editable: true,
      placeholderText: '新的标签名',
      confirmText: '保存',
      success: (result) => {
        if (!result.confirm) return
        const nextLabel = (result.content ?? '').trim()
        if (!nextLabel || nextLabel === oldLabel) return
        void this.renameSupplyCategory(oldLabel, nextLabel).then(() => {
          this.setData({ supplyTagManagerOpen: false })
        })
      },
    })
  },

  async renameSupplyCategory(oldLabel: string, nextLabel: string) {
    if (!requireAuthForWrite()) return
    const petId = this.data.petState.profile.id
    const targets = this.data.petState.supplies.filter(
      (item) => item.category === 'custom'
        && (item.categoryLabel.trim() || '自定义') === oldLabel,
    )
    if (!petId || !targets.length) return
    await this.runPetMutation(async () => {
      let latest = this.data.petState
      for (const supply of targets) {
        latest = await petGateway.updateSupply(petId, supply.id, {
          category: 'custom',
          categoryLabel: nextLabel,
          name: supply.name,
          brand: supply.brand,
          preference: supply.preference,
          note: supply.note,
          mediaId: supply.mediaId ?? '',
        }, supply.version ?? 1)
      }
      return latest
    }, '标签已更新')
  },

  onAddDailyLog(event: {
    currentTarget: { dataset: { type: PetDailyLogType } }
  }) {
    this.openDailyEditor(event.currentTarget.dataset.type)
  },

  onOpenDailyRecord() {
    this.openDailyEditor('record')
  },

  openDailyEditor(type: PetDailyLogType) {
    if (!requireAuthForWrite()) return
    const config = DAILY_EDITOR_CONFIGS[type]
    const recorded = toTravelDateTimeParts(new Date().toISOString())
    this.setData({
      dailyEditorOpen: true,
      dailyEditorEditingId: '',
      dailyEditor: {
        type,
        title: type === 'record' ? '写一条记录' : PET_DAILY_LOG_LABELS[type],
        iconName: PET_DAILY_ICON_NAMES[type],
        choiceLabel: config.choiceLabel,
        detailLabel: config.detailLabel,
        detailPlaceholder: config.detailPlaceholder,
        choices: config.choices,
        choice: config.choices[0]?.value ?? '',
        detail: '',
        recordedDate: recorded.date,
        recordedTime: recorded.time,
        freeform: Boolean(config.freeform),
      },
    })
  },

  onCloseDailyEditor() {
    if (this.data.dailySaving) return
    this.setData({ dailyEditorOpen: false, dailyEditorEditingId: '' })
  },

  onDailyChoiceSelect(event: {
    currentTarget: { dataset: { value: string } }
  }) {
    this.setData({ 'dailyEditor.choice': event.currentTarget.dataset.value })
  },

  onDailyDetailInput(event: WechatMiniprogram.Input) {
    this.setData({ 'dailyEditor.detail': event.detail.value })
  },

  onDailyDateChange(event: { detail: { value: string } }) {
    this.setData({ 'dailyEditor.recordedDate': event.detail.value })
  },

  onDailyTimeChange(event: { detail: { value: string } }) {
    this.setData({ 'dailyEditor.recordedTime': event.detail.value })
  },

  async onSaveDailyLog() {
    const draft = this.data.dailyEditor
    if (draft.freeform && !draft.detail.trim()) {
      wx.showToast({ title: '先写下想记录的内容', icon: 'none' })
      return
    }
    if (!draft.freeform && !draft.choice) return
    const recordedAt = toTravelISO(draft.recordedDate, draft.recordedTime)
    if (!recordedAt) {
      wx.showToast({ title: '请选择记录时间', icon: 'none' })
      return
    }
    if (Date.parse(recordedAt) > Date.now() + 60_000) {
      wx.showToast({ title: '记录时间不能晚于现在', icon: 'none' })
      return
    }
    const summary = draft.freeform
      ? draft.detail.trim()
      : composeDailyLogSummary(draft.type, draft.choice, draft.detail)
    this.setData({ dailySaving: true })
    const editingId = this.data.dailyEditorEditingId
    const saved = await this.runPetMutation(
      () => editingId
        ? petGateway.updateDailyLog(
            this.data.petState.profile.id,
            editingId,
            { type: draft.type, summary, recordedAt },
          )
        : petGateway.addDailyLog(
            this.data.petState.profile.id,
            { type: draft.type, summary, recordedAt },
          ),
      editingId ? '记录已更新' : `${PET_DAILY_LOG_LABELS[draft.type]}已记下`,
    )
    this.setData({
      dailySaving: false,
      dailyEditorOpen: !saved,
      dailyEditorEditingId: saved ? '' : editingId,
    })
  },

  openDailyLogEditor(id: string) {
    if (!requireAuthForWrite()) return
    const log = this.data.dailyHistory.find((item) => item.id === id)
    if (!log) return
    const recorded = {
      date: log.recordedOn,
      time: log.timeLabel,
    }
    const config = DAILY_EDITOR_CONFIGS[log.type]
    this.setData({
      dailyEditorOpen: true,
      dailyEditorEditingId: log.id,
      dailyEditor: {
        type: log.type,
        title: '编辑记录',
        iconName: PET_DAILY_ICON_NAMES[log.type],
        choiceLabel: config.choiceLabel,
        detailLabel: '记录内容',
        detailPlaceholder: '改一改这次记录',
        choices: config.choices,
        choice: config.choices[0]?.value ?? '',
        detail: log.summary,
        recordedDate: recorded.date,
        recordedTime: recorded.time,
        freeform: true,
      },
    })
  },

  onDailyLogLongPress(event: {
    currentTarget: { dataset: { id: string } }
  }) {
    if (!requireAuthForWrite()) return
    const id = event.currentTarget.dataset.id
    if (!id || !this.data.dailyHistory.some((item) => item.id === id)) return
    wx.showActionSheet({
      itemList: ['编辑记录', '删除记录'],
      success: (result) => {
        if (result.tapIndex === 0) this.openDailyLogEditor(id)
        if (result.tapIndex === 1) this.confirmRemoveDailyLog(id)
      },
    })
  },

  confirmRemoveDailyLog(id: string) {
    if (!requireAuthForWrite()) return
    const log = this.data.dailyHistory.find((item) => item.id === id)
    if (!log) return
    wx.showModal({
      title: '删除这条日常记录？',
      content: `${log.actionLabel} · ${log.statusLabel}`,
      confirmText: '删除',
      confirmColor: '#b35f6d',
      success: async (result) => {
        if (!result.confirm) return
        await this.runPetMutation(
          () => petGateway.removeDailyLog(this.data.petState.profile.id, id),
          '这条记录已删除',
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
          '',
          false,
        )
      },
    })
  },

})
