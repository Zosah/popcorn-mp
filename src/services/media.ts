import { appConfig } from '../config/env'
import { DemoMediaGateway } from './demo-media'
import { HttpMediaGateway } from './http-media'
import type { MediaGateway } from './media-gateway'

function createMediaGateway(): MediaGateway {
  return appConfig.demoMode
    ? new DemoMediaGateway()
    : new HttpMediaGateway()
}

export let mediaGateway = createMediaGateway()

export function refreshMediaGateway(): void {
  mediaGateway = createMediaGateway()
}
