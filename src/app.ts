import { appConfig } from './config/env'
import { syncFeatureSettings } from './services/feature-settings'
import { clearPageCache } from './services/page-cache'

function applyAvailableUpdate(): void {
  try {
    const updateManager = wx.getUpdateManager()
    updateManager.onUpdateReady(() => updateManager.applyUpdate())
  } catch {
    // 旧基础库或开发者工具不支持更新管理器时，按正常冷启动流程继续。
  }
}

App({
  onLaunch() {
    clearPageCache()
    applyAvailableUpdate()
    void syncFeatureSettings().catch(() => {
      // 首页和底栏已有本机缓存；后台同步失败不阻塞启动。
    })
  },

  globalData: {
    demoMode: appConfig.demoMode,
    version: appConfig.version,
  },
})
