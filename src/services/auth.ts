import { appConfig } from '../config/env'
import {
  buildDemoAvatarText,
  type DemoUserInput,
  type DemoUserProfile,
} from '../domain/demo-auth'
import {
  getDemoAccount,
  getDemoAuthState,
  loginDemoAccount,
  logoutDemoAccount,
  registerDemoAccount,
  resetDemoAuth,
  updateDemoAccount,
} from './demo-auth'
import { getDemoSpaceName } from './demo-space'
import {
  clearApiAccount,
  loginWithApi,
  logoutApi,
  restoreApiSession,
  updateApiProfile,
} from './auth-gateway'
import {
  readCachedApiSession,
  readStoredApiSession,
} from '../stores/session'
import type { ApiSession } from '../types/api'

export type AuthSource = 'demo' | 'api' | 'none'

export interface AuthState {
  isLoggedIn: boolean
  user: DemoUserProfile | null
  avatarText: string
  spaceName: string
  activeSpaceId: string
  spaceRole: 'owner' | 'member' | ''
  onboardingRequired: boolean
  source: AuthSource
}

export interface AuthActionResult {
  ok: boolean
  state: AuthState
  requiresProfile?: boolean
  message?: string
  code?: string
}

const EMPTY_AUTH_STATE: AuthState = {
  isLoggedIn: false,
  user: null,
  avatarText: '访',
  spaceName: '我们的家',
  activeSpaceId: '',
  spaceRole: '',
  onboardingRequired: false,
  source: 'none',
}

export function getAuthState(): AuthState {
  if (appConfig.demoMode) {
    const auth = getDemoAuthState()
    return {
      isLoggedIn: auth.isLoggedIn,
      user: auth.user,
      avatarText: auth.isLoggedIn ? auth.avatarText : '访',
      spaceName: getDemoSpaceName(),
      activeSpaceId: '',
      spaceRole: auth.isLoggedIn ? 'owner' : '',
      onboardingRequired: false,
      source: 'demo',
    }
  }

  const stored = readStoredApiSession()
  if (!stored) return { ...EMPTY_AUTH_STATE, source: 'api' }
  return buildApiAuthState(stored.session)
}

export async function hydrateAuthState(): Promise<AuthState> {
  if (appConfig.demoMode) return getAuthState()

  const result = await restoreApiSession()
  if (result.ok && result.session) return buildApiAuthState(result.session)
  return getAuthState()
}

export function getKnownAuthAccount(): DemoUserProfile | null {
  if (appConfig.demoMode) return getDemoAccount()
  const user = readCachedApiSession()?.user ?? null
  return user?.nickname ? toDemoUserProfile(user) : null
}

export async function loginAuth(): Promise<AuthActionResult> {
  if (appConfig.demoMode) {
    const result = loginDemoAccount()
    if (!result.ok) {
      if (result.reason === 'not-registered') {
        return {
          ok: true,
          requiresProfile: true,
          state: getAuthState(),
        }
      }
      return {
        ok: false,
        message: result.message,
        state: getAuthState(),
      }
    }
    return {
      ok: true,
      requiresProfile: false,
      state: getAuthState(),
    }
  }

  const result = await loginWithApi()
  return {
    ok: result.ok,
    requiresProfile: result.requiresProfile,
    message: result.message,
    code: result.code,
    state: result.session
      ? buildApiAuthState(result.session)
      : getAuthState(),
  }
}

export async function saveAuthProfile(
  input: DemoUserInput,
): Promise<AuthActionResult> {
  if (appConfig.demoMode) {
    const account = getDemoAccount()
    const result = account
      ? updateDemoAccount(input)
      : registerDemoAccount(input)
    return {
      ok: result.ok,
      message: result.ok ? undefined : result.message,
      code: result.ok ? undefined : result.reason,
      state: getAuthState(),
    }
  }

  const result = await updateApiProfile(input)
  return {
    ok: result.ok,
    message: result.message,
    code: result.code,
    requiresProfile: result.requiresProfile,
    state: result.session
      ? buildApiAuthState(result.session)
      : getAuthState(),
  }
}

export async function logoutAuth(): Promise<AuthState> {
  if (appConfig.demoMode) {
    logoutDemoAccount()
    return getAuthState()
  }
  await logoutApi()
  return getAuthState()
}

export async function resetAuthAccount(): Promise<AuthState> {
  if (appConfig.demoMode) {
    resetDemoAuth()
    return getAuthState()
  }
  await clearApiAccount()
  return getAuthState()
}

function buildApiAuthState(session: ApiSession): AuthState {
  const sessionUser = session.user
  const activeSpace = session.spaces.find(
    (space) => space.id === session.activeSpaceId,
  )
  return {
    isLoggedIn: true,
    user: toDemoUserProfile(sessionUser),
    avatarText: buildDemoAvatarText(sessionUser.nickname),
    spaceName: activeSpace?.name ?? '我们的家',
    activeSpaceId: session.activeSpaceId,
    spaceRole: activeSpace?.role ?? '',
    onboardingRequired: session.onboardingRequired,
    source: 'api',
  }
}

function toDemoUserProfile(
  user: ApiSession['user'],
): DemoUserProfile {
  return {
    id: user.id,
    nickname: user.nickname,
    avatarTone: user.avatarTone,
    avatarMediaId: user.avatarMediaId ?? '',
    createdAt: user.createdAt,
  }
}
