import { appConfig } from './config/env'

App({
  globalData: {
    demoMode: appConfig.demoMode,
    version: appConfig.version,
  },
})
