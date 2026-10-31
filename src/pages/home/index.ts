import {
  buildHomeSnapshotFromSummary,
  type HomeSnapshot,
} from '../../domain/home'
import { getShanghaiDateOnly } from '../../domain/expiry'
import { buildDemoAvatarText, type DemoAvatarTone } from '../../domain/demo-auth'
import {
  buildPetCareCards,
  buildPetDailySummary,
  buildPetHomeActivities,
  formatPetWeight,
  type PetHomeActivity,
} from '../../domain/demo-pet'
import { journalGateway } from '../../services/journal'
import type { JournalItem } from '../../services/journal-gateway'
import { hydrateAuthState } from '../../services/auth'
import { inventoryGateway } from '../../services/inventory'
import { menuGateway } from '../../services/menu'
import { getMenuErrorMessage } from '../../services/menu-gateway'
import { petGateway } from '../../services/pet'
import {
  activePetFrom,
  getPetErrorMessage,
} from '../../services/pet-gateway'
import { listApiSpaceMembers } from '../../services/space-gateway'
import { todoGateway } from '../../services/todo'
import { getTodoErrorMessage } from '../../services/todo-gateway'
import { getInventoryErrorMessage } from '../../utils/inventory-error'
import { openAppRoot } from '../../utils/app-navigation'
import { resolveAvatarUrl } from '../../utils/avatar'
import { createRequestGate } from '../../utils/request-control'

interface HomeMemberView {
  userId: string
  avatarText: string
  avatarTone: DemoAvatarTone
  avatarMediaId: string
  avatarUrl: string
}

interface HomePetActivity extends PetHomeActivity {
  dateLabel: string
  tone: 'blue' | 'green' | 'pink'
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

function isCreatedToday(entry: JournalItem | null, today: string): boolean {
  if (!entry) return false
  const timestamp = Date.parse(entry.createdAt)
  return !Number.isNaN(timestamp) && getShanghaiDateOnly(timestamp) === today
}

function formatPetActivityDate(value: string, today: string): string {
  if (!value) return ''
  if (value === today) return '今天'
  const todayMs = Date.parse(`${today}T00:00:00+08:00`)
  const valueMs = Date.parse(`${value}T00:00:00+08:00`)
  if (Number.isNaN(todayMs) || Number.isNaN(valueMs)) return value
  const days = Math.round((todayMs - valueMs) / 86400000)
  if (days === 1) return '昨天'
  if (days > 1 && days < 7) return `${days} 天前`
  const [, month, day] = value.split('-')
  return month && day ? `${Number(month)}月${Number(day)}日` : value
}

Page({
  data: {
    snapshot: EMPTY_SNAPSHOT,
    inventoryError: '',
    latestEntry: null as JournalItem | null,
    latestEntryIsToday: false,
    recentEntries: [] as JournalItem[],
    journalTotal: 0,
    todoTotalCount: 0,
    todoCompletedCount: 0,
    homeTab: 'today' as 'today' | 'home' | 'pet',
    greetingName: '你',
    menuCount: 0,
    menuSummary: '还没有收藏菜单，先收一道常做的菜。',
    todoPendingCount: 0,
    todoSummary: '旅行、计划、健身、吃什么和账单',
    petPendingCount: 0,
    petActivities: [] as HomePetActivity[],
    petActivityCount: 0,
    hasLoadedInventory: false,
    hasLoadedMoments: false,
    hasLoadedTodos: false,
    hasLoadedMenu: false,
    hasLoadedPets: false,
    spaceName: '我们的家',
    spaceMemberCopy: '登录后加入空间',
    spaceMembers: [] as HomeMemberView[],
    petSnapshot: {
      name: '糯米',
      status: '精神不错',
      weight: '3.8',
      careNotice: '照护记录都还好',
    },
    todayDay: '—',
    todayMonthLabel: '',
    // 有需要处理的事项时才渲染提醒行；没有就不占位，避免首页被"一切正常"撑长
    hasUrgentItems: false,
    reminderCount: 0,
    reminderCopy: '',
    // 自定义导航下，状态栏高度与胶囊按钮占位都要自己让，
    // 否则页眉的日期会压到刘海、黑猫会被右上角的「•••⊙」盖住。
    statusBarHeight: 20,
    navBarRight: 0,
    // 胶囊底部到屏幕顶部的距离，页眉从这里往下排，确保不出血
    navBarHeight: 44,
  },

  onLoad() {
    this.measureNavBar()
  },

  /**
   * 量出状态栏与右上角胶囊按钮的真实位置。
   * 不同机型（刘海屏 / 灵动岛 / 直角屏）高度差别很大，写死会在真机上错位。
   */
  measureNavBar() {
    try {
      const windowInfo = wx.getWindowInfo()
      const statusBarHeight = windowInfo.statusBarHeight || 20
      // 胶囊按钮是微信保留的，只能测量不能隐藏
      const menu = wx.getMenuButtonBoundingClientRect()
      // 页眉右边界要给胶囊让位：胶囊左边缘再往左留一点呼吸
      const navBarRight = windowInfo.windowWidth - menu.left + 20
      const navBarHeight = menu.bottom - statusBarHeight + 8
      this.setData({ statusBarHeight, navBarRight, navBarHeight })
    } catch {
      // 低版本基础库拿不到胶囊信息时，退回一组安全的默认值
      this.setData({ statusBarHeight: 20, navBarRight: 96, navBarHeight: 44 })
    }
  },

  onShow() {
    void this.loadSnapshot()
  },

  async loadSnapshot() {
    const sequence = homeRequestGate.begin()
    const nowMs = Date.now()
    const today = getShanghaiDateOnly(nowMs)

    const auth = await hydrateAuthState()
    const [
      inventoryResult,
      momentsResult,
      todoResult,
      menuResult,
      membersResult,
      petResult,
    ] = await Promise.allSettled([
      inventoryGateway.summary(today),
      journalGateway.list({ kinds: ['moment'] }),
      todoGateway.summary(),
      menuGateway.list(),
      auth.source === 'api' && auth.activeSpaceId
        ? listApiSpaceMembers(auth.activeSpaceId)
        : Promise.resolve(null),
      petGateway.list(),
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
    const petState = petResult.status === 'fulfilled'
      ? activePetFrom(petResult.value)
      : null
    const petError = petResult.status === 'rejected'
      ? getPetErrorMessage(petResult.reason, '宠物照护暂时没有同步过来')
      : ''
    const latestWeight = petState?.weights[petState.weights.length - 1]
    const careCards = petState ? buildPetCareCards(petState.events, today) : []
    const overdueCare = careCards.find((item) => item.status === 'overdue')
    const dueSoonCare = careCards.find((item) => item.status === 'due-soon')
    const dailySummary = petState
      ? buildPetDailySummary(petState.dailyLogs, today)
      : []
    const petActivities = petState ? buildPetHomeActivities(petState, today, 3).map(
      (item): HomePetActivity => ({
        ...item,
        dateLabel: formatPetActivityDate(item.occurredOn, today),
        tone: item.target === 'daily' ? 'green' : item.target === 'event' ? 'pink' : 'blue',
      }),
    ) : this.data.petActivities
    const pendingDaily = dailySummary.find((item) => !item.done)
    const careNotice = petError
      ? petError
      : petState
        ? overdueCare
          ? `${overdueCare.title} · ${overdueCare.statusLabel}`
          : pendingDaily
            ? `今天还没记录${pendingDaily.label}`
            : dueSoonCare
              ? `${dueSoonCare.title} · ${dueSoonCare.statusLabel}`
              : '今天的吃喝拉撒已记录'
        : '还没有宠物档案，先添加一位家庭成员'
    const pendingTodoCount = todoSummary?.pending ?? 0
    const pendingTravelCount = todoSummary?.pendingByKind.travel ?? 0
    const petPendingCount = petState
      ? (overdueCare || dueSoonCare ? 1 : 0) + (pendingDaily ? 1 : 0)
      : 0
    const menuRecipes = menuResult.status === 'fulfilled' ? menuResult.value : null
    const latestMenu = menuRecipes?.[0]
    const menuError = menuResult.status === 'rejected'
      ? getMenuErrorMessage(menuResult.reason, '菜单暂时没有同步过来')
      : ''
    const fallbackMember: HomeMemberView = auth.user
      ? {
          userId: auth.user.id,
          avatarText: auth.avatarText,
          avatarTone: auth.user.avatarTone,
          avatarMediaId: auth.user.avatarMediaId,
          avatarUrl: '',
        }
      : {
          userId: 'guest',
          avatarText: '访',
          avatarTone: 'lavender',
          avatarMediaId: '',
          avatarUrl: '',
        }
    const apiMembers = membersResult.status === 'fulfilled' ? membersResult.value : null
    const spaceMembers: HomeMemberView[] = apiMembers?.ok && apiMembers.data.length
      ? apiMembers.data.map((member) => ({
          userId: member.userId,
          avatarText: buildDemoAvatarText(member.nickname),
          avatarTone: member.avatarTone,
          avatarMediaId: member.avatarMediaId ?? '',
          avatarUrl: '',
        }))
      : [fallbackMember]
    if (auth.source === 'demo' && auth.isLoggedIn && spaceMembers.length === 1) {
      spaceMembers.push({
        userId: 'demo-member',
        avatarText: '屿',
        avatarTone: 'mint',
        avatarMediaId: '',
        avatarUrl: '',
      })
    }

    const snapshot = inventoryResult.status === 'fulfilled'
      ? buildHomeSnapshotFromSummary(inventoryResult.value, nowMs)
      : this.data.snapshot
    const [, monthValue, dayValue] = today.split('-').map(Number)
    const month = monthValue || 1
    const day = dayValue || 1

    const reminderCount =
      (snapshot.inventoryNoticeCount > 0 ? 1 : 0)
      + (pendingTodoCount > 0 ? 1 : 0)
      + (petPendingCount > 0 ? 1 : 0)
    const reminderCopy = [
      snapshot.inventoryNoticeCount > 0
        ? `${snapshot.inventoryNoticeCount} 件库存临期`
        : '',
      pendingTodoCount > 0 ? `${pendingTodoCount} 件待办没完成` : '',
      petPendingCount > 0 && petState ? `${petState.profile.name}还有照护没记录` : '',
    ].filter(Boolean).join(' · ')

    this.setData({
      snapshot,
      inventoryError,
      latestEntry,
      latestEntryIsToday: isCreatedToday(latestEntry, today),
      recentEntries: moments.slice(0, 3),
      journalTotal: moments.length,
      todoTotalCount: todoSummary?.total ?? this.data.todoTotalCount,
      todoCompletedCount: todoSummary?.completed ?? this.data.todoCompletedCount,
      greetingName: auth.user?.nickname?.slice(0, 4) || '你',
      menuCount: menuRecipes?.length ?? this.data.menuCount,
      menuSummary: menuRecipes
        ? (latestMenu
          ? `最近收着「${latestMenu.title}」，${latestMenu.cookingMinutes} 分钟`
          : '还没有收藏菜单，先收一道常做的菜。')
        : (this.data.hasLoadedMenu ? this.data.menuSummary : menuError),
      todoPendingCount: pendingTodoCount,
      todoSummary: todoSummary
        ? (pendingTodoCount
          ? `${pendingTodoCount} 件还没做${pendingTravelCount ? ` · ${pendingTravelCount} 个旅行准备` : ''}`
          : '目前都做完了，可以再记一件')
        : this.data.hasLoadedTodos ? this.data.todoSummary : todoError,
      petPendingCount,
      petActivities,
      petActivityCount: petState
        ? petState.events.length + petState.weights.length + petState.dailyLogs.length
        : this.data.petActivityCount,
      hasLoadedInventory:
        this.data.hasLoadedInventory || inventoryResult.status === 'fulfilled',
      hasLoadedMoments:
        this.data.hasLoadedMoments || momentsResult.status === 'fulfilled',
      hasLoadedTodos:
        this.data.hasLoadedTodos || todoResult.status === 'fulfilled',
      hasLoadedMenu:
        this.data.hasLoadedMenu || menuResult.status === 'fulfilled',
      hasLoadedPets:
        this.data.hasLoadedPets || petResult.status === 'fulfilled',
      spaceName: auth.spaceName,
      spaceMemberCopy: auth.isLoggedIn ? `${spaceMembers.length} 位成员` : '登录后加入空间',
      spaceMembers,
      petSnapshot: {
        name: petState?.profile.name ?? (this.data.hasLoadedPets ? this.data.petSnapshot.name : '宠物'),
        status: petState?.profile.status ?? (petError || '等待同步'),
        weight: latestWeight ? formatPetWeight(latestWeight.value) : '—',
        careNotice,
      },
      todayDay: String(day),
      todayMonthLabel: `${month}月`,
      // 库存预警 / 待办未完成 / 宠物待照护，任一存在才显示提醒行
      hasUrgentItems:
        snapshot.inventoryNoticeCount > 0
        || pendingTodoCount > 0
        || (overdueCare !== undefined || dueSoonCare !== undefined || pendingDaily !== undefined),
      reminderCount,
      reminderCopy,
    })
    void this.hydrateMemberAvatars(sequence)
  },

  async hydrateMemberAvatars(sequence: number) {
    const members = this.data.spaceMembers
    const resolved = await Promise.all(members.map(async (member) => ({
      ...member,
      avatarUrl: await resolveAvatarUrl(member.avatarMediaId),
    })))
    if (!homeRequestGate.isCurrent(sequence)) return
    this.setData({ spaceMembers: resolved })
  },

  onMemberAvatarError(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index)) return
    this.setData({ [`spaceMembers[${index}].avatarUrl`]: '' })
  },

  onRetryInventory() {
    void this.loadSnapshot()
  },

  onSelectHomeTab(event: {
    currentTarget: { dataset: { value?: 'today' | 'home' | 'pet' } }
  }) {
    const value = event.currentTarget.dataset.value
    if (!value || value === this.data.homeTab) return
    this.setData({ homeTab: value })
  },

  onOpenMoment() {
    if (this.data.latestEntry) {
      this.onOpenTodayRecord()
      return
    }
    this.onOpenJournal()
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

  onOpenRecord(event: { currentTarget: { dataset: { id?: string } } }) {
    const id = event.currentTarget.dataset.id
    if (!id) {
      this.onOpenJournal()
      return
    }
    wx.navigateTo({
      url: `/pages/journal-detail/index?id=${encodeURIComponent(id)}`,
    })
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
    openAppRoot('/pages/inventory/index')
  },

  onOpenJournal() {
    openAppRoot('/pages/journal/index')
  },

  onOpenTodo() {
    openAppRoot('/pages/todo/index')
  },

  onOpenProfile() {
    openAppRoot('/pages/profile/index')
  },

  onOpenPetActivity(event: {
    currentTarget: { dataset: { eventId?: string; section?: string } }
  }) {
    const { eventId, section } = event.currentTarget.dataset
    if (eventId) {
      wx.navigateTo({
        url: `/pages/pet-event-detail/index?id=${encodeURIComponent(eventId)}`,
      })
      return
    }
    const targetSection = section === 'daily' ? 'daily' : 'profile'
    openAppRoot(`/pages/pets/index?section=${targetSection}`)
  },

  onOpenReminders() {
    wx.navigateTo({ url: '/pages/reminder-settings/index' })
  },

  onOpenPets() {
    openAppRoot('/pages/pets/index')
  },

  onOpenMenu() {
    openAppRoot('/pages/menu/index')
  },
})
