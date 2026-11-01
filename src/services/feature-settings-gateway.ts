import type { FeatureSettingsConfig } from './feature-settings-config'

export interface FeatureSettings extends FeatureSettingsConfig {
  version: number
  updatedAt: string
}

export interface FeatureSettingsGateway {
  get(): Promise<FeatureSettings>
  update(
    config: FeatureSettingsConfig,
    currentVersion: number,
  ): Promise<FeatureSettings>
}

export class FeatureSettingsGatewayError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'FeatureSettingsGatewayError'
  }
}

export function isFeatureSettingsVersionConflict(error: unknown): boolean {
  return error instanceof FeatureSettingsGatewayError && error.code === 'VERSION_CONFLICT'
}

export function getFeatureSettingsErrorMessage(error: unknown, fallback: string): string {
  if (!(error instanceof FeatureSettingsGatewayError)) return fallback
  switch (error.code) {
    case 'UNAUTHENTICATED':
      return '登录已失效，请重新登录'
    case 'NO_ACTIVE_SPACE':
      return '还没有可用的共同空间'
    case 'VERSION_CONFLICT':
      return '功能配置已在别处更新，已为你载入最新版本'
    case 'NETWORK_ERROR':
      return '网络不太稳定，请稍后再试'
    case 'NOT_FOUND':
      return '当前空间不可用，或设置记录已经不存在'
    case 'VALIDATION_FAILED':
    case 'PRECONDITION_REQUIRED':
      return error.message || '快捷入口还需要检查一下'
    default:
      return error.message || fallback
  }
}
