import {
  createDemoInviteCode,
  normalizeDemoInviteCode,
  resolveDemoInvite,
  type DemoInviteResolution,
} from '../domain/demo-invite'

const CURRENT_CODE_KEY = 'popcorn_demo_invite_code_v1'
const ACCEPTED_CODES_KEY = 'popcorn_demo_accepted_invites_v1'
const DEFAULT_CODE = 'SHIKEZAI'
const CURRENT_CODE_PATTERN = /^(SHIKEZAI|SKZ[A-Z0-9]{5})$/

export function getDemoInviteCode(): string {
  const value = wx.getStorageSync<string | ''>(CURRENT_CODE_KEY)
  const code = typeof value === 'string' ? normalizeDemoInviteCode(value) : ''
  return CURRENT_CODE_PATTERN.test(code) ? code : DEFAULT_CODE
}

export function refreshDemoInviteCode(nowMs = Date.now()): string {
  const code = createDemoInviteCode(nowMs)
  wx.setStorageSync(CURRENT_CODE_KEY, code)
  return code
}

export function listAcceptedDemoInviteCodes(): string[] {
  const value = wx.getStorageSync<string[] | ''>(ACCEPTED_CODES_KEY)
  return Array.isArray(value) ? value.map(normalizeDemoInviteCode) : []
}

export function acceptDemoInviteCode(code: string): DemoInviteResolution {
  const acceptedCodes = listAcceptedDemoInviteCodes()
  const invite = resolveDemoInvite(code, acceptedCodes)
  if (invite.status !== 'available') return invite

  wx.setStorageSync(ACCEPTED_CODES_KEY, [...acceptedCodes, invite.code])
  return { code: invite.code, status: 'accepted' }
}
