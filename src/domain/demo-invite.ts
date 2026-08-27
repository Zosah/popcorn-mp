export type DemoInviteStatus = 'empty' | 'invalid' | 'available' | 'accepted'

export interface DemoInviteResolution {
  code: string
  status: DemoInviteStatus
}

const DEMO_INVITE_PATTERN = /^(SHIKEZAI|SKZ[A-Z0-9]{5}|POPCORN|POP[A-Z0-9]{5})$/

/**
 * 整理用户输入的邀请码，便于输入、分享路径和本地存储使用同一格式。
 */
export function normalizeDemoInviteCode(value: string): string {
  return value.trim().toUpperCase()
}

/**
 * 识别 Demo 支持的邀请码格式；真实有效性最终由服务端校验。
 */
export function isDemoInviteCode(value: string): boolean {
  return DEMO_INVITE_PATTERN.test(normalizeDemoInviteCode(value))
}

/**
 * 根据格式与本地接受记录生成邀请页状态。
 */
export function resolveDemoInvite(
  value: string,
  acceptedCodes: readonly string[] = [],
): DemoInviteResolution {
  const code = normalizeDemoInviteCode(value)
  if (!code) return { code, status: 'empty' }
  if (!isDemoInviteCode(code)) return { code, status: 'invalid' }

  const accepted = acceptedCodes.some(
    (acceptedCode) => normalizeDemoInviteCode(acceptedCode) === code,
  )
  return { code, status: accepted ? 'accepted' : 'available' }
}

/**
 * 生成适合当前 Demo 展示的短邀请码。
 */
export function createDemoInviteCode(seed = Date.now()): string {
  return `SKZ${String(Math.abs(Math.trunc(seed))).slice(-5).padStart(5, '0')}`
}

/**
 * 生成微信分享使用的邀请落地页路径。
 */
export function buildDemoInvitePath(code: string): string {
  return `/pages/invite/index?code=${encodeURIComponent(normalizeDemoInviteCode(code))}`
}
