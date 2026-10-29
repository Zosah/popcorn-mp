import {
  buildHomeSnapshotFromSummary,
  type HomeDayPeriod,
  type HomeSnapshot,
} from '../../domain/home'
import { getShanghaiDateOnly } from '../../domain/expiry'
import { buildDemoAvatarText, type DemoAvatarTone } from '../../domain/demo-auth'
import { buildPetCareCards, buildPetDailySummary } from '../../domain/demo-pet'
import { journalGateway } from '../../services/journal'
import type { JournalItem } from '../../services/journal-gateway'
import { hydrateAuthState } from '../../services/auth'
import { inventoryGateway } from '../../services/inventory'
import { listDemoMenuRecipes } from '../../services/demo-menu'
import { listApiSpaceMembers } from '../../services/space-gateway'
import { getDemoPetState } from '../../services/demo-pet'
import { todoGateway } from '../../services/todo'
import { getTodoErrorMessage } from '../../services/todo-gateway'
import { getInventoryErrorMessage } from '../../utils/inventory-error'
import { createRequestGate } from '../../utils/request-control'

interface HomeMemberView {
  userId: string
  avatarText: string
  avatarTone: DemoAvatarTone
}

interface HomeHeadline {
  top: string
  middle: string
  bottom: string
}

const EMPTY_SNAPSHOT: HomeSnapshot = {
  today: '',
  dateLabel: '',
  weekdayLabel: '',
  period: 'morning',
  salutation: '早上好',
  inventoryNotice: '',
  inventoryNoticeCount: 0,
  inventoryItemCount: 0,
}

const homeRequestGate = createRequestGate()

function buildHomeHeadline(period: HomeDayPeriod): HomeHeadline {
  switch (period) {
    case 'late-night':
      return { top: 'STILL', middle: 'SOFT', bottom: 'TONIGHT' }
    case 'morning':
      return { top: 'CALM', middle: 'FRESH', bottom: 'MORNING' }
    case 'evening':
      return { top: 'WARM', middle: 'QUIET', bottom: 'TONIGHT' }
    default:
      return { top: 'CALM', middle: 'SLOW', bottom: 'TODAY' }
  }
}

function isCreatedToday(entry: JournalItem | null, today: string): boolean {
  if (!entry) return false
  const timestamp = Date.parse(entry.createdAt)
  return !Number.isNaN(timestamp) && getShanghaiDateOnly(timestamp) === today
}

Page({
  data: {
    snapshot: EMPTY_SNAPSHOT,
    inventoryError: '',
    latestEntry: null as JournalItem | null,
    latestEntryIsToday: false,
    recentEntries: [] as JournalItem[],
    journalTotal: 0,
    menuCount: 0,
    menuSummary: '还没有收藏菜单，先收一道常做的菜。',
    todoPendingCount: 0,
    todoSummary: '旅行、计划、健身、吃什么和账单',
    petPendingCount: 0,
    hasLoadedInventory: false,
    hasLoadedMoments: false,
    hasLoadedTodos: false,
    spaceName: '我们的家',
    spaceMemberCopy: '登录后加入空间',
    spaceMembers: [] as HomeMemberView[],
    petSnapshot: {
      name: '糯米',
      status: '精神不错',
      weight: '3.8',
      careNotice: '照护记录都还好',
    },
    headlineTop: 'CALM',
    headlineMiddle: 'SLOW',
    headlineBottom: 'TODAY',
    todayDay: '—',
    todayMonthLabel: '',
    homeDocked: false,
  },

  onShow() {
    void this.loadSnapshot()
  },

  onPageScroll(event: { scrollTop: number }) {
    const nextDocked = event.scrollTop > 285
    if (nextDocked !== this.data.homeDocked) {
      this.setData({ homeDocked: nextDocked })
    }
  },

  async loadSnapshot() {
    const sequence = homeRequestGate.begin()
    const nowMs = Date.now()
    const today = getShanghaiDateOnly(nowMs)

    const auth = await hydrateAuthState()
    const [inventoryResult, momentsResult, todoResult, membersResult] = await Promise.allSettled([
      inventoryGateway.summary(today),
      journalGateway.list({ kinds: ['moment'] }),
      todoGateway.summary(),
      auth.source === 'api' && auth.activeSpaceId
        ? listApiSpaceMembers(auth.activeSpaceId)
        : Promise.resolve(null),
    ])
    if (!homeRequestGate.isCurrent(sequence)) return

    const inventoryError = inventoryResult.status === 'rejected'
      ? getInventoryErrorMessage(
        inventoryResult.reason,
        '家庭库存暂时没有加载出来',
      )
      : ''
    const moments = momentsResult.status === 'fulfilled'
      ? momentsResult.value
      : this.data.recentEntries
    const latestEntry = moments[0] ?? null
    const todoSummary = todoResult.status === 'fulfilled' ? todoResult.value : null
    const todoError = todoResult.status === 'rejected'
      ? getTodoErrorMessage(todoResult.reason, '待办暂时没有同步过来')
      : ''
    const petState = getDemoPetState()
    const latestWeight = petState.weights[petState.weights.length - 1]
    const careCards = buildPetCareCards(petState.events, today)
    const overdueCare = careCards.find((item) => item.status === 'overdue')
    const dueSoonCare = careCards.find((item) => item.status === 'due-soon')
    const dailySummary = buildPetDailySummary(petState.dailyLogs, today)
    const pendingDaily = dailySummary.find((item) => !item.done)
    const careNotice = overdueCare
      ? `${overdueCare.title} · ${overdueCare.statusLabel}`
      : pendingDaily
        ? `今天还没记录${pendingDaily.label}`
        : dueSoonCare
          ? `${dueSoonCare.title} · ${dueSoonCare.statusLabel}`
          : '今天的吃喝拉撒已记录'
    const pendingTodoCount = todoSummary?.pending ?? 0
    const pendingTravelCount = todoSummary?.pendingByKind.travel ?? 0
    const menuRecipes = listDemoMenuRecipes()
    const latestMenu = menuRecipes[0]
    const fallbackMember: HomeMemberView = auth.user
      ? {
          userId: auth.user.id,
          avatarText: auth.avatarText,
          avatarTone: auth.user.avatarTone,
        }
      : {
          userId: 'guest',
          avatarText: '访',
          avatarTone: 'lavender',
        }
    const apiMembers = membersResult.status === 'fulfilled' ? membersResult.value : null
    const spaceMembers: HomeMemberView[] = apiMembers?.ok && apiMembers.data.length
      ? apiMembers.data.map((member) => ({
          userId: member.userId,
          avatarText: buildDemoAvatarText(member.nickname),
          avatarTone: member.avatarTone,
        }))
      : [fallbackMember]
    if (auth.source === 'demo' && auth.isLoggedIn && spaceMembers.length === 1) {
      spaceMembers.push({
        userId: 'demo-member',
        avatarText: '屿',
        avatarTone: 'mint',
      })
    }

    const snapshot = inventoryResult.status === 'fulfilled'
      ? buildHomeSnapshotFromSummary(inventoryResult.value, nowMs)
      : this.data.snapshot
    const headline = buildHomeHeadline(snapshot.period)
    const [, monthValue, dayValue] = today.split('-').map(Number)
    const month = monthValue || 1
    const day = dayValue || 1

    this.setData({
      snapshot,
      inventoryError,
      latestEntry,
      latestEntryIsToday: isCreatedToday(latestEntry, today),
      recentEntries: moments.slice(0, 3),
      journalTotal: moments.length,
      menuCount: menuRecipes.length,
      menuSummary: latestMenu
        ? `最近收着「${latestMenu.title}」，${latestMenu.cookingMinutes} 分钟`
        : '还没有收藏菜单，先收一道常做的菜。',
      todoPendingCount: pendingTodoCount,
      todoSummary: todoSummary
        ? (pendingTodoCount
          ? `${pendingTodoCount} 件还没做${pendingTravelCount ? ` · ${pendingTravelCount} 个旅行准备` : ''}`
          : '目前都做完了，可以再记一件')
        : this.data.hasLoadedTodos ? this.data.todoSummary : todoError,
      petPendingCount: (overdueCare || dueSoonCare ? 1 : 0) + (pendingDaily ? 1 : 0),
      hasLoadedInventory:
        this.data.hasLoadedInventory || inventoryResult.status === 'fulfilled',
      hasLoadedMoments:
        this.data.hasLoadedMoments || momentsResult.status === 'fulfilled',
      hasLoadedTodos:
        this.data.hasLoadedTodos || todoResult.status === 'fulfilled',
      spaceName: auth.spaceName,
      spaceMemberCopy: auth.isLoggedIn ? `${spaceMembers.length} 位成员` : '登录后加入空间',
      spaceMembers,
      petSnapshot: {
        name: petState.profile.name,
        status: petState.profile.status,
        weight: latestWeight?.value ?? '—',
        careNotice,
      },
      headlineTop: headline.top,
      headlineMiddle: headline.middle,
      headlineBottom: headline.bottom,
      todayDay: String(day),
      todayMonthLabel: `${month}月`,
    })
  },

  onRetryInventory() {
    void this.loadSnapshot()
  },

  onOpenTodayRecord() {
    const latestEntry = this.data.latestEntry
    if (!latestEntry) {
      this.onOpenJournal()
      return
    }
    wx.navigateTo({
      url: `/pages/journal-detail/index?id=${encodeURIComponent(latestEntry.id)}`,
    })
  },

  onOpenEntry(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.navigateTo({ url: `/pages/journal-detail/index?id=${encodeURIComponent(id)}` })
  },

  onOpenNearby(event: { currentTarget: { dataset: { target?: string } } }) {
    switch (event.currentTarget.dataset.target) {
      case 'inventory':
        this.onOpenInventory()
        break
      case 'todo':
        this.onOpenTodo()
        break
      case 'menu':
        this.onOpenMenu()
        break
      case 'pets':
        this.onOpenPets()
        break
      default:
        break
    }
  },

  onOpenInventory() {
    wx.switchTab({ url: '/pages/inventory/index' })
  },

  onOpenJournal() {
    wx.switchTab({ url: '/pages/journal/index' })
  },

  onOpenTodo() {
    wx.navigateTo({ url: '/pages/todo/index' })
  },

  onOpenProfile() {
    wx.switchTab({ url: '/pages/profile/index' })
  },

  onOpenReminders() {
    wx.navigateTo({ url: '/pages/reminder-settings/index' })
  },

  onOpenPets() {
    wx.navigateTo({ url: '/pages/pets/index' })
  },

  onOpenMenu() {
    wx.navigateTo({ url: '/pages/menu/index' })
  },
})
