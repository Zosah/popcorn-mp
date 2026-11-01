import { appConfig } from '../config/env'
import { DemoAppTabGateway } from './demo-app-tab-gateway'
import { HttpAppTabGateway } from './http-app-tab'
import type { AppTabGateway, AppTabSettings } from './app-tab-gateway'

function createAppTabGateway(): AppTabGateway {
  return appConfig.demoMode
    ? new DemoAppTabGateway()
    : new HttpAppTabGateway()
}

export let appTabGateway = createAppTabGateway()

export function refreshAppTabGateway(): void {
  appTabGateway = createAppTabGateway()
}

export async function syncAppTabSettings(): Promise<AppTabSettings> {
  return appTabGateway.get()
}
