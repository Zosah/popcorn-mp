import { appConfig } from '../config/env'
import { DemoFeatureSettingsGateway } from './demo-feature-settings-gateway'
import { HttpFeatureSettingsGateway } from './http-feature-settings'
import type {
  FeatureSettings,
  FeatureSettingsGateway,
} from './feature-settings-gateway'

function createFeatureSettingsGateway(): FeatureSettingsGateway {
  return appConfig.demoMode
    ? new DemoFeatureSettingsGateway()
    : new HttpFeatureSettingsGateway()
}

export let featureSettingsGateway = createFeatureSettingsGateway()

export function refreshFeatureSettingsGateway(): void {
  featureSettingsGateway = createFeatureSettingsGateway()
}

export async function syncFeatureSettings(): Promise<FeatureSettings> {
  return featureSettingsGateway.get()
}
