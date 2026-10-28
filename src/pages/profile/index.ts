import { appConfig, formatVersionLabel } from '../../config/env'
import { hydrateAuthState, type AuthState } from '../../services/auth'
import { resetAllDemoData } from '../../services/demo-reset'
import { getDemoSpaceName } from '../../services/demo-space'
import { todoGateway } from '../../services/todo'
import {
  getTodoErrorMessage,
  type TodoSummary,
} from '../../services/todo-gateway'

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
    showResetDemo: appConfig.demoMode,
  },

  onShow() {
    void this.refreshProfile()
  },

  async refreshProfile() {
    const auth = await hydrateAuthState()
    let summary: TodoSummary | null = null
    let todoError = ''
    if (auth.isLoggedIn) {
      try {
        summary = await todoGateway.summary()
      } catch (error) {
        todoError = getTodoErrorMessage(error, '待办暂时没有同步过来')
      }
    }
    this.renderAuth(auth, summary, todoError)
  },

  renderAuth(auth: AuthState, summary: TodoSummary | null, todoError: string) {
    const loggedInUser = auth.isLoggedIn ? auth.user : null
    const isLoggedIn = Boolean(loggedInUser)
    const pendingCount = summary?.pending ?? 0
    const travelCount = summary?.pendingByKind.travel ?? 0
    const completedCount = summary?.completed ?? 0
    const totalCount = summary?.total ?? 0
    const summaryText = pendingCount
      ? `${pendingCount} 件未完成${travelCount ? ` · ${travelCount} 个旅行准备` : ''}`
      : todoError
        ? todoError
        : isLoggedIn
          ? '目前都做完了，可以再记一件'
          : '登录后会同步你的待办和小计划'
    const isApiAccount = auth.source === 'api'
    this.setData({
      spaceName: auth.spaceName,
      isLoggedIn,
      displayName: loggedInUser?.nickname || (isLoggedIn ? '待完善资料' : '还没有登录'),
      avatarText: isLoggedIn ? auth.avatarText : '访',
      avatarTone: loggedInUser?.avatarTone ?? 'lavender',
      identityMeta: isLoggedIn
        ? (isApiAccount
          ? '已登录 · 账号资料与共享空间已同步'
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
        ? (isApiAccount ? '空间已连接 · 可查看成员与邀请' : '2 位成员 · 一起生活')
        : '登录后管理共同空间',
      syncBadgeState: isApiAccount && isLoggedIn ? 'synced' : 'local',
      syncBadgeText: isApiAccount
        ? (isLoggedIn ? '账号已同步' : '未登录')
        : (isLoggedIn ? '本机账号' : 'Demo 访客'),
      todoPendingCount: pendingCount,
      todoSummary: summaryText,
      todoCompletedCount: completedCount,
      todoTotalCount: totalCount,
      todoProgress: totalCount ? Math.round((completedCount / totalCount) * 100) : 0,
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
