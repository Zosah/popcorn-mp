import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getAppTabConfig,
  getAppTabOption,
  normalizeAppTabConfig,
  resolveActiveAppTabItemId,
  resolveAppTabItems,
  saveAppTabConfig,
} from '../../src/services/app-tab-config'

const storage = new Map<string, unknown>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('wx', {
    getStorageSync: vi.fn((key: string) => storage.get(key) ?? ''),
    setStorageSync: vi.fn((key: string, value: unknown) => {
      storage.set(key, value)
    }),
  })
})

describe('底部导航配置', () => {
  it('默认展示 家 / 宠物 / 记录 / 我的', () => {
    expect(getAppTabConfig('user-a')).toEqual({
      slot2: 'pets',
      slot3: 'journal',
    })
    expect(
      resolveAppTabItems({ slot2: 'pets', slot3: 'journal' }).map(
        (item) => item.label,
      ),
    ).toEqual(['家', '宠物', '记录', '我的'])
  })

  it('按账号分别保存自定义入口', () => {
    saveAppTabConfig({ slot2: 'todo', slot3: 'menu' }, 'user-a')

    expect(getAppTabConfig('user-a')).toEqual({
      slot2: 'todo',
      slot3: 'menu',
    })
    expect(getAppTabConfig('user-b')).toEqual({
      slot2: 'pets',
      slot3: 'journal',
    })
  })

  it('拒绝重复和未知位置，并自动补成两个不同入口', () => {
    expect(
      normalizeAppTabConfig({ slot2: 'menu', slot3: 'menu' }),
    ).toEqual({ slot2: 'menu', slot3: 'journal' })
    expect(
      normalizeAppTabConfig({ slot2: 'unknown', slot3: 'todo' }),
    ).toEqual({ slot2: 'pets', slot3: 'todo' })
  })
})

describe('自定义底栏二级功能', () => {
  it('可以直接跳转到宠物照护和旅行准备', () => {
    expect(getAppTabOption('pet-care')).toMatchObject({
      label: '照护',
      path: '/pages/pets/index?section=care',
      parentId: 'pets',
    })
    expect(getAppTabOption('travel')).toMatchObject({
      label: '旅行',
      path: '/pages/todo/index?kind=travel',
      parentId: 'todo',
    })
  })

  it('按当前页面与查询参数高亮准确的自定义入口', () => {
    const items = resolveAppTabItems({
      slot2: 'travel',
      slot3: 'pet-care',
    })

    expect(
      resolveActiveAppTabItemId(
        items,
        'pages/todo/index',
        { kind: 'travel' },
        'todo',
      ),
    ).toBe('travel')
    expect(
      resolveActiveAppTabItemId(
        items,
        'pages/pets/index',
        { section: 'care' },
        'pets',
      ),
    ).toBe('pet-care')
  })
})
