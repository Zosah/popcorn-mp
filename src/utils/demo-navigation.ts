import {
  resolveDemoBackIntent,
  type DemoTabPath,
} from '../domain/demo-interactions'
import { openAppRoot } from './app-navigation'

export function navigateBackOrTab(fallbackTab: DemoTabPath): void {
  const intent = resolveDemoBackIntent(getCurrentPages().length, fallbackTab)
  if (intent.method === 'navigateBack') {
    wx.navigateBack({ delta: intent.delta })
    return
  }
  openAppRoot(intent.url)
}
