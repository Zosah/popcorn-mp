import { appConfig } from '../config/env'
import { DemoAppTabGateway } from './demo-app-tab-gateway'
import { HttpAppTabGateway } from './http-app-tab'
import type { AppTabGateway } from './app-tab-gateway'

function createAppTabGateway(): AppTabGateway {
  return appConfig.demoMode
    ? new DemoAppTabGateway()
    : new HttpAppTabGateway()
}

export let appTabGateway = createAppTabGateway()

export function refreshAppTabGateway(): void {
  appTabGateway = createAppTabGateway()
}

export async function syncAppTabSettings(): Promise<void> {
  if (appConfig.demoMode) return
  await appTabGateway.get()
}
