import {
  buildDemoAvatarText,
  createDemoUserProfile,
  isDemoAvatarTone,
  normalizeDemoNickname,
  validateDemoNickname,
  type DemoUserInput,
  type DemoUserProfile,
} from '../domain/demo-auth'

interface DemoAuthSession {
  userId: string
  loggedInAt: string
}

export interface DemoAuthState {
  isLoggedIn: boolean
  user: DemoUserProfile | null
  avatarText: string
}

export type DemoAuthResult =
  | { ok: true; user: DemoUserProfile }
  | {
      ok: false
      reason: 'invalid-nickname' | 'not-registered'
      message: string
    }

const ACCOUNT_KEY = 'popcorn_demo_auth_account_v1'
const SESSION_KEY = 'popcorn_demo_auth_session_v1'

export const DEMO_AUTH_STORAGE_KEYS = [ACCOUNT_KEY, SESSION_KEY] as const

function isUserProfile(value: unknown): value is DemoUserProfile {
  if (!value || typeof value !== 'object') return false
  const user = value as Partial<DemoUserProfile>
  return (
    typeof user.id === 'string' &&
    typeof user.nickname === 'string' &&
    normalizeDemoNickname(user.nickname).length > 0 &&
    isDemoAvatarTone(user.avatarTone) &&
    typeof user.createdAt === 'string'
  )
}

function readAccount(): DemoUserProfile | null {
  const value = wx.getStorageSync<unknown>(ACCOUNT_KEY)
  return isUserProfile(value) ? value : null
}

function readSession(): DemoAuthSession | null {
  const value = wx.getStorageSync<Partial<DemoAuthSession> | ''>(SESSION_KEY)
  if (!value || typeof value !== 'object') return null
  if (typeof value.userId !== 'string' || typeof value.loggedInAt !== 'string') {
    return null
  }
  return { userId: value.userId, loggedInAt: value.loggedInAt }
}

function writeSession(user: DemoUserProfile, nowMs = Date.now()): void {
  const session: DemoAuthSession = {
    userId: user.id,
    loggedInAt: new Date(nowMs).toISOString(),
  }
  wx.setStorageSync(SESSION_KEY, session)
}

function buildState(user: DemoUserProfile | null, isLoggedIn: boolean): DemoAuthState {
  return {
    isLoggedIn,
    user,
    avatarText: buildDemoAvatarText(user?.nickname ?? ''),
  }
}

export function getDemoAccount(): DemoUserProfile | null {
  return readAccount()
}

export function getDemoAuthState(): DemoAuthState {
  const user = readAccount()
  const session = readSession()
  const isLoggedIn = Boolean(user && session?.userId === user.id)
  return buildState(user, isLoggedIn)
}

export function registerDemoAccount(
  input: DemoUserInput,
  nowMs = Date.now(),
): DemoAuthResult {
  const message = validateDemoNickname(input.nickname)
  if (message) return { ok: false, reason: 'invalid-nickname', message }

  const user = createDemoUserProfile(input, { nowMs })
  wx.setStorageSync(ACCOUNT_KEY, user)
  writeSession(user, nowMs)
  return { ok: true, user }
}

export function loginDemoAccount(nowMs = Date.now()): DemoAuthResult {
  const user = readAccount()
  if (!user) {
    return {
      ok: false,
      reason: 'not-registered',
      message: '这台设备上还没有账号，先创建一个吧',
    }
  }

  writeSession(user, nowMs)
  return { ok: true, user }
}

export function updateDemoAccount(
  input: DemoUserInput,
): DemoAuthResult {
  const user = readAccount()
  if (!user) {
    return {
      ok: false,
      reason: 'not-registered',
      message: '没有找到可编辑的本机账号',
    }
  }

  const message = validateDemoNickname(input.nickname)
  if (message) return { ok: false, reason: 'invalid-nickname', message }

  const updated: DemoUserProfile = {
    ...user,
    nickname: normalizeDemoNickname(input.nickname),
    avatarTone: input.avatarTone,
  }
  wx.setStorageSync(ACCOUNT_KEY, updated)
  return { ok: true, user: updated }
}

export function logoutDemoAccount(): void {
  wx.removeStorageSync(SESSION_KEY)
}

export function resetDemoAuth(): void {
  for (const key of DEMO_AUTH_STORAGE_KEYS) wx.removeStorageSync(key)
}
