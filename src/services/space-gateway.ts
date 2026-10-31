import { requestApi } from './http'
import {
  readApiToken,
  saveApiSession,
} from '../stores/session'
import { TransportError } from './transport'
import type {
  ApiCreatedInvite,
  ApiInvitePreview,
  ApiSession,
  ApiSpaceDetail,
  ApiSpaceMember,
  ApiSpaceMemberList,
} from '../types/api'

export interface SpaceGatewayResult<T> {
  ok: boolean
  data?: T
  code?: string
  message?: string
}

export interface SpaceMembersResult extends SpaceGatewayResult<ApiSpaceMember[]> {
  data: ApiSpaceMember[]
}

export async function getApiSpace(
  spaceId: string,
): Promise<SpaceGatewayResult<ApiSpaceDetail>> {
  const token = readApiToken()
  if (!token) return unauthenticated()
  try {
    return {
      ok: true,
      data: await requestApi<ApiSpaceDetail>(`/spaces/${encodeURIComponent(spaceId)}`, { token }),
    }
  } catch (error) {
    return gatewayError(error)
  }
}

export async function listApiSpaceMembers(
  spaceId: string,
): Promise<SpaceMembersResult> {
  const token = readApiToken()
  if (!token) return { ...unauthenticated(), data: [] }
  try {
    const response = await requestApi<ApiSpaceMemberList>(
      `/spaces/${encodeURIComponent(spaceId)}/members`,
      { token },
    )
    return { ok: true, data: response.items }
  } catch (error) {
    return { ...gatewayError(error), data: [] }
  }
}

export async function renameApiSpace(
  spaceId: string,
  name: string,
): Promise<SpaceGatewayResult<ApiSpaceDetail>> {
  const token = readApiToken()
  if (!token) return unauthenticated()
  try {
    const space = await requestApi<ApiSpaceDetail>(
      `/spaces/${encodeURIComponent(spaceId)}`,
      { method: 'PUT', token, body: { name } },
    )
    await refreshSessionCache()
    return { ok: true, data: space }
  } catch (error) {
    return gatewayError(error)
  }
}

export async function createApiSpaceInvite(
  spaceId: string,
): Promise<SpaceGatewayResult<ApiCreatedInvite>> {
  const token = readApiToken()
  if (!token) return unauthenticated()
  try {
    return {
      ok: true,
      data: await requestApi<ApiCreatedInvite>(
        `/spaces/${encodeURIComponent(spaceId)}/invites`,
        { method: 'POST', token },
      ),
    }
  } catch (error) {
    return gatewayError(error)
  }
}

export async function resolveApiInvite(
  code: string,
): Promise<SpaceGatewayResult<ApiInvitePreview>> {
  try {
    return {
      ok: true,
      data: await requestApi<ApiInvitePreview>(`/invites/${encodeURIComponent(code)}`),
    }
  } catch (error) {
    return gatewayError(error)
  }
}

export async function acceptApiInvite(
  code: string,
): Promise<SpaceGatewayResult<ApiSpaceDetail>> {
  const token = readApiToken()
  if (!token) return unauthenticated()
  try {
    const space = await requestApi<ApiSpaceDetail>(
      `/invites/${encodeURIComponent(code)}/accept`,
      { method: 'POST', token },
    )
    await refreshSessionCache()
    return { ok: true, data: space }
  } catch (error) {
    return gatewayError(error)
  }
}

export async function leaveApiSpace(
  spaceId: string,
): Promise<SpaceGatewayResult<void>> {
  const token = readApiToken()
  if (!token) return unauthenticated()
  try {
    await requestApi<void>(
      `/spaces/${encodeURIComponent(spaceId)}/members/me`,
      { method: 'DELETE', token },
    )
    await refreshSessionCache()
    return { ok: true }
  } catch (error) {
    return gatewayError(error)
  }
}

async function refreshSessionCache(): Promise<void> {
  const token = readApiToken()
  if (!token) return
  const session = await requestApi<ApiSession>('/session', { token })
  saveApiSession(session)
}

function unauthenticated<T>(): SpaceGatewayResult<T> {
  return { ok: false, code: 'UNAUTHENTICATED', message: '请先登录' }
}

function gatewayError<T>(error: unknown): SpaceGatewayResult<T> {
  if (error instanceof TransportError) {
    return {
      ok: false,
      code: error.code,
      message: error.message,
    }
  }
  return {
    ok: false,
    code: 'UNKNOWN_ERROR',
    message: error instanceof Error ? error.message : '操作没有完成',
  }
}
