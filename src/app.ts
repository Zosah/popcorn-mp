import { appConfig } from './config/env'
import { syncFeatureSettings } from './services/feature-settings'

App({
  onLaunch() {
    void syncFeatureSettings().catch(() => {
      // 首页和底栏已有本机缓存；后台同步失败不阻塞启动。
    })
  },

  globalData: {
    demoMode: appConfig.demoMode,
    version: appConfig.version,
  },
})
