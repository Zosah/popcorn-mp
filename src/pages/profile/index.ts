import { appConfig, formatVersionLabel } from '../../config/env'
import { hydrateAuthState, logoutAuth, type AuthState } from '../../services/auth'
import { promptAuthGateIfNeeded } from '../../services/auth-preview'
import { syncAppTabSettings } from '../../services/app-tab-settings'
import {
  getAppTabConfig,
  resolveAppTabItems,
} from '../../services/app-tab-config'
import { resetAllDemoData } from '../../services/demo-reset'
import { getDemoSpaceName } from '../../services/demo-space'
import { clearAllLocalData } from '../../services/local-reset'
import { readPageCache, writePageCache } from '../../services/page-cache'
import { todoGateway } from '../../services/todo'
import {
  getTodoErrorMessage,
  type TodoSummary,
} from '../../services/todo-gateway'
import { openAppRoot } from '../../utils/app-navigation'
import { resolveAvatarUrl } from '../../utils/avatar'
import { createRequestGate } from '../../utils/request-control'

const profileRequestGate = createRequestGate()
const PROFILE_PAGE_CACHE_KEY = 'profile:overview'

Page({
  data: {
    initialLoading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    version: formatVersionLabel(),
    spaceName: '我们的家',
    isLoggedIn: false,
    displayName: '还没有登录',
    avatarText: '访',
    avatarTone: 'lavender',
    avatarMediaId: '',
    avatarUrl: '',
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
    todoLoading: false,
    tabBarSummary: '家 / 宠物 / 记录 / 我的',
    lastTodoSummary: null as TodoSummary | null,
    showResetDemo: appConfig.demoMode,
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
        todoLoading: false,
      })
    }
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

  async refreshProfile(fromPullDown = false) {
    const sequence = profileRequestGate.begin()
    const auth = await hydrateAuthState()
    if (!profileRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }

    if (!auth.isLoggedIn) {
      this.setData({ lastTodoSummary: null })
      this.renderAuth(auth, null, '')
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }

    void syncAppTabSettings().catch(() => undefined)
    this.setData({ todoLoading: true })
    let summary: TodoSummary | null = null
    let todoError = ''
    try {
      summary = await todoGateway.summary()
    } catch (error) {
      todoError = getTodoErrorMessage(error, '待办暂时没有同步过来')
    }
    if (!profileRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }

    const effectiveSummary = summary ?? this.data.lastTodoSummary
    if (summary) this.setData({ lastTodoSummary: summary })
    this.renderAuth(auth, effectiveSummary, todoError)
    if (fromPullDown) wx.stopPullDownRefresh()
  },

  renderAuth(auth: AuthState, summary: TodoSummary | null, todoError: string) {
    const loggedInUser = auth.isLoggedIn ? auth.user : null
    const isLoggedIn = Boolean(loggedInUser)
    const activeSummary = isLoggedIn ? summary : null
    const pendingCount = activeSummary?.pending ?? 0
    const travelCount = activeSummary?.pendingByKind.travel ?? 0
    const completedCount = activeSummary?.completed ?? 0
    const totalCount = activeSummary?.total ?? 0
    let summaryText = '登录后会同步你的待办和小计划'
    if (isLoggedIn) {
      summaryText = activeSummary
        ? pendingCount
          ? `${pendingCount} 件未完成${travelCount ? ` · ${travelCount} 个旅行准备` : ''}`
          : '目前都做完了，可以再记一件'
        : todoError || '正在同步你的待办和小计划'
      if (activeSummary && todoError) summaryText += ' · 同步失败'
    }
    const isApiAccount = auth.source === 'api'
    const tabBarSummary = resolveAppTabItems(getAppTabConfig())
      .map((item) => item.label)
      .join(' / ')
    const avatarMediaId = loggedInUser?.avatarMediaId ?? ''
    this.setData({
      initialLoading: false,
      hasLoaded: true,
      cacheFresh: true,
      spaceName: auth.spaceName,
      isLoggedIn,
      displayName: loggedInUser?.nickname || (isLoggedIn ? '待完善资料' : '还没有登录'),
      avatarText: isLoggedIn ? auth.avatarText : '访',
      avatarTone: loggedInUser?.avatarTone ?? 'lavender',
      avatarMediaId,
      avatarUrl: this.data.avatarMediaId === avatarMediaId ? this.data.avatarUrl : '',
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
      todoLoading: false,
      tabBarSummary,
    }, () => this.cacheCurrentPage())
    if (avatarMediaId) void this.loadAvatar(avatarMediaId)
  },

  cacheCurrentPage() {
    const data = this.data as unknown as Record<string, unknown>
    const {
      initialLoading: _initialLoading,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      todoLoading: _todoLoading,
      ...snapshot
    } = data
    writePageCache(PROFILE_PAGE_CACHE_KEY, snapshot)
  },

  async loadAvatar(mediaId: string) {
    const avatarUrl = await resolveAvatarUrl(mediaId)
    if (this.data.avatarMediaId !== mediaId) return
    this.setData({ avatarUrl }, () => this.cacheCurrentPage())
  },

  onAvatarError() {
    this.setData({ avatarUrl: '' })
  },

  onOpenSpace() {
    wx.navigateTo({ url: '/pages/space/index' })
  },

  onOpenAuth() {
    wx.navigateTo({ url: '/pages/auth/index' })
  },

  onOpenTodo() {
    openAppRoot('/pages/todo/index')
  },

  onOpenReminders() {
    wx.navigateTo({ url: '/pages/reminder-settings/index' })
  },

  onOpenTabSettings() {
    wx.navigateTo({ url: '/pages/tab-settings/index' })
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

  onClearLocalData() {
    wx.showModal({
      title: '清除本机全部数据？',
      content: '会退出当前登录，并清除页面缓存、本机体验数据和本机图片记录。共同空间里的云端内容不会删除。',
      confirmText: '清除',
      confirmColor: '#b86757',
      success: (result) => {
        if (!result.confirm) return
        void this.finishClearLocalData()
      },
    })
  },

  async finishClearLocalData() {
    wx.showLoading({ title: '正在清除', mask: true })
    try {
      await logoutAuth()
    } catch {
      // 即使服务端会话已经失效，也要继续清掉本机内容。
    }
    clearAllLocalData()
    wx.hideLoading()
    wx.showToast({ title: '本机数据已清除', icon: 'success' })
    setTimeout(() => {
      wx.reLaunch({ url: '/pages/home/index' })
    }, 420)
  },

  onUnload() {
    profileRequestGate.invalidate()
  },
})
