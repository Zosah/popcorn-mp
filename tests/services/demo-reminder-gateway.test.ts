import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DemoReminderGateway } from '../../src/services/demo-reminder-gateway'
import { resetDemoReminderSettings } from '../../src/services/demo-reminders'

describe('Demo 提醒设置网关', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
    resetDemoReminderSettings()
  })

  it('读取默认值并递增本机版本', async () => {
    const gateway = new DemoReminderGateway()
    const initial = await gateway.get()
    expect(initial).toMatchObject({
      expiry: true,
      petCare: true,
      weeklyReview: false,
      reminderTime: '20:30',
      version: 1,
    })

    const updated = await gateway.update({
      expiry: false,
      petCare: true,
      weeklyReview: true,
      reminderTime: '08:10',
    }, 1)
    expect(updated).toMatchObject({
      expiry: false,
      weeklyReview: true,
      reminderTime: '08:10',
      version: 2,
    })
    expect(await gateway.get()).toEqual(updated)
  })

  it('旧版本写入会被拒绝', async () => {
    const gateway = new DemoReminderGateway()
    await gateway.update({
      expiry: true,
      petCare: false,
      weeklyReview: false,
      reminderTime: '20:30',
    }, 1)

    await expect(gateway.update({
      expiry: false,
      petCare: true,
      weeklyReview: false,
      reminderTime: '20:30',
    }, 1)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  })

  it('Demo 模式明确返回模板未配置且不调用真实授权', async () => {
    const gateway = new DemoReminderGateway()
    await expect(gateway.getSubscription()).resolves.toMatchObject({
      configured: false,
      status: 'none',
      availableCount: 0,
    })
    await expect(gateway.recordSubscription('accept')).rejects.toMatchObject({
      code: 'SUBSCRIPTION_NOT_CONFIGURED',
    })
  })
})
