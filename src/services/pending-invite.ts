const PENDING_INVITE_KEY = 'popcorn_pending_invite_v1'
const PENDING_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface PendingInviteRecord {
  code: string
  savedAt: number
}

export function savePendingInvite(code: string): void {
  const normalized = code.trim().toUpperCase()
  if (!normalized) return
  try {
    wx.setStorageSync(PENDING_INVITE_KEY, {
      code: normalized,
      savedAt: Date.now(),
    } satisfies PendingInviteRecord)
  } catch {
    // 本机存储异常不阻塞登录；邀请页本身仍保留当前邀请码。
  }
}

export function readPendingInvite(): string {
  try {
    const value = wx.getStorageSync(PENDING_INVITE_KEY) as Partial<PendingInviteRecord> | undefined
    if (!value?.code || typeof value.savedAt !== 'number') return ''
    if (Date.now() - value.savedAt > PENDING_INVITE_TTL_MS) {
      clearPendingInvite()
      return ''
    }
    return value.code
  } catch {
    return ''
  }
}

export function clearPendingInvite(): void {
  try {
    wx.removeStorageSync(PENDING_INVITE_KEY)
  } catch {
    // 清理失败不影响主流程，过期记录会在下次读取时自动失效。
  }
}
