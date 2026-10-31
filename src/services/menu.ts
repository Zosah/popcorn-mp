import { appConfig } from '../config/env'
import { DemoMenuGateway } from './demo-menu-gateway'
import { HttpMenuGateway } from './http-menu'
import type { MenuGateway } from './menu-gateway'

function createMenuGateway(): MenuGateway {
  return appConfig.demoMode
    ? new DemoMenuGateway()
    : new HttpMenuGateway()
}

export let menuGateway = createMenuGateway()

export function refreshMenuGateway(): void {
  menuGateway = createMenuGateway()
}
