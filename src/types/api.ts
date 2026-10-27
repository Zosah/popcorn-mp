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

export type ApiInventoryCategory =
  | 'food'
  | 'drink'
  | 'frozen'
  | 'seasoning'
  | 'daily'
  | 'medicine'
  | 'pet'
  | 'other'

export type ApiInventoryLocation =
  | 'fridge'
  | 'freezer'
  | 'kitchen'
  | 'living-room'
  | 'bathroom'
  | 'storage'
  | 'other'

export type ApiInventoryLifecycleStatus =
  | 'active'
  | 'consumed'
  | 'discarded'
  | 'archived'

export type ApiExpiryStatus =
  | 'expired'
  | 'today'
  | 'urgent'
  | 'soon'
  | 'normal'
  | 'none'

export interface ApiInventoryItem {
  id: string
  spaceId: string
  name: string
  category: ApiInventoryCategory
  quantity: string
  unit: string
  location: ApiInventoryLocation
  purchasedOn: string | null
  openedOn: string | null
  expiresOn: string | null
  note: string
  status: ApiInventoryLifecycleStatus
  version: number
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiInventoryItemInput {
  name: string
  category: ApiInventoryCategory
  quantity: string
  unit: string
  location: ApiInventoryLocation
  purchasedOn: string | null
  openedOn: string | null
  expiresOn: string | null
  note: string
}

export interface ApiInventoryItemList {
  items: ApiInventoryItem[]
  nextCursor: string
}

export interface ApiInventorySummary {
  total: number
  expired: number
  today: number
  urgent: number
  soon: number
  normal: number
  none: number
  dueWithin3Days: number
}

export type ApiTodoKind = 'travel' | 'plan' | 'fitness' | 'meal' | 'expense'
export type ApiTodoStatus = 'all' | 'pending' | 'completed'
export type ApiMealType = 'breakfast' | 'lunch' | 'dinner' | 'snack'

export interface ApiTodoChecklistItem {
  id: string
  text: string
  done: boolean
  sortOrder: number
}

export interface ApiTodoChecklistItemInput {
  id?: string
  text: string
  done: boolean
}

export interface ApiTodoItem {
  id: string
  spaceId: string
  kind: ApiTodoKind
  title: string
  note: string
  done: boolean
  dueDate: string | null
  destination: string
  checklist: ApiTodoChecklistItem[]
  exercise: string
  durationMinutes: number
  calories: number
  mealType: string
  amount: string
  merchant: string
  version: number
  createdBy: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiTodoWriteRequest {
  kind: ApiTodoKind
  title: string
  note?: string
  dueDate?: string | null
  destination?: string
  checklist?: ApiTodoChecklistItemInput[]
  exercise?: string
  durationMinutes?: number
  calories?: number
  mealType?: ApiMealType
  amount?: string
  merchant?: string
}

export interface ApiTodoList {
  items: ApiTodoItem[]
  nextCursor: string
}

export interface ApiTodoSummary {
  total: number
  pending: number
  completed: number
  pendingByKind: Record<ApiTodoKind, number>
}
