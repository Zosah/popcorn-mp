import { describe, expect, it } from 'vitest'
import { appConfig, formatVersionLabel, type AppConfig } from '../../src/config/env'

const base: AppConfig = { ...appConfig }

describe('appConfig', () => {
  it('默认连接生产 HTTPS 接口并使用微信登录', () => {
    expect(appConfig.env).toBe('production')
    expect(appConfig.demoMode).toBe(false)
    expect(appConfig.apiBaseUrl).toBe('https://popcorn-api.simiway.cc')
    expect(appConfig.apiAuthMode).toBe('wechat')
  })

  it('demo 模式展示 Demo 前缀版本号', () => {
    expect(formatVersionLabel({ ...base, demoMode: true, version: '1.0.0' })).toBe('Demo 1.0.0')
  })

  it('正式模式展示 v 前缀版本号', () => {
    expect(formatVersionLabel({ ...base, demoMode: false, version: '1.0.0' })).toBe('v1.0.0')
  })
})
