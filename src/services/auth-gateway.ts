import { appConfig } from '../config/env'
import { requestApi } from './http'
import {
  clearApiSession,
  getOrCreateMockIdentity,
  readApiToken,
  saveApiSession,
} from '../stores/session'
import type {
  ApiLoginResponse,
  ApiSession,
  LoginRequest,
  MockLoginRequest,
  ProfileUpdateRequest,
} from '../types/api'

export interface AuthGatewayResult {
  ok: boolean
  message?: string
  code?: string
  session?: ApiSession
  requiresProfile?: boolean
}

export async function loginWithApi(): Promise<AuthGatewayResult> {
  try {
    const response = appConfig.apiAuthMode === 'mock'
      ? await loginMock()
      : await loginWeChat()
    saveApiSession(response, response.token)
    return {
      ok: true,
      session: response,
      requiresProfile: response.onboardingRequired,
    }
  } catch (error) {
    return gatewayError(error)
  }
}

export async function restoreApiSession(): Promise<AuthGatewayResult> {
  const token = readApiToken()
  if (!token) return { ok: false, code: 'NO_SESSION' }

  try {
    const session = await requestApi<ApiSession>('/session', { token })
    saveApiSession(session)
    return {
      ok: true,
      session,
      requiresProfile: session.onboardingRequired,
    }
  } catch (error) {
    const result = gatewayError(error)
    if (result.code === 'UNAUTHENTICATED') clearApiSession()
    return result
  }
}

export async function updateApiProfile(
  input: ProfileUpdateRequest,
): Promise<AuthGatewayResult> {
  const token = readApiToken()
  if (!token) {
    return { ok: false, code: 'UNAUTHENTICATED', message: '请先登录' }
  }

  try {
    const session = await requestApi<ApiSession>('/me', {
      method: 'PUT',
      token,
      body: input,
    })
    saveApiSession(session)
    return {
      ok: true,
      session,
      requiresProfile: session.onboardingRequired,
    }
  } catch (error) {
    return gatewayError(error)
  }
}

export async function logoutApi(): Promise<void> {
  const token = readApiToken()
  try {
    if (token) await requestApi<void>('/session', { method: 'DELETE', token })
  } finally {
    clearApiSession()
  }
}

export async function clearApiAccount(): Promise<void> {
  await logoutApi()
  clearApiSession()
}

async function loginMock(): Promise<ApiLoginResponse> {
  const body: MockLoginRequest = {
    identity: getOrCreateMockIdentity(),
    deviceLabel: '微信开发者工具',
  }
  return requestApi<ApiLoginResponse>('/auth/mock', {
    method: 'POST',
    body,
  })
}

async function loginWeChat(): Promise<ApiLoginResponse> {
  const code = await requestWeChatCode()
  const body: LoginRequest = {
    code,
    deviceLabel: '微信小程序',
  }
  return requestApi<ApiLoginResponse>('/auth/wechat', {
    method: 'POST',
    body,
  })
}

function requestWeChatCode(): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.login({
      success(result) {
        if (result.code) {
          resolve(result.code)
          return
        }
        reject(new AuthGatewayError('微信没有返回登录凭证'))
      },
      fail() {
        reject(new AuthGatewayError('微信登录暂时不可用'))
      },
    })
  })
}

class AuthGatewayError extends Error {
  readonly code: string

  constructor(message: string, code = 'WECHAT_LOGIN_FAILED') {
    super(message)
    this.name = 'AuthGatewayError'
    this.code = code
  }
}

function gatewayError(error: unknown): AuthGatewayResult {
  if (error && typeof error === 'object') {
    const value = error as { message?: unknown; code?: unknown }
    return {
      ok: false,
      message: typeof value.message === 'string' ? value.message : '登录没有完成',
      code: typeof value.code === 'string' ? value.code : 'AUTH_FAILED',
    }
  }
  return {
    ok: false,
    message: '登录没有完成，请稍后再试',
    code: 'AUTH_FAILED',
  }
}
