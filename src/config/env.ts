/**
 * 小程序没有运行时环境变量，环境切换通过这里的编译期常量完成。
 * 正式构建（liveMode）时把 DEMO_MODE 改为 false 并填写 API_BASE_URL。
 */
export type AppEnv = 'local' | 'staging' | 'production'

export interface AppConfig {
  env: AppEnv
  /** 产品版本，与 package.json 的 version 保持一致 */
  version: string
  /** true = 使用本机 Mock 数据；false = 使用 HTTP 接口 */
  demoMode: boolean
  /** demoMode 为 false 时必填，例如 https://api.example.com */
  apiBaseUrl: string
  /** 请求超时（毫秒） */
  requestTimeoutMs: number
}

export const appConfig: AppConfig = {
  env: 'local',
  version: '1.1.0',
  demoMode: true,
  apiBaseUrl: '',
  requestTimeoutMs: 10000,
}

/** 展示用版本号，例如「Demo 1.1.0」 */
export function formatVersionLabel(config: AppConfig = appConfig): string {
  return config.demoMode ? `Demo ${config.version}` : `v${config.version}`
}
