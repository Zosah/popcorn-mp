import { describe, expect, it, vi } from 'vitest'

import { syncDemoTabBar } from '../../src/utils/demo-tab-bar'

describe('syncDemoTabBar', () => {
  it('把当前页面索引同步给自定义 TabBar', () => {
    const setData = vi.fn()

    syncDemoTabBar({ getTabBar: () => ({ setData }) }, 2)

    expect(setData).toHaveBeenCalledWith({ selected: 2 })
  })

  it('页面尚未取得 TabBar 实例时安全跳过', () => {
    expect(() => syncDemoTabBar({}, 0)).not.toThrow()
    expect(() => syncDemoTabBar({ getTabBar: () => null }, 0)).not.toThrow()
  })
})
