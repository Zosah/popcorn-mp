import { appConfig } from '../../config/env'
import {
  buildPetDailySummary,
  type PetDailySummaryItem,
} from '../../domain/demo-pet'
import { getShanghaiDateOnly } from '../../domain/expiry'
import {
  getFeatureDefinition,
  type FeatureDefinition,
} from '../../domain/feature-catalog'
import { journalGateway } from '../../services/journal'
import { hydrateAuthState, type AuthState } from '../../services/auth'
import { promptAuthGateIfNeeded } from '../../services/auth-preview'
import { inventoryGateway } from '../../services/inventory'
import { menuGateway } from '../../services/menu'
import { petGateway } from '../../services/pet'
import { listApiSpaceMembers } from '../../services/space-gateway'
import { todoGateway } from '../../services/todo'
import type { TodoItem, TodoSummary } from '../../services/todo-gateway'
import type { SpaceMembersResult } from '../../services/space-gateway'
import { activePetFrom } from '../../services/pet-gateway'
import { readPageCache, writePageCache } from '../../services/page-cache'
import { openAppRoot } from '../../utils/app-navigation'
import { resolveAvatarUrl } from '../../utils/avatar'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

type ProfileCardTone = 'coral' | 'gold' | 'sage' | 'lilac' | 'blue'

interface ProfileFeatureCard {
  id: string
  title: string
  subtitle: string
  icon: string
  tone: string
  cardTone: ProfileCardTone
}

interface ProfileSnapshot {
  memberCount: number
  journalTotal: number
  todoCompleted: number
  todoPending: number
  inventoryTotal: number
  menuCount: number
  petName: string
  petCompleted: number
  petTotal: number
  expenseMonthTotal: number
  fitnessWeekCount: number
  travelDestination: string
  travelDueDate: string
  travelPending: number
}

const profileRequestGate = createRequestGate()
const PROFILE_PAGE_CACHE_KEY = 'profile:overview:v3'
const EMPTY_SNAPSHOT: ProfileSnapshot = {
  memberCount: 0,
  journalTotal: 0,
  todoCompleted: 0,
  todoPending: 0,
  inventoryTotal: 0,
  menuCount: 0,
  petName: '',
  petCompleted: 0,
  petTotal: 0,
  expenseMonthTotal: 0,
  fitnessWeekCount: 0,
  travelDestination: '',
  travelDueDate: '',
  travelPending: 0,
}

function buildFeatureCard(
  id: string,
  title: string,
  subtitle: string,
  cardTone: ProfileCardTone,
): ProfileFeatureCard {
  const feature = getFeatureDefinition(id)
  return {
    id,
    title,
    subtitle,
    icon: feature?.icon ?? 'list-todo',
    tone: feature?.tone ?? 'green',
    cardTone,
  }
}

function buildDailyFeatures(snapshot: ProfileSnapshot): ProfileFeatureCard[] {
  const petCopy = snapshot.petName
    ? `${snapshot.petName} · 今日 ${snapshot.petCompleted}/${snapshot.petTotal}`
    : '还没有宠物档案'
  return [
    buildFeatureCard(
      'journal',
      '生活记录',
      snapshot.journalTotal
        ? `共 ${snapshot.journalTotal} 条记录`
        : '留住普通日子',
      'coral',
    ),
    buildFeatureCard(
      'inventory',
      '家庭库存',
      snapshot.inventoryTotal
        ? `${snapshot.inventoryTotal} 件物品`
        : '整理家里的物品',
      'gold',
    ),
    buildFeatureCard(
      'todo',
      '待办计划',
      snapshot.todoPending
        ? `${snapshot.todoPending} 件待完成`
        : '今天都完成了',
      'sage',
    ),
    buildFeatureCard('pets', '宠物照护', petCopy, 'lilac'),
  ]
}

function buildPlanFeatures(snapshot: ProfileSnapshot): ProfileFeatureCard[] {
  const travelCopy = snapshot.travelDestination
    ? `${snapshot.travelDestination}${snapshot.travelDueDate ? ` · ${snapshot.travelDueDate}` : ''}`
    : snapshot.travelPending
      ? `${snapshot.travelPending} 项待准备`
      : '计划下一程'
  return [
    buildFeatureCard(
      'menu',
      '今天吃什么',
      snapshot.menuCount ? `${snapshot.menuCount} 道收藏` : '获取今晚灵感',
      'coral',
    ),
    buildFeatureCard('travel', '旅行准备', travelCopy, 'blue'),
    buildFeatureCard(
      'fitness',
      '健身计划',
      snapshot.fitnessWeekCount
        ? `本周 ${snapshot.fitnessWeekCount} 次`
        : '本周还没有记录',
      'sage',
    ),
    buildFeatureCard(
      'expense',
      '我们的账单',
      snapshot.expenseMonthTotal
        ? `本月 ¥${formatMoney(snapshot.expenseMonthTotal)}`
        : '记录每一笔花费',
      'lilac',
    ),
  ]
}

function formatMoney(value: number): string {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function formatMonthDay(value: string): string {
  const [, month, day] = value.split('-').map(Number)
  return month && day ? `${month}/${day}` : value
}

function getMonday(today: string): string {
  const [year, month, day] = today.split('-').map(Number)
  if (!year || !month || !day) return today
  const date = new Date(Date.UTC(year, month - 1, day))
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function getTogetherDays(createdAt: string, today: string): number | null {
  if (!createdAt) return null
  const timestamp = Date.parse(createdAt)
  if (Number.isNaN(timestamp)) return null
  const createdDate = getShanghaiDateOnly(timestamp)
  const start = Date.parse(`${createdDate}T00:00:00+08:00`)
  const end = Date.parse(`${today}T00:00:00+08:00`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return Math.floor((end - start) / 86400000) + 1
}

function getActiveSpaceCreatedAt(auth: AuthState): string {
  return auth.spaces.find((space) => space.id === auth.activeSpaceId)?.createdAt ?? ''
}

function getTodoActivityDate(item: TodoItem): string {
  return item.updatedAt || item.createdAt
}

function buildTodoSnapshot(
  todos: TodoItem[],
  summary: TodoSummary | null,
  today: string,
): Pick<
  ProfileSnapshot,
  'todoCompleted' | 'todoPending' | 'expenseMonthTotal' | 'fitnessWeekCount' | 'travelDestination' | 'travelDueDate' | 'travelPending'
> {
  const monthPrefix = today.slice(0, 7)
  const weekStart = getMonday(today)
  const pendingTodos = todos.filter((item) => !item.done)
  const pendingTravel = pendingTodos
    .filter((item) => item.kind === 'travel')
    .sort((left, right) => (left.dueDate || '9999-12-31').localeCompare(right.dueDate || '9999-12-31'))
  const firstTravel = pendingTravel[0]
  const expenseMonthTotal = todos
    .filter((item) => item.kind === 'expense')
    .filter((item) => getShanghaiDateOnly(Date.parse(item.createdAt)).startsWith(`${monthPrefix}-`))
    .reduce((sum, item) => sum + item.amount, 0)
  const fitnessWeekCount = todos
    .filter((item) => item.kind === 'fitness' && item.done)
    .filter((item) => {
      const activityDate = getShanghaiDateOnly(Date.parse(getTodoActivityDate(item)))
      return activityDate >= weekStart && activityDate <= today
    }).length

  return {
    todoCompleted: summary?.completed ?? todos.filter((item) => item.done).length,
    todoPending: summary?.pending ?? pendingTodos.length,
    expenseMonthTotal: Math.round(expenseMonthTotal * 100) / 100,
    fitnessWeekCount,
    travelDestination: firstTravel?.destination || '',
    travelDueDate: firstTravel?.dueDate ? formatMonthDay(firstTravel.dueDate) : '',
    travelPending: pendingTravel.length,
  }
}

function pickSnapshotValue(
  current: ProfileSnapshot,
  partial: Partial<ProfileSnapshot>,
): ProfileSnapshot {
  return {
    ...current,
    ...partial,
  }
}

Page({
  data: {
    initialLoading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    isLoggedIn: false,
    displayName: '还没有登录',
    avatarText: '访',
    avatarTone: 'lavender',
    avatarMediaId: '',
    avatarUrl: '',
    spaceName: '我们的共同空间',
    spaceEyebrow: '把普通日子安放在一起',
    spaceRelationship: '登录后开始记录共同生活',
    memberCount: 0,
    journalTotal: 0,
    todoCompleted: 0,
    todoPending: 0,
    inventoryTotal: 0,
    menuCount: 0,
    petName: '',
    petCompleted: 0,
    petTotal: 0,
    expenseMonthTotal: 0,
    fitnessWeekCount: 0,
    travelDestination: '',
    travelDueDate: '',
    travelPending: 0,
    featureCount: 4,
    dailyFeatures: buildDailyFeatures(EMPTY_SNAPSHOT) as ProfileFeatureCard[],
    planFeatures: buildPlanFeatures(EMPTY_SNAPSHOT) as ProfileFeatureCard[],
    statusBarHeight: 20,
    navBarRight: 96,
  },

  onLoad() {
    const cached = readPageCache<Record<string, unknown>>(PROFILE_PAGE_CACHE_KEY)
    if (cached) {
      this.setData({
        ...cached.value,
        initialLoading: false,
        hasLoaded: true,
        cacheFresh: cached.fresh,
        hasShown: false,
      })
    }
    this.measureNavBar()
  },

  onShow() {
    promptAuthGateIfNeeded()
    const firstShow = !this.data.hasShown
    if (firstShow) this.setData({ hasShown: true })
    if (firstShow && this.data.cacheFresh) return
    void this.refreshProfile()
  },

  onPullDownRefresh() {
    void this.refreshProfile(true)
  },

  measureNavBar() {
    try {
      const windowInfo = wx.getWindowInfo()
      const statusBarHeight = windowInfo.statusBarHeight || 20
      const menu = wx.getMenuButtonBoundingClientRect()
      this.setData({
        statusBarHeight,
        navBarRight: windowInfo.windowWidth - menu.left + 20,
      })
    } catch {
      this.setData({ statusBarHeight: 20, navBarRight: 96 })
    }
  },

  async refreshProfile(fromPullDown = false) {
    const sequence = profileRequestGate.begin()
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    const today = getShanghaiDateOnly(Date.now())
    if (firstLoad) this.setData({ initialLoading: true })

    const auth = await hydrateAuthState()
    if (!profileRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }

    const activeSpaceCreatedAt = getActiveSpaceCreatedAt(auth)
    const togetherDays = getTogetherDays(activeSpaceCreatedAt, today)
    const loggedInUser = auth.isLoggedIn ? auth.user : null
    const isLoggedIn = Boolean(loggedInUser)
    const avatarMediaId = loggedInUser?.avatarMediaId ?? ''
    const displayName = loggedInUser?.nickname || (isLoggedIn ? '待完善资料' : '还没有登录')
    const spaceName = auth.spaceName || '我们的共同空间'
    const spaceDisplayName = isLoggedIn
      ? displayName.replace(/[（(].*$/, '')
      : ''
    const spaceEyebrow = isLoggedIn
      ? `${spaceDisplayName || '我们'}的共同空间`
      : '把普通日子安放在一起'
    const spaceRelationship = togetherDays !== null
      ? `在一起生活的第 ${togetherDays} 天`
      : isLoggedIn
        ? '把每一天，轻轻收在一起'
        : '登录后开始记录共同生活'

    this.setData({
      isLoggedIn,
      displayName,
      avatarText: isLoggedIn ? auth.avatarText : '访',
      avatarTone: loggedInUser?.avatarTone ?? 'lavender',
      avatarMediaId,
      avatarUrl: this.data.avatarMediaId === avatarMediaId ? this.data.avatarUrl : '',
      spaceName,
      spaceEyebrow,
      spaceRelationship,
    })
    if (avatarMediaId) void this.loadAvatar(avatarMediaId, sequence)

    if (!appConfig.demoMode && !isLoggedIn) {
      if (firstLoad) await waitForMinimumLoading(startedAt)
      if (!profileRequestGate.isCurrent(sequence)) {
        if (fromPullDown) wx.stopPullDownRefresh()
        return
      }
      this.setData({
        ...this.buildSnapshotData(EMPTY_SNAPSHOT),
        initialLoading: false,
        hasLoaded: true,
        cacheFresh: false,
      }, () => this.cacheCurrentPage())
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }

    const [
      inventoryResult,
      journalResult,
      todoSummaryResult,
      todoListResult,
      menuResult,
      petResult,
      membersResult,
    ] = await Promise.allSettled([
      inventoryGateway.summary(today),
      journalGateway.summary(),
      todoGateway.summary(),
      todoGateway.list(),
      menuGateway.list(),
      petGateway.list(),
      auth.source === 'api' && auth.activeSpaceId
        ? listApiSpaceMembers(auth.activeSpaceId)
        : Promise.resolve(null),
    ])
    if (!profileRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }

    const inventory = inventoryResult.status === 'fulfilled'
      ? inventoryResult.value
      : null
    const journal = journalResult.status === 'fulfilled'
      ? journalResult.value
      : null
    const todoSummary = todoSummaryResult.status === 'fulfilled'
      ? todoSummaryResult.value
      : null
    const todos = todoListResult.status === 'fulfilled'
      ? todoListResult.value
      : []
    const menus = menuResult.status === 'fulfilled' ? menuResult.value : []
    const petCollection = petResult.status === 'fulfilled' ? petResult.value : null
    const members = membersResult.status === 'fulfilled' ? membersResult.value : null
    const activePet = petCollection ? activePetFrom(petCollection) : null
    const petDaily = activePet
      ? buildPetDailySummary(activePet.dailyLogs, today)
      : []
    const todoSnapshot = buildTodoSnapshot(todos, todoSummary, today)

    const currentSnapshot: ProfileSnapshot = {
      memberCount: this.data.memberCount,
      journalTotal: this.data.journalTotal,
      todoCompleted: this.data.todoCompleted,
      todoPending: this.data.todoPending,
      inventoryTotal: this.data.inventoryTotal,
      menuCount: this.data.menuCount,
      petName: this.data.petName,
      petCompleted: this.data.petCompleted,
      petTotal: this.data.petTotal,
      expenseMonthTotal: this.data.expenseMonthTotal,
      fitnessWeekCount: this.data.fitnessWeekCount,
      travelDestination: this.data.travelDestination,
      travelDueDate: this.data.travelDueDate,
      travelPending: this.data.travelPending,
    }
    const partial: Partial<ProfileSnapshot> = {}
    const memberCount = this.resolveMemberCount(members, auth)
    if (memberCount !== undefined) partial.memberCount = memberCount
    if (journal) partial.journalTotal = journal.total
    if (inventory) partial.inventoryTotal = inventory.total
    if (menuResult.status === 'fulfilled') partial.menuCount = menus.length
    if (petResult.status === 'fulfilled') {
      partial.petName = activePet?.profile.name ?? ''
      partial.petCompleted = countCompletedPetCare(petDaily)
      partial.petTotal = petDaily.length
    }
    if (todoListResult.status === 'fulfilled') {
      Object.assign(partial, todoSnapshot)
    } else if (todoSummary) {
      partial.todoCompleted = todoSummary.completed
      partial.todoPending = todoSummary.pending
    }
    const snapshot = pickSnapshotValue(currentSnapshot, partial)

    if (firstLoad) await waitForMinimumLoading(startedAt)
    if (!profileRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    this.setData({
      ...this.buildSnapshotData(snapshot),
      initialLoading: false,
      hasLoaded: true,
      cacheFresh: true,
    }, () => this.cacheCurrentPage())
    if (fromPullDown) wx.stopPullDownRefresh()
  },

  resolveMemberCount(members: SpaceMembersResult | null, auth: AuthState): number | undefined {
    if (members?.ok) return members.data.length
    if (auth.source === 'demo') return auth.isLoggedIn ? 1 : 0
    return undefined
  },

  buildSnapshotData(snapshot: ProfileSnapshot) {
    return {
      memberCount: snapshot.memberCount,
      journalTotal: snapshot.journalTotal,
      todoCompleted: snapshot.todoCompleted,
      inventoryTotal: snapshot.inventoryTotal,
      menuCount: snapshot.menuCount,
      petName: snapshot.petName,
      petCompleted: snapshot.petCompleted,
      petTotal: snapshot.petTotal,
      expenseMonthTotal: snapshot.expenseMonthTotal,
      fitnessWeekCount: snapshot.fitnessWeekCount,
      travelDestination: snapshot.travelDestination,
      travelDueDate: snapshot.travelDueDate,
      travelPending: snapshot.travelPending,
      featureCount: 4,
      dailyFeatures: buildDailyFeatures(snapshot),
      planFeatures: buildPlanFeatures(snapshot),
    }
  },

  cacheCurrentPage() {
    const data = this.data as unknown as Record<string, unknown>
    const {
      initialLoading: _initialLoading,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      ...snapshot
    } = data
    writePageCache(PROFILE_PAGE_CACHE_KEY, snapshot)
  },

  async loadAvatar(mediaId: string, sequence: number) {
    const avatarUrl = await resolveAvatarUrl(mediaId)
    if (this.data.avatarMediaId !== mediaId || !profileRequestGate.isCurrent(sequence)) return
    this.setData({ avatarUrl }, () => this.cacheCurrentPage())
  },

  onAvatarError() {
    this.setData({ avatarUrl: '' })
  },

  onOpenAuth() {
    wx.navigateTo({ url: '/pages/auth/index' })
  },

  onOpenSettings() {
    wx.navigateTo({ url: '/pages/settings/index' })
  },

  onOpenFeatureList() {
    wx.navigateTo({ url: '/pages/feature-list/index' })
  },

  onOpenSpace() {
    if (!this.data.isLoggedIn) {
      this.onOpenAuth()
      return
    }
    wx.navigateTo({ url: '/pages/space/index' })
  },

  onInvite() {
    this.onOpenSpace()
  },

  onOpenFeature(event: {
    currentTarget: { dataset: { id?: string } }
  }) {
    const feature = getFeatureDefinition(event.currentTarget.dataset.id ?? '')
    if (!feature) return
    if (feature.launchMode === 'root') {
      openAppRoot(feature.path)
      return
    }
    wx.navigateTo({ url: feature.path })
  },

  onUnload() {
    profileRequestGate.invalidate()
  },
})

function countCompletedPetCare(items: PetDailySummaryItem[]): number {
  return items.filter((item) => item.done).length
}
