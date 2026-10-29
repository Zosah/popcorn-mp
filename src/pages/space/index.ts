import { appConfig } from '../../config/env'
import { buildDemoAvatarText, type DemoAvatarTone } from '../../domain/demo-auth'
import { buildDemoInvitePath } from '../../domain/demo-invite'
import { getAuthState, hydrateAuthState, type AuthState } from '../../services/auth'
import {
  getDemoInviteCode,
  refreshDemoInviteCode,
} from '../../services/demo-invite'
import { getDemoSpaceName, setDemoSpaceName } from '../../services/demo-space'
import {
  createApiSpaceInvite,
  getApiSpace,
  listApiSpaceMembers,
  renameApiSpace,
} from '../../services/space-gateway'
import type { ApiSpaceDetail, ApiSpaceMember } from '../../types/api'
import { navigateBackOrTab } from '../../utils/demo-navigation'

interface MemberView {
  userId: string
  nickname: string
  avatarText: string
  avatarTone: DemoAvatarTone
  role: 'owner' | 'member'
  roleLabel: string
  meta: string
}

Page({
  data: {
    isDemoMode: appConfig.demoMode,
    spaceId: '',
    spaceName: '我们的家',
    spaceRole: 'owner' as 'owner' | 'member',
    spaceCreatedLabel: '正在读取空间信息',
    memberCount: 0,
    members: [] as MemberView[],
    isLoggedIn: false,
    isOwner: false,
    currentUserName: '还没有登录',
    currentAvatarText: '访',
    currentAvatarTone: 'lavender' as DemoAvatarTone,
    inviteCode: '',
    hasInvite: false,
    inviteExpiryLabel: '创建后 7 天内有效',
    isLoading: false,
  },

  onShow() {
    void this.refreshAuth()
  },

  async refreshAuth() {
    const auth = await hydrateAuthState()
    if (appConfig.demoMode) {
      this.renderDemo(auth)
      return
    }
    await this.loadApiSpace(auth)
  },

  renderDemo(auth: AuthState) {
    const currentUser = auth.user
    const members: MemberView[] = [{
      userId: currentUser?.id ?? 'demo-owner',
      nickname: auth.isLoggedIn && currentUser
        ? currentUser.nickname || '待完善资料'
        : '登录后认领这个空间身份',
      avatarText: auth.isLoggedIn ? auth.avatarText : '访',
      avatarTone: currentUser?.avatarTone ?? 'lavender',
      role: 'owner',
      roleLabel: auth.isLoggedIn ? '创建者' : '待登录',
      meta: auth.isLoggedIn ? '空间创建者 · 可以管理成员' : '登录后进入共同空间',
    }]
    if (auth.isLoggedIn) {
      members.push({
        userId: 'demo-member',
        nickname: '共同生活成员',
        avatarText: '屿',
        avatarTone: 'lavender',
        role: 'member',
        roleLabel: '成员',
        meta: '可以维护共同内容',
      })
    }
    this.setData({
      isDemoMode: true,
      spaceName: getDemoSpaceName(),
      spaceRole: 'owner',
      spaceCreatedLabel: '这是一份只在当前设备保存的 Demo 空间',
      memberCount: members.length,
      members,
      isLoggedIn: auth.isLoggedIn,
      isOwner: true,
      currentUserName: members[0]?.nickname ?? '还没有登录',
      currentAvatarText: members[0]?.avatarText ?? '访',
      currentAvatarTone: members[0]?.avatarTone ?? 'lavender',
      inviteCode: getDemoInviteCode(),
      hasInvite: true,
      inviteExpiryLabel: 'Demo 邀请码 · 真实版本 7 天内有效',
      isLoading: false,
    })
  },

  async loadApiSpace(auth: AuthState) {
    if (!auth.isLoggedIn || !auth.activeSpaceId) {
      this.setData({
        isDemoMode: false,
        isLoggedIn: false,
        isOwner: false,
        members: [],
        memberCount: 0,
        spaceName: auth.spaceName || '我们的家',
        spaceCreatedLabel: '登录后可查看共同空间',
      })
      return
    }

    this.setData({ isLoading: true, spaceId: auth.activeSpaceId })
    const [spaceResult, membersResult] = await Promise.all([
      getApiSpace(auth.activeSpaceId),
      listApiSpaceMembers(auth.activeSpaceId),
    ])
    if (!spaceResult.ok || !spaceResult.data) {
      this.setData({ isLoading: false })
      wx.showToast({ title: spaceResult.message || '空间读取失败', icon: 'none' })
      return
    }
    if (!membersResult.ok) {
      wx.showToast({ title: membersResult.message || '成员读取失败', icon: 'none' })
    }
    this.renderApiSpace(spaceResult.data, membersResult.data)
  },

  renderApiSpace(space: ApiSpaceDetail, members: ApiSpaceMember[]) {
    const memberViews = members.map((member): MemberView => ({
      userId: member.userId,
      nickname: member.nickname || '待完善资料',
      avatarText: buildDemoAvatarText(member.nickname),
      avatarTone: member.avatarTone,
      role: member.role,
      roleLabel: member.role === 'owner' ? '创建者' : '成员',
      meta: member.role === 'owner'
        ? '空间创建者 · 可以管理成员和邀请'
        : '可以维护共同内容',
    }))
    const current = memberViews.find((member) => member.role === 'owner') ?? memberViews[0]
    this.setData({
      isDemoMode: false,
      spaceId: space.id,
      spaceName: space.name,
      spaceRole: space.role,
      spaceCreatedLabel: `${formatSpaceDate(space.createdAt)}创建。这里的内容只属于被邀请进来的人。`,
      memberCount: memberViews.length,
      members: memberViews,
      isLoggedIn: true,
      isOwner: space.role === 'owner',
      currentUserName: current?.nickname ?? '共同生活成员',
      currentAvatarText: current?.avatarText ?? '家',
      currentAvatarTone: current?.avatarTone ?? 'lavender',
      inviteExpiryLabel: '一次性邀请码 · 创建后 7 天内有效',
      isLoading: false,
    })
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },
  onMemberInfo(event: {
    currentTarget: { dataset: { nickname?: string; role?: string } }
  }) {
    const nickname = event.currentTarget.dataset.nickname || '空间成员'
    const role = event.currentTarget.dataset.role || '成员'
    wx.showModal({
      title: nickname,
      content: `当前身份：${role}。成员管理接口接入后，这里会提供移出与权限调整。`,
      showCancel: false,
      confirmText: '知道了',
    })
  },


  onRename() {
    if (!this.data.isOwner) {
      wx.showToast({ title: '只有创建者可以修改空间名', icon: 'none' })
      return
    }
    wx.showModal({
      title: '给空间换个名字',
      editable: true,
      placeholderText: this.data.spaceName,
      success: (result) => {
        const name = result.content?.trim()
        if (!result.confirm || !name) return
        if (appConfig.demoMode) {
          this.setData({ spaceName: setDemoSpaceName(name) })
          wx.showToast({ title: '空间名称已更新', icon: 'success' })
          return
        }
        void this.renameApiSpace(name)
      },
    })
  },

  async renameApiSpace(name: string) {
    const result = await renameApiSpace(this.data.spaceId, name)
    if (!result.ok || !result.data) {
      wx.showToast({ title: result.message || '空间名称更新失败', icon: 'none' })
      return
    }
    this.setData({ spaceName: result.data.name })
    wx.showToast({ title: '空间名称已更新', icon: 'success' })
  },

  async onRefreshInvite() {
    if (!this.data.isOwner) {
      wx.showToast({ title: '只有创建者可以生成邀请码', icon: 'none' })
      return
    }
    if (appConfig.demoMode) {
      const code = refreshDemoInviteCode()
      this.setData({ inviteCode: code, hasInvite: true })
      wx.showToast({ title: '已生成新邀请码', icon: 'success' })
      return
    }
    await this.createInvite()
  },

  async createInvite(): Promise<string> {
    const result = await createApiSpaceInvite(this.data.spaceId)
    if (!result.ok || !result.data) {
      wx.showToast({ title: result.message || '邀请码生成失败', icon: 'none' })
      return ''
    }
    this.setData({
      inviteCode: result.data.code,
      hasInvite: true,
      inviteExpiryLabel: `有效期至 ${formatDateTime(result.data.expiresAt)}`,
    })
    wx.showToast({ title: '已生成一次性邀请码', icon: 'success' })
    return result.data.code
  },

  async onPreviewInvite() {
    const code = await this.ensureInvite()
    if (!code) return
    wx.navigateTo({ url: buildDemoInvitePath(code) })
  },

  async onCopyInvite() {
    const code = await this.ensureInvite()
    if (!code) return
    wx.setClipboardData({
      data: code,
      success: () => wx.showToast({ title: '邀请码已复制', icon: 'success' }),
    })
  },

  async ensureInvite(): Promise<string> {
    if (!this.data.isOwner) {
      wx.showToast({ title: '只有创建者可以邀请成员', icon: 'none' })
      return ''
    }
    if (this.data.inviteCode) return this.data.inviteCode
    if (appConfig.demoMode) {
      const code = getDemoInviteCode()
      this.setData({ inviteCode: code, hasInvite: true })
      return code
    }
    return this.createInvite()
  },

  onShareAppMessage() {
    const baseTitle = `我在「${this.data.spaceName}」等你`
    if (!this.data.isOwner || !this.data.inviteCode) {
      return { title: baseTitle, path: '/pages/home/index' }
    }
    return {
      title: `邀请你加入「${this.data.spaceName}」`,
      path: buildDemoInvitePath(this.data.inviteCode),
    }
  },
})

function formatSpaceDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`
}

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '7 天后'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}
