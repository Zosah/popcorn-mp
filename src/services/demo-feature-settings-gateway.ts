import {
  getFeatureSettingsSnapshot,
  saveFeatureSettingsSnapshot,
  type FeatureSettingsConfig,
} from './feature-settings-config'
import {
  FeatureSettingsGatewayError,
  type FeatureSettings,
  type FeatureSettingsGateway,
} from './feature-settings-gateway'

export class DemoFeatureSettingsGateway implements FeatureSettingsGateway {
  async get(): Promise<FeatureSettings> {
    return getFeatureSettingsSnapshot()
  }

  async update(
    config: FeatureSettingsConfig,
    currentVersion: number,
  ): Promise<FeatureSettings> {
    const current = getFeatureSettingsSnapshot()
    if (current.version !== currentVersion) {
      throw new FeatureSettingsGatewayError('VERSION_CONFLICT', '功能配置已在别处更新')
    }
    return saveFeatureSettingsSnapshot({
      homeSlots: config.homeSlots,
      tabSlots: config.tabSlots,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    })
  }
}
