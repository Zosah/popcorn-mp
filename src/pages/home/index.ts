import {
  buildHomeSnapshotFromSummary,
  type HomeSnapshot,
} from '../../domain/home'
import { getShanghaiDateOnly } from '../../domain/expiry'
import type { InventorySummary } from '../../domain/inventory-query'
import { buildPetCareCards, buildPetDailySummary } from '../../domain/demo-pet'
import { appConfig } from '../../config/env'
import { journalGateway } from '../../services/journal'
import type { JournalItem } from '../../services/journal-gateway'
import { inventoryGateway } from '../../services/inventory'
import { listDemoMenuRecipes } from '../../services/demo-menu'
import { getDemoPetState, listDemoPetProfiles } from '../../services/demo-pet'
import { todoGateway } from '../../services/todo'
import { getTodoErrorMessage, type TodoSummary } from '../../services/todo-gateway'
import { getInventoryErrorMessage } from '../../utils/inventory-error'

const CHINESE_MONTHS = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
] as const

const EMPTY_INVENTORY_SUMMARY: InventorySummary = {
  total: 0,
  expired: 0,
  today: 0,
  urgent: 0,
  soon: 0,
  normal: 0,
  none: 0,
  dueWithin3Days: 0,
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

Page({
  data: {
    snapshot: EMPTY_SNAPSHOT,
    inventoryError: '',
    today: '',
    dateParts: { day: '', month: '' },
    recentEntries: [] as JournalItem[],
    menuCount: 0,
    recordCount: 0,
    petCount: 0,
    todoPendingCount: 0,
    todoSummary: '旅行、计划、健身、吃什么和账单',
    syncState: appConfig.demoMode ? 'local' : 'pending',
    syncText: appConfig.demoMode ? '只在本机' : '正在同步',
    petSnapshot: {
      name: '糯米',
      status: '精神不错',
      weight: '3.8',
      careNotice: '照护记录都还好',
    },
  },

  onShow() {
    void this.loadSnapshot()
  },

  async loadSnapshot() {
    const nowMs = Date.now()
    const today = getShanghaiDateOnly(nowMs)
    let inventorySummary = EMPTY_INVENTORY_SUMMARY
    let inventoryError = ''
    try {
      inventorySummary = await inventoryGateway.summary(today)
    } catch (error) {
      inventoryError = getInventoryErrorMessage(
        error,
        '家庭库存暂时没有加载出来',
      )
    }
    let moments = this.data.recentEntries
    let journalError = false
    try {
      moments = await journalGateway.list({ kinds: ['moment'] })
    } catch {
      journalError = true
      // 首页保留上一次成功加载的记录，具体错误在生活记录页提示。
    }
    let todoSummary: TodoSummary | null = null
    let todoError = ''
    try {
      todoSummary = await todoGateway.summary()
    } catch (error) {
      todoError = getTodoErrorMessage(error, '待办暂时没有同步过来')
    }
    const petState = getDemoPetState()
    const latestWeight = petState.weights[petState.weights.length - 1]
    const careCards = buildPetCareCards(petState.events, today)
    const overdueCare = careCards.find((item) => item.status === 'overdue')
    const dueSoonCare = careCards.find((item) => item.status === 'due-soon')
    const pendingDaily = buildPetDailySummary(petState.dailyLogs, today).find(
      (item) => !item.done,
    )
    const careNotice = overdueCare
      ? `${overdueCare.title} · ${overdueCare.statusLabel}`
      : pendingDaily
        ? `今天还没记录${pendingDaily.label}`
        : dueSoonCare
          ? `${dueSoonCare.title} · ${dueSoonCare.statusLabel}`
          : '今天的吃喝拉撒已记录'
    const [, month = 1, day = 1] = today.split('-').map(Number)
    const pendingTodoCount = todoSummary?.pending ?? 0
    const pendingTravelCount = todoSummary?.pendingByKind.travel ?? 0
    const hasPartialError = Boolean(inventoryError) || journalError || Boolean(todoError)
    this.setData({
      today,
      dateParts: {
        day: String(day),
        month: CHINESE_MONTHS[(month ?? 1) - 1] ?? '一月',
      },
      snapshot: buildHomeSnapshotFromSummary(inventorySummary, nowMs),
      inventoryError,
      recentEntries: moments.slice(0, 3),
      menuCount: listDemoMenuRecipes().length,
      recordCount: moments.length,
      petCount: listDemoPetProfiles().length,
      todoPendingCount: pendingTodoCount,
      todoSummary: todoSummary
        ? (pendingTodoCount
          ? `${pendingTodoCount} 件还没做${pendingTravelCount ? ` · ${pendingTravelCount} 个旅行准备` : ''}`
          : '目前都做完了，可以再记一件')
        : todoError,
      syncState: hasPartialError
        ? 'pending'
        : appConfig.demoMode ? 'local' : 'synced',
      syncText: hasPartialError
        ? '部分未同步'
        : appConfig.demoMode ? '只在本机' : '已同步',
      petSnapshot: {
        name: petState.profile.name,
        status: petState.profile.status,
        weight: latestWeight?.value ?? '—',
        careNotice,
      },
    })
  },

  onRetryInventory() {
    void this.loadSnapshot()
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

  onOpenPets() {
    wx.navigateTo({ url: '/pages/pets/index' })
  },

  onOpenMenu() {
    wx.navigateTo({ url: '/pages/menu/index' })
  },
})
