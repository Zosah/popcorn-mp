import {
  getAppTabSnapshot,
  saveAppTabSnapshot,
  type AppTabConfig,
} from './app-tab-config'
import {
  AppTabGatewayError,
  type AppTabGateway,
  type AppTabSettings,
} from './app-tab-gateway'

export class DemoAppTabGateway implements AppTabGateway {
  async get(): Promise<AppTabSettings> {
    return getAppTabSnapshot()
  }

  async update(
    config: AppTabConfig,
    currentVersion: number,
  ): Promise<AppTabSettings> {
    const current = getAppTabSnapshot()
    if (current.version !== currentVersion) {
      throw new AppTabGatewayError('VERSION_CONFLICT', '底栏已在别处更新')
    }
    return saveAppTabSnapshot({
      slot2: config.slot2,
      slot3: config.slot3,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    })
  }
}
