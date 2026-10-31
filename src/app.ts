import { appConfig } from './config/env'
import { syncAppTabSettings } from './services/app-tab-settings'

App({
  onLaunch() {
    void syncAppTabSettings().catch(() => {
      // 底栏已有本机缓存；后台同步失败不阻塞启动。
    })
  },

  globalData: {
    demoMode: appConfig.demoMode,
    version: appConfig.version,
  },
})
