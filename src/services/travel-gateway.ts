export interface TravelTripItem {
  id: string
  name: string
  packed: boolean
  sortOrder: number
  templateItemId: string
  createdAt: string
  updatedAt: string
}

export interface TravelTrip {
  id: string
  spaceId: string
  title: string
  destination: string
  departAt: string
  returnAt: string
  days: number
  nights: number
  note: string
  items: TravelTripItem[]
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TravelTripWriteInput {
  title: string
  destination: string
  departAt: string
  returnAt: string
  note: string
  items: Array<{ name: string; packed: boolean }>
}

export interface TravelTripItemWriteInput {
  name: string
  packed: boolean
}

export interface TravelTemplateItem {
  id: string
  name: string
  sortOrder: number
  createdAt: string
  updatedAt: string
}

export interface TravelTemplate {
  id: string
  spaceId: string
  title: string
  isDefault: boolean
  items: TravelTemplateItem[]
  version: number
  createdBy: string
  createdAt: string
  updatedAt: string
}

export interface TravelTemplateWriteInput {
  title: string
  isDefault: boolean
  items: Array<{ name: string }>
}

export interface TravelGateway {
  listTrips(): Promise<TravelTrip[]>
  getTrip(id: string): Promise<TravelTrip | null>
  createTrip(input: TravelTripWriteInput): Promise<TravelTrip>
  updateTrip(
    id: string,
    input: TravelTripWriteInput,
    currentVersion: number,
  ): Promise<TravelTrip>
  removeTrip(id: string, currentVersion: number): Promise<void>
  addTripItem(
    tripId: string,
    input: TravelTripItemWriteInput,
    currentVersion: number,
  ): Promise<TravelTrip>
  updateTripItem(
    tripId: string,
    itemId: string,
    input: TravelTripItemWriteInput,
    currentVersion: number,
  ): Promise<TravelTrip>
  removeTripItem(
    tripId: string,
    itemId: string,
    currentVersion: number,
  ): Promise<TravelTrip>
  importTemplate(
    tripId: string,
    templateId: string,
    currentVersion: number,
  ): Promise<TravelTrip>

  listTemplates(): Promise<TravelTemplate[]>
  getTemplate(id: string): Promise<TravelTemplate | null>
  createTemplate(input: TravelTemplateWriteInput): Promise<TravelTemplate>
  updateTemplate(
    id: string,
    input: TravelTemplateWriteInput,
    currentVersion: number,
  ): Promise<TravelTemplate>
  removeTemplate(id: string, currentVersion: number): Promise<void>
}

export class TravelGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'TravelGatewayError'
  }
}

export function isTravelVersionConflict(error: unknown): boolean {
  return error instanceof TravelGatewayError && error.code === 'VERSION_CONFLICT'
}

export function isTravelNotFound(error: unknown): boolean {
  return error instanceof TravelGatewayError && (
    error.code === 'NOT_FOUND' || error.code === 'TEMPLATE_NOT_FOUND'
  )
}

export function getTravelErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof TravelGatewayError)) return fallback
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已失效，请重新登录'
    case 'NO_ACTIVE_SPACE':
      return '还没有可用的共同空间'
    case 'VERSION_CONFLICT':
      return '行程已在别处更新，请刷新后再试'
    case 'NETWORK_ERROR':
      return '网络不太稳定，请稍后再试'
    case 'NOT_FOUND':
      return '这次出行已经不存在'
    case 'ITEM_NOT_FOUND':
      return '这件物品已经不存在'
    case 'TEMPLATE_NOT_FOUND':
      return '这份必备清单已经不存在'
    case 'VALIDATION_FAILED':
      return error.message || '还需要检查一下填写内容'
    default:
      return error.message || fallback
  }
}
