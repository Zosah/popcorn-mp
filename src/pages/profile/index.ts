import { formatVersionLabel } from '../../config/env'
import { getAuthState, hydrateAuthState, type AuthState } from '../../services/auth'
import { resetAllDemoData } from '../../services/demo-reset'
import { getDemoSpaceName } from '../../services/demo-space'
import { listDemoTodoItems } from '../../services/demo-todo'
import { syncDemoTabBar } from '../../utils/demo-tab-bar'

Page({
  data: {
    version: formatVersionLabel(),
    spaceName: '我们的家',
    isLoggedIn: false,
    displayName: '还没有登录',
    avatarText: '访',
    avatarTone: 'lavender',
    identityMeta: '登录后认领空间身份，和朋友共享同一份生活。',
    identityBadge: '访客模式',
    accountMeta: '登录或注册一个账号',
    accountTag: '未登录',
    spaceMembersCopy: '登录后管理共同空间',
    syncBadgeState: 'local',
    syncBadgeText: 'Demo 访客',
    todoPendingCount: 0,
    todoSummary: '旅行准备、计划、健身、吃什么和账单',
    todoCompletedCount: 0,
    todoTotalCount: 0,
    todoProgress: 0,
  },

  onShow() {
    syncDemoTabBar(this, 3)
    void this.refreshProfile()
  },

  async refreshProfile() {
    const auth = await hydrateAuthState()
    this.renderAuth(auth)
  },

  renderAuth(auth: AuthState) {
    const loggedInUser = auth.isLoggedIn ? auth.user : null
    const isLoggedIn = Boolean(loggedInUser)
    const items = listDemoTodoItems()
    const pendingCount = items.filter((item) => !item.done).length
    const travelCount = items.filter(
      (item) => item.kind === 'travel' && !item.done,
    ).length
    const completedCount = items.filter((item) => item.done).length
    const summary = pendingCount
      ? `${pendingCount} 件未完成${travelCount ? ` · ${travelCount} 个旅行准备` : ''}`
      : '目前都做完了，可以再记一件'
    const isApiAccount = auth.source === 'api'
    this.setData({
      spaceName: auth.spaceName,
      isLoggedIn,
      displayName: loggedInUser?.nickname || (isLoggedIn ? '待完善资料' : '还没有登录'),
      avatarText: isLoggedIn ? auth.avatarText : '访',
      avatarTone: loggedInUser?.avatarTone ?? 'lavender',
      identityMeta: isLoggedIn
        ? (isApiAccount
          ? '已登录 · 账号资料已同步，生活数据正在逐步接入'
          : '已登录 · 这是保存在当前设备的体验身份')
        : '登录后认领空间身份，和朋友共享同一份生活。',
      identityBadge: isLoggedIn
        ? (auth.spaceRole === 'member' ? '空间成员' : '空间 Owner')
        : '访客模式',
      accountMeta: isLoggedIn
        ? `${loggedInUser?.nickname || '待完善资料'} · ${isApiAccount ? '微信账号' : '本机体验账号'}`
        : '登录或注册一个账号',
      accountTag: isLoggedIn ? '已登录' : '未登录',
      spaceMembersCopy: isLoggedIn
        ? (isApiAccount ? '空间已连接 · 成员功能即将开放' : '2 位成员 · 一起生活')
        : '登录后管理共同空间',
      syncBadgeState: isApiAccount && isLoggedIn ? 'synced' : 'local',
      syncBadgeText: isApiAccount
        ? (isLoggedIn ? '账号已同步' : '未登录')
        : (isLoggedIn ? '本机账号' : 'Demo 访客'),
      todoPendingCount: pendingCount,
      todoSummary: summary,
      todoCompletedCount: completedCount,
      todoTotalCount: items.length,
      todoProgress: items.length ? Math.round((completedCount / items.length) * 100) : 0,
    })
  },

  onOpenSpace() {
    wx.navigateTo({ url: '/pages/space/index' })
  },

  onOpenAuth() {
    wx.navigateTo({ url: '/pages/auth/index' })
  },

  onOpenTodo() {
    wx.navigateTo({ url: '/pages/todo/index' })
  },

  onOpenReminders() {
    wx.navigateTo({ url: '/pages/reminder-settings/index' })
  },

  onOpenInvite() {
    wx.navigateTo({ url: '/pages/invite/index' })
  },

  onResetDemo() {
    wx.showModal({
      title: '恢复 Demo 初始数据？',
      content: '库存、宠物、生活记录、菜单、待办、提醒和空间设置都会恢复成初始示例；账号登录信息会保留。',
      confirmText: '重置',
      confirmColor: '#e8695c',
      success: (result) => {
        if (!result.confirm) return
        resetAllDemoData()
        this.setData({ spaceName: getDemoSpaceName() })
        void this.refreshProfile()
        wx.showToast({ title: 'Demo 已恢复', icon: 'success' })
      },
    })
  },
})
