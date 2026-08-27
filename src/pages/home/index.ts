import { buildHomeSnapshot, type HomeSnapshot } from '../../domain/home'
import { getShanghaiDateOnly } from '../../domain/expiry'
import { buildPetCareCards, buildPetDailySummary } from '../../domain/demo-pet'
import { inventoryGateway } from '../../services/demo-inventory'
import { getDemoPetState } from '../../services/demo-pet'
import { syncDemoTabBar } from '../../utils/demo-tab-bar'

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
    today: '',
    petSnapshot: {
      name: '糯米',
      status: '精神不错',
      weight: '3.8',
      careNotice: '照护记录都还好',
    },
  },

  onShow() {
    syncDemoTabBar(this, 0)
    void this.loadSnapshot()
  },

  async loadSnapshot() {
    const nowMs = Date.now()
    const today = getShanghaiDateOnly(nowMs)
    const items = await inventoryGateway.list({}, today)
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
    this.setData({
      today,
      snapshot: buildHomeSnapshot(items, nowMs),
      petSnapshot: {
        name: petState.profile.name,
        status: petState.profile.status,
        weight: latestWeight?.value ?? '—',
        careNotice,
      },
    })
  },

  onOpenInventory() {
    wx.switchTab({ url: '/pages/inventory/index' })
  },

  onOpenJournal() {
    wx.switchTab({ url: '/pages/journal/index' })
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
