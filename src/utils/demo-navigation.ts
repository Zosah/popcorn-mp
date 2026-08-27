import {
  resolveDemoBackIntent,
  type DemoTabPath,
} from '../domain/demo-interactions'

export function navigateBackOrTab(fallbackTab: DemoTabPath): void {
  const intent = resolveDemoBackIntent(getCurrentPages().length, fallbackTab)
  if (intent.method === 'navigateBack') {
    wx.navigateBack({ delta: intent.delta })
    return
  }
  wx.switchTab({ url: intent.url })
}
