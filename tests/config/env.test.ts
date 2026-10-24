import { describe, expect, it } from 'vitest'
import { appConfig, formatVersionLabel, type AppConfig } from '../../src/config/env'

const base: AppConfig = { ...appConfig }

describe('appConfig', () => {
  it('默认处于 demo 模式，避免误连真实接口', () => {
    expect(appConfig.demoMode).toBe(true)
    expect(appConfig.apiBaseUrl).toBe('')
  })

  it('demo 模式展示 Demo 前缀版本号', () => {
    expect(formatVersionLabel({ ...base, demoMode: true, version: '1.0.0' })).toBe('Demo 1.0.0')
  })

  it('正式模式展示 v 前缀版本号', () => {
    expect(formatVersionLabel({ ...base, demoMode: false, version: '1.0.0' })).toBe('v1.0.0')
  })
})
