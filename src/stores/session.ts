import type { ApiSession, ApiUser } from '../types/api'

export interface StoredApiSession {
  token: string
  session: ApiSession
}

const TOKEN_KEY = 'popcorn_api_auth_token_v1'
const SESSION_KEY = 'popcorn_api_auth_session_v1'
const MOCK_IDENTITY_KEY = 'popcorn_api_mock_identity_v1'

export const API_SESSION_STORAGE_KEYS = [
  TOKEN_KEY,
  SESSION_KEY,
] as const

export function readApiToken(): string {
  const value = wx.getStorageSync<unknown>(TOKEN_KEY)
  return typeof value === 'string' ? value : ''
}

export function readCachedApiSession(): ApiSession | null {
  const value = wx.getStorageSync<unknown>(SESSION_KEY)
  return isApiSession(value) ? value : null
}

export function readStoredApiSession(): StoredApiSession | null {
  const token = readApiToken()
  const session = readCachedApiSession()
  return token && session ? { token, session } : null
}

export function saveApiSession(
  session: ApiSession,
  token?: string,
): void {
  const nextToken = token || readApiToken()
  if (nextToken) wx.setStorageSync(TOKEN_KEY, nextToken)
  wx.setStorageSync(SESSION_KEY, session)
}

export function clearApiSession(): void {
  wx.removeStorageSync(TOKEN_KEY)
  wx.removeStorageSync(SESSION_KEY)
}

export function readCachedApiUser(): ApiUser | null {
  const session = readCachedApiSession()
  return session?.user ?? null
}

export function getOrCreateMockIdentity(): string {
  const stored = wx.getStorageSync<unknown>(MOCK_IDENTITY_KEY)
  if (typeof stored === 'string' && stored) return stored
  const identity = 'local-dev'
  wx.setStorageSync(MOCK_IDENTITY_KEY, identity)
  return identity
}

function isApiSession(value: unknown): value is ApiSession {
  if (!value || typeof value !== 'object') return false
  const session = value as Partial<ApiSession>
  if (!session.user || typeof session.user.id !== 'string') return false
  if (!Array.isArray(session.spaces)) return false
  return (
    typeof session.activeSpaceId === 'string' &&
    typeof session.expiresAt === 'string' &&
    typeof session.onboardingRequired === 'boolean'
  )
}
