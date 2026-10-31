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
  avatarMediaId?: string
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
  avatarMediaId?: string
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
    avatarMediaId?: string
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
  avatarMediaId?: string
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

export type ApiJournalKind = 'moment' | 'note'
export type ApiJournalVisibility = 'space' | 'private'
export type ApiNoteCategory = 'home' | 'health' | 'pet' | 'other'

export interface ApiJournalItem {
  id: string
  spaceId: string
  kind: ApiJournalKind
  title: string
  content: string
  category: ApiNoteCategory | ''
  visibility: ApiJournalVisibility
  imageMediaId: string
  imageCaption: string
  version: number
  createdBy: string
  authorName: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiJournalWriteRequest {
  kind: ApiJournalKind
  title: string
  content: string
  category: ApiNoteCategory | ''
  visibility: ApiJournalVisibility
  imageMediaId: string
  imageCaption: string
}

export type ApiMediaPurpose = 'journal' | 'avatar' | 'inventory' | 'menu' | 'other'

export interface ApiSignedObject {
  url: string
  expiresAt: string
}

export interface ApiMediaAsset {
  id: string
  spaceId: string
  purpose: ApiMediaPurpose
  width: number
  height: number
  createdAt: string
  display: ApiSignedObject
  thumb: ApiSignedObject
}

export interface ApiJournalList {
  items: ApiJournalItem[]
  nextCursor: string
}

export interface ApiJournalSummary {
  total: number
  moments: number
  notes: number
  private: number
}

export interface ApiMenuIngredient {
  id: string
  name: string
  amount: string
  source: string
  ready: boolean
  sortOrder: number
}

export interface ApiMenuStep {
  id: string
  title: string
  description: string
  sortOrder: number
}

export interface ApiMenuIngredientWriteRequest {
  id?: string
  name: string
  amount?: string
  source?: string
}

export interface ApiMenuStepWriteRequest {
  id?: string
  title?: string
  description?: string
}

export interface ApiMenuWriteRequest {
  title: string
  description: string
  servings: number
  cookingMinutes: number
  imageMediaId: string
  ingredients: ApiMenuIngredientWriteRequest[]
  steps: ApiMenuStepWriteRequest[]
}

export interface ApiMenuRecipe {
  id: string
  spaceId: string
  title: string
  description: string
  servings: number
  cookingMinutes: number
  imageMediaId: string
  ingredients: ApiMenuIngredient[]
  steps: ApiMenuStep[]
  version: number
  createdBy: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiMenuRecipeList {
  items: ApiMenuRecipe[]
  nextCursor: string
}

export interface ApiPetEvent {
  id: string
  petId: string
  type: string
  occurredOn: string
  title: string
  note: string
  provider: string
  cost: string
  nextOn: string
  recurrenceDays: number
  version: number
  createdBy: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiPetWeight {
  id: string
  petId: string
  value: string
  recordedOn: string
  createdBy: string
  createdAt: string
}

export interface ApiPetDailyLog {
  id: string
  petId: string
  type: string
  summary: string
  note: string
  recordedAt: string
  createdBy: string
  createdAt: string
}

export interface ApiPetSupply {
  id: string
  petId: string
  category: string
  name: string
  status: string
  note: string
  recordedOn: string
  version: number
  createdBy: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface ApiPet {
  id: string
  spaceId: string
  name: string
  species: string
  breed: string
  sex: string
  birthday: string
  homeOn: string
  neuteredOn: string
  status: string
  avatarMediaId: string
  version: number
  createdBy: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
  events: ApiPetEvent[]
  weights: ApiPetWeight[]
  dailyLogs: ApiPetDailyLog[]
  supplies: ApiPetSupply[]
}

export interface ApiPetList {
  items: ApiPet[]
}

export interface ApiPetProfileWriteRequest {
  name: string
  species: string
  breed: string
  sex: string
  birthday: string
  homeOn: string
  neuteredOn: string
  status: string
  avatarMediaId: string
}

export interface ApiPetEventWriteRequest {
  type: string
  occurredOn: string
  title: string
  note: string
  provider: string
  cost: string
  nextOn: string | null
  recurrenceDays: number
}

export interface ApiPetWeightWriteRequest {
  value: string
  recordedOn: string
}

export interface ApiPetDailyLogWriteRequest {
  type: string
  summary: string
  note: string
  recordedAt: string
}

export interface ApiPetSupplyWriteRequest {
  category: string
  name: string
  status: string
  note: string
  recordedOn: string
}

export interface ApiAppTabSettings {
  slot2: string
  slot3: string
  version: number
  updatedAt: string
}

export interface ApiAppTabSettingsUpdateRequest {
  slot2: string
  slot3: string
}

export interface ApiReminderSettings {
  expiry: boolean
  petCare: boolean
  weeklyReview: boolean
  reminderTime: string
  version: number
  updatedAt: string
}

export interface ApiReminderSettingsUpdateRequest {
  expiry: boolean
  petCare: boolean
  weeklyReview: boolean
  reminderTime: string
}

export type ApiReminderSubscriptionStatus = 'none' | 'accept' | 'reject' | 'ban' | 'filter'

export interface ApiReminderSubscription {
  configured: boolean
  templateId: string
  page: string
  status: ApiReminderSubscriptionStatus
  availableCount: number
  lastStatusAt: string | null
  lastAcceptedAt: string | null
}

export interface ApiReminderSubscriptionWriteRequest {
  status: Exclude<ApiReminderSubscriptionStatus, 'none'>
}
