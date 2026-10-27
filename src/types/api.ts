export type ApiAvatarTone = 'lavender' | 'mint' | 'peach' | 'sun'

export interface ApiFieldError {
  field: string
  message: string
}

export interface ApiErrorBody {
  code?: string
  message?: string
  fields?: ApiFieldError[]
  requestId?: string
}

export interface ApiUser {
  id: string
  nickname: string
  avatarTone: ApiAvatarTone
  createdAt: string
  onboardingRequired: boolean
}

export interface ApiSpace {
  id: string
  name: string
  type: 'family' | 'couple' | 'pet' | 'circle'
  role: 'owner' | 'member'
  createdAt: string
}

export interface ApiSession {
  user: ApiUser
  spaces: ApiSpace[]
  activeSpaceId: string
  expiresAt: string
  onboardingRequired: boolean
}

export interface ApiLoginResponse extends ApiSession {
  token: string
}

export interface ApiSpaceList {
  items: ApiSpace[]
}

export interface ApiSpaceDetail extends ApiSpace {
  ownerId: string
  timezone: string
  updatedAt: string
}

export interface ApiSpaceMember {
  userId: string
  nickname: string
  avatarTone: ApiAvatarTone
  role: 'owner' | 'member'
  joinedAt: string
}

export interface ApiSpaceMemberList {
  items: ApiSpaceMember[]
}

export interface ApiCreatedInvite {
  code: string
  spaceId: string
  expiresAt: string
}

export interface ApiInvitePreview {
  status: 'available'
  space: {
    id: string
    name: string
    type: ApiSpace['type']
  }
  inviter: {
    userId: string
    nickname: string
    avatarTone: ApiAvatarTone
  }
  expiresAt: string
}

export interface RenameSpaceRequest {
  name: string
}

export interface LoginRequest {
  code: string
  deviceLabel: string
}

export interface MockLoginRequest {
  identity: string
  deviceLabel: string
}

export interface ProfileUpdateRequest {
  nickname: string
  avatarTone: ApiAvatarTone
}
