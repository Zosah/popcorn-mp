/**
 * 小程序没有运行时环境变量，环境切换通过这里的编译期常量完成。
 *
 * 本地联调真实接口：
 *   env: 'local'、demoMode: false、apiBaseUrl: 'http://127.0.0.1:8080'、apiAuthMode: 'mock'
 * 体验版/正式版：
 *   env: 'production'、demoMode: false、apiBaseUrl: 'https://popcorn-api.simiway.cc'、apiAuthMode: 'wechat'
 */
export type AppEnv = 'local' | 'staging' | 'production'
export type ApiAuthMode = 'wechat' | 'mock'

export interface AppConfig {
  env: AppEnv
  /** 产品版本，与 package.json 的 version 保持一致 */
  version: string
  /** true = 使用本机 Mock 数据；false = 使用 HTTP 接口 */
  demoMode: boolean
  /** demoMode 为 false 时必填，例如 https://api.example.com */
  apiBaseUrl: string
  /** HTTP 模式下使用真实微信登录，或仅限本地环境的模拟登录 */
  apiAuthMode: ApiAuthMode
  /** 请求超时（毫秒） */
  requestTimeoutMs: number
}

export const appConfig: AppConfig = {
  env: 'production',
  version: '1.6.3',
  demoMode: false,
  apiBaseUrl: 'https://popcorn-api.simiway.cc',
  apiAuthMode: 'wechat',
  requestTimeoutMs: 10000,
}

/** 展示用版本号，例如「Demo 1.6.0」 */
export function formatVersionLabel(config: AppConfig = appConfig): string {
  return config.demoMode ? `Demo ${config.version}` : `v${config.version}`
}
