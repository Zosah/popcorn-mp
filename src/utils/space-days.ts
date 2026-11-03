import { getShanghaiDateOnly } from '../domain/expiry'
import type { AuthState } from '../services/auth'

/** 按上海自然日计算共同生活天数，空间创建当天记为第 1 天。 */
export function getTogetherDays(createdAt: string, today: string): number | null {
  if (!createdAt) return null
  const timestamp = Date.parse(createdAt)
  if (Number.isNaN(timestamp)) return null

  const createdDate = getShanghaiDateOnly(timestamp)
  const start = Date.parse(`${createdDate}T00:00:00+08:00`)
  const end = Date.parse(`${today}T00:00:00+08:00`)
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null
  return Math.floor((end - start) / 86400000) + 1
}

/** 优先使用当前空间创建时间；演示模式下回退到本机账号创建时间。 */
export function getActiveSpaceCreatedAt(auth: AuthState): string {
  return auth.spaces.find((space) => space.id === auth.activeSpaceId)?.createdAt
    ?? auth.user?.createdAt
    ?? ''
}
