import { appConfig } from '../../config/env'
import { buildDemoAvatarText, type DemoAvatarTone } from '../../domain/demo-auth'
import { buildDemoInvitePath } from '../../domain/demo-invite'
import { hydrateAuthState, type AuthState } from '../../services/auth'
import {
  getDemoInviteCode,
  refreshDemoInviteCode,
} from '../../services/demo-invite'
import {
  getDemoSpaceAvatarMediaId,
  getDemoSpaceName,
  setDemoSpaceAvatarMediaId,
  setDemoSpaceName,
} from '../../services/demo-space'
import { mediaGateway } from '../../services/media'
import { getMediaErrorMessage } from '../../services/media-gateway'
import {
  createApiSpaceInvite,
  getApiSpace,
  leaveApiSpace,
  listApiSpaceMembers,
  removeApiSpaceMember,
  renameApiSpace,
  updateApiSpaceAvatar,
} from '../../services/space-gateway'
import { invalidatePageCache, readPageCache, writePageCache } from '../../services/page-cache'
import type { ApiSpaceDetail, ApiSpaceMember } from '../../types/api'
import { openAppRoot } from '../../utils/app-navigation'
import { resolveAvatarUrl } from '../../utils/avatar'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { waitForMinimumLoading } from '../../utils/loading'
import { createRequestGate } from '../../utils/request-control'

const SPACE_PAGE_CACHE_KEY = 'space:overview'
const MAX_AVATAR_BYTES = 10 * 1024 * 1024
const spaceRequestGate = createRequestGate()
let avatarUploadSequence = 0

interface MemberView {
  userId: string
  nickname: string
  avatarText: string
  avatarTone: DemoAvatarTone
  avatarMediaId: string
  avatarUrl: string
  role: 'owner' | 'member'
  roleLabel: string
  meta: string
  canRemove: boolean
}

interface CroppedImageResult {
  tempFilePath: string
}

type CropImageApi = (options: {
  src: string
  cropScale: '1:1'
  success: (result: CroppedImageResult) => void
  fail: () => void
}) => void

Page({
  data: {
    isDemoMode: appConfig.demoMode,
    spaceId: '',
    spaceName: '我们的家',
    spaceRole: 'owner' as 'owner' | 'member',
    spaceRoleLabel: '创建人',
    spaceCreatedLabel: '正在读取空间信息',
    spaceAvatarMediaId: '',
    spaceAvatarUrl: '',
    avatarUploading: false,
    memberCount: 0,
    members: [] as MemberView[],
    isLoggedIn: false,
    isOwner: false,
    inviteCode: '',
    hasInvite: false,
    inviteExpiryLabel: '创建后 7 天内有效',
    initialLoading: true,
    hasLoaded: false,
    cacheFresh: false,
    hasShown: false,
    isLeaving: false,
  },

  onLoad() {
    const cached = readPageCache<Record<string, unknown>>(SPACE_PAGE_CACHE_KEY)
    if (cached) {
      this.setData({
        ...cached.value,
        initialLoading: false,
        hasLoaded: true,
        cacheFresh: cached.fresh,
        hasShown: false,
        isLeaving: false,
        avatarUploading: false,
      })
    }
  },

  onShow() {
    const firstShow = !this.data.hasShown
    if (firstShow) this.setData({ hasShown: true })
    if (firstShow && this.data.cacheFresh) return
    void this.refreshAuth()
  },

  onPullDownRefresh() {
    void this.refreshAuth(true)
  },

  async refreshAuth(fromPullDown = false) {
    const sequence = spaceRequestGate.begin()
    const startedAt = Date.now()
    const firstLoad = !this.data.hasLoaded
    if (firstLoad) this.setData({ initialLoading: true })

    const auth = await hydrateAuthState()
    if (!spaceRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }

    if (appConfig.demoMode) {
      this.renderDemo(auth)
    } else {
      await this.loadApiSpace(auth, sequence, firstLoad)
    }

    if (!spaceRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    if (firstLoad) await waitForMinimumLoading(startedAt)
    if (!spaceRequestGate.isCurrent(sequence)) {
      if (fromPullDown) wx.stopPullDownRefresh()
      return
    }
    this.setData({
      initialLoading: false,
      hasLoaded: true,
      cacheFresh: true,
    }, () => this.cacheCurrentPage())
    if (fromPullDown) wx.stopPullDownRefresh()
  },

  renderDemo(auth: AuthState) {
    const currentUser = auth.user
    const avatarMediaId = getDemoSpaceAvatarMediaId()
    const members: MemberView[] = [{
      userId: currentUser?.id ?? 'demo-owner',
      nickname: auth.isLoggedIn && currentUser
        ? currentUser.nickname || '待完善资料'
        : '登录后查看共同空间',
      avatarText: auth.isLoggedIn ? auth.avatarText : '访',
      avatarTone: currentUser?.avatarTone ?? 'lavender',
      avatarMediaId: currentUser?.avatarMediaId ?? '',
      avatarUrl: '',
      role: 'owner',
      roleLabel: auth.isLoggedIn ? '创建人' : '待登录',
      meta: auth.isLoggedIn ? '空间由你发起' : '登录后进入共同空间',
      canRemove: false,
    }]
    if (auth.isLoggedIn) {
      members.push({
        userId: 'demo-member',
        nickname: '共同生活成员',
        avatarText: '屿',
        avatarTone: 'lavender',
        avatarMediaId: '',
        avatarUrl: '',
        role: 'member',
        roleLabel: '共创人',
        meta: '共同维护这份生活',
        canRemove: true,
      })
    }
    this.setData({
      isDemoMode: true,
      spaceId: '',
      spaceName: getDemoSpaceName(),
      spaceRole: 'owner',
      spaceRoleLabel: '创建人',
      spaceCreatedLabel: auth.isLoggedIn
        ? '空间由你发起，邀请朋友一起记录生活。'
        : '登录后进入共同空间。',
      spaceAvatarMediaId: avatarMediaId,
      spaceAvatarUrl: '',
      memberCount: members.length,
      members,
      isLoggedIn: auth.isLoggedIn,
      isOwner: auth.isLoggedIn,
      inviteCode: getDemoInviteCode(),
      hasInvite: auth.isLoggedIn,
      inviteExpiryLabel: 'Demo 邀请码 · 真实版本 7 天内有效',
      isLeaving: false,
    })
    void this.hydrateSpaceAvatar(avatarMediaId)
    void this.hydrateMemberAvatars(members)
  },

  async loadApiSpace(auth: AuthState, sequence: number, firstLoad: boolean) {
    if (!auth.isLoggedIn || !auth.activeSpaceId) {
      this.setData({
        isDemoMode: false,
        isLoggedIn: false,
        isOwner: false,
        members: [],
        memberCount: 0,
        spaceName: auth.spaceName || '我们的家',
        spaceRoleLabel: '共创人',
        spaceCreatedLabel: '登录后可查看共同空间。',
        spaceAvatarMediaId: '',
        spaceAvatarUrl: '',
        isLeaving: false,
      })
      return
    }

    if (!firstLoad) this.setData({ spaceId: auth.activeSpaceId, cacheFresh: false })
    else this.setData({ spaceId: auth.activeSpaceId })

    const [spaceResult, membersResult] = await Promise.all([
      getApiSpace(auth.activeSpaceId),
      listApiSpaceMembers(auth.activeSpaceId),
    ])
    if (!spaceRequestGate.isCurrent(sequence)) return
    if (!spaceResult.ok || !spaceResult.data) {
      wx.showToast({ title: spaceResult.message || '空间读取失败', icon: 'none' })
      return
    }
    if (!membersResult.ok) {
      wx.showToast({ title: membersResult.message || '成员读取失败', icon: 'none' })
    }
    this.renderApiSpace(spaceResult.data, membersResult.data, auth.user?.id ?? '')
  },

  renderApiSpace(space: ApiSpaceDetail, members: ApiSpaceMember[], currentUserId: string) {
    const memberViews = members.map((member): MemberView => ({
      userId: member.userId,
      nickname: member.nickname || '待完善资料',
      avatarText: buildDemoAvatarText(member.nickname),
      avatarTone: member.avatarTone,
      avatarMediaId: member.avatarMediaId ?? '',
      avatarUrl: '',
      role: member.role,
      roleLabel: member.role === 'owner' ? '创建人' : '共创人',
      meta: member.role === 'owner' ? '空间由你发起' : '共同维护这份生活',
      canRemove: space.role === 'owner' && member.role === 'member' && member.userId !== currentUserId,
    }))
    this.setData({
      isDemoMode: false,
      spaceId: space.id,
      spaceName: space.name,
      spaceRole: space.role,
      spaceRoleLabel: space.role === 'owner' ? '创建人' : '共创人',
      spaceCreatedLabel: space.role === 'owner'
        ? '空间由你发起，邀请朋友一起记录生活。'
        : '与你一起维护这份生活。',
      spaceAvatarMediaId: space.avatarMediaId ?? '',
      spaceAvatarUrl: this.data.spaceAvatarMediaId === (space.avatarMediaId ?? '')
        ? this.data.spaceAvatarUrl
        : '',
      memberCount: memberViews.length,
      members: memberViews,
      isLoggedIn: true,
      isOwner: space.role === 'owner',
      inviteExpiryLabel: '一次性邀请码 · 创建后 7 天内有效',
      isLeaving: false,
    })
    void this.hydrateSpaceAvatar(space.avatarMediaId)
    void this.hydrateMemberAvatars(memberViews)
  },

  async hydrateSpaceAvatar(mediaId: string) {
    if (!mediaId) return
    const avatarUrl = await resolveAvatarUrl(mediaId, 'display')
    if (this.data.spaceAvatarMediaId !== mediaId) return
    this.setData({ spaceAvatarUrl: avatarUrl }, () => this.cacheCurrentPage())
  },

  async hydrateMemberAvatars(members: MemberView[]) {
    const requestedIds = members.map((member) => member.userId).join('|')
    const resolved = await Promise.all(members.map(async (member) => ({
      ...member,
      avatarUrl: await resolveAvatarUrl(member.avatarMediaId),
    })))
    if (this.data.members.map((member) => member.userId).join('|') !== requestedIds) {
      return
    }
    this.setData({ members: resolved }, () => this.cacheCurrentPage())
  },

  onSpaceAvatarError() {
    this.setData({ spaceAvatarUrl: '' })
  },

  onMemberAvatarError(event: WechatMiniprogram.TouchEvent) {
    const index = Number(event.currentTarget.dataset.index)
    if (!Number.isInteger(index)) return
    this.setData({ [`members[${index}].avatarUrl`]: '' })
  },

  onBack() {
    navigateBackOrTab('/pages/profile/index')
  },

  onSpaceAvatarTap() {
    if (!this.data.isOwner) {
      wx.showToast({ title: '只有创建人可以更换空间头像', icon: 'none' })
      return
    }
    if (this.data.avatarUploading) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file?.tempFilePath) return
        if (file.size > MAX_AVATAR_BYTES) {
          wx.showToast({ title: '图片不能超过 10 MiB', icon: 'none' })
          return
        }
        const cropImage = (wx as unknown as { cropImage?: CropImageApi }).cropImage
        if (!cropImage) {
          wx.showToast({ title: '当前微信版本不支持裁剪，请升级后重试', icon: 'none' })
          return
        }
        cropImage({
          src: file.tempFilePath,
          cropScale: '1:1',
          success: (cropped) => {
            if (!cropped.tempFilePath) return
            void this.uploadSpaceAvatar(cropped.tempFilePath, file.size)
          },
          fail: () => {
            // 用户取消裁剪时不产生上传副作用。
          },
        })
      },
    })
  },

  async uploadSpaceAvatar(filePath: string, fileSize: number) {
    const sequence = ++avatarUploadSequence
    const previousMediaId = this.data.spaceAvatarMediaId
    const previousUrl = this.data.spaceAvatarUrl
    this.setData({ avatarUploading: true, spaceAvatarUrl: filePath })
    try {
      const asset = await mediaGateway.upload(filePath, 'avatar', fileSize)
      if (sequence !== avatarUploadSequence) return
      let savedMediaId = asset.id
      if (appConfig.demoMode) {
        setDemoSpaceAvatarMediaId(asset.id)
      } else {
        const result = await updateApiSpaceAvatar(this.data.spaceId, asset.id)
        if (!result.ok || !result.data) {
          throw new Error(result.message || '空间头像没有保存成功')
        }
        savedMediaId = result.data.avatarMediaId
      }
      this.setData({
        spaceAvatarMediaId: savedMediaId,
        spaceAvatarUrl: asset.display.url || asset.thumb.url || filePath,
        avatarUploading: false,
      }, () => {
        invalidatePageCache(SPACE_PAGE_CACHE_KEY)
        this.cacheCurrentPage()
      })
      wx.showToast({ title: '空间头像已更新', icon: 'success' })
    } catch (error) {
      if (sequence !== avatarUploadSequence) return
      this.setData({
        spaceAvatarMediaId: previousMediaId,
        spaceAvatarUrl: previousUrl,
        avatarUploading: false,
      })
      const message = error instanceof Error && error.message
        ? error.message
        : getMediaErrorMessage(error, '空间头像没有上传成功')
      wx.showToast({ title: message, icon: 'none' })
    }
  },

  onRemoveMember(event: WechatMiniprogram.TouchEvent) {
    if (!this.data.isOwner) return
    const index = Number(event.currentTarget.dataset.index)
    const member = this.data.members[index]
    if (!Number.isInteger(index) || !member || !member.canRemove) return
    wx.showModal({
      title: '移除这位共创人？',
      content: `移除后，「${member.nickname}」将无法继续看到这里的共同内容，之后需要重新收到邀请。`,
      cancelText: '先不处理',
      confirmText: '确认移除',
      confirmColor: '#b86757',
      success: (result) => {
        if (!result.confirm) return
        void this.removeMember(index, member)
      },
    })
  },

  async removeMember(index: number, member: MemberView) {
    if (appConfig.demoMode) {
      const members = this.data.members.filter((item) => item.userId !== member.userId)
      this.setData({ members, memberCount: members.length }, () => this.cacheCurrentPage())
      wx.showToast({ title: '已移除共创人', icon: 'success' })
      return
    }
    const result = await removeApiSpaceMember(this.data.spaceId, member.userId)
    if (!result.ok) {
      wx.showToast({ title: result.message || '移除成员失败', icon: 'none' })
      return
    }
    const members = this.data.members.filter((_, itemIndex) => itemIndex !== index)
    this.setData({ members, memberCount: members.length }, () => {
      invalidatePageCache(SPACE_PAGE_CACHE_KEY)
      this.cacheCurrentPage()
    })
    wx.showToast({ title: '已移除共创人', icon: 'success' })
  },

  onLeaveSpace() {
    if (this.data.spaceRole !== 'member' || this.data.isLeaving) return
    wx.showModal({
      title: '有些日子，只能陪你到这里',
      content: '离开后，这份共同生活将不再对你可见。你留下的记录仍会安静地留在这里。',
      cancelText: '再想一想',
      confirmText: '继续退出',
      confirmColor: '#b86757',
      success: (first) => {
        if (!first.confirm) return
        setTimeout(() => {
          wx.showModal({
            title: '真的要离开吗？',
            content: '此后再想回来，需要重新收到一份邀请。',
            cancelText: '留在这里',
            confirmText: '遗憾退出',
            confirmColor: '#b86757',
            success: (second) => {
              if (second.confirm) void this.leaveCurrentSpace()
            },
          })
        }, 180)
      },
    })
  },

  async leaveCurrentSpace() {
    if (this.data.isLeaving) return
    this.setData({ isLeaving: true })
    const result = await leaveApiSpace(this.data.spaceId)
    if (!result.ok) {
      this.setData({ isLeaving: false })
      wx.showToast({ title: result.message || '退出空间失败', icon: 'none' })
      return
    }
    invalidatePageCache(SPACE_PAGE_CACHE_KEY)
    wx.showToast({ title: '已离开这个空间', icon: 'success' })
    setTimeout(() => openAppRoot('/pages/profile/index'), 420)
  },

  onRename() {
    if (!this.data.isOwner) {
      wx.showToast({ title: '只有创建人可以修改空间名', icon: 'none' })
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
          this.setData({ spaceName: setDemoSpaceName(name) }, () => this.cacheCurrentPage())
          wx.showToast({ title: '空间名称已更新', icon: 'success' })
          return
        }
        void this.renameSpace(name)
      },
    })
  },

  async renameSpace(name: string) {
    const result = await renameApiSpace(this.data.spaceId, name)
    if (!result.ok || !result.data) {
      wx.showToast({ title: result.message || '空间名称更新失败', icon: 'none' })
      return
    }
    this.setData({ spaceName: result.data.name }, () => {
      invalidatePageCache(SPACE_PAGE_CACHE_KEY)
      this.cacheCurrentPage()
    })
    wx.showToast({ title: '空间名称已更新', icon: 'success' })
  },

  async onRefreshInvite() {
    if (!this.data.isOwner) {
      wx.showToast({ title: '只有创建人可以生成邀请码', icon: 'none' })
      return
    }
    if (appConfig.demoMode) {
      const code = refreshDemoInviteCode()
      this.setData({ inviteCode: code, hasInvite: true }, () => this.cacheCurrentPage())
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
    }, () => this.cacheCurrentPage())
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
      wx.showToast({ title: '只有创建人可以邀请成员', icon: 'none' })
      return ''
    }
    if (this.data.inviteCode) return this.data.inviteCode
    if (appConfig.demoMode) {
      const code = getDemoInviteCode()
      this.setData({ inviteCode: code, hasInvite: true }, () => this.cacheCurrentPage())
      return code
    }
    return this.createInvite()
  },

  cacheCurrentPage() {
    const data = this.data as unknown as Record<string, unknown>
    const {
      initialLoading: _initialLoading,
      cacheFresh: _cacheFresh,
      hasShown: _hasShown,
      isLeaving: _isLeaving,
      avatarUploading: _avatarUploading,
      ...snapshot
    } = data
    writePageCache(SPACE_PAGE_CACHE_KEY, snapshot)
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

function formatDateTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '7 天后'
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${month}-${day} ${hours}:${minutes}`
}
