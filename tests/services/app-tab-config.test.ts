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
  it('默认展示 家 / 下厨 / 账单 / 健身 / 我的', () => {
    expect(getAppTabConfig('user-a')).toEqual({
      slot2: 'menu',
      slot3: 'expense',
      slot4: 'fitness',
    })
    expect(
      resolveAppTabItems({ slot2: 'menu', slot3: 'expense', slot4: 'fitness' }).map(
        (item) => item.label,
      ),
    ).toEqual(['家', '下厨', '账单', '健身', '我的'])
  })

  it('拒绝把已占用在首页的功能重复放进底栏', () => {
    saveAppTabConfig({ slot2: 'travel', slot3: 'menu', slot4: 'expense' }, 'user-a')

    expect(getAppTabConfig('user-a')).toEqual({
      slot2: 'menu',
      slot3: 'expense',
      slot4: 'fitness',
    })
    expect(getAppTabConfig('user-b')).toEqual({
      slot2: 'menu',
      slot3: 'expense',
      slot4: 'fitness',
    })
  })

  it('拒绝重复和未知位置，并自动补成三个不同入口', () => {
    expect(
      normalizeAppTabConfig({ slot2: 'menu', slot3: 'menu', slot4: 'travel' }),
    ).toEqual({ slot2: 'menu', slot3: 'expense', slot4: 'travel' })
    expect(
      normalizeAppTabConfig({ slot2: 'unknown', slot3: 'todo', slot4: 'todo' }),
    ).toEqual({ slot2: 'menu', slot3: 'todo', slot4: 'fitness' })
  })

  it('底栏使用首页默认功能时仍完整保留三个入口', () => {
    expect(
      normalizeAppTabConfig({ slot2: 'fitness', slot3: 'menu', slot4: 'pets' }),
    ).toEqual({ slot2: 'fitness', slot3: 'menu', slot4: 'pets' })
    expect(
      resolveAppTabItems({ slot2: 'fitness', slot3: 'menu', slot4: 'pets' })
        .map((item) => item.id),
    ).toEqual(['home', 'fitness', 'menu', 'pets', 'profile'])
  })
})

describe('自定义底栏二级功能', () => {
  it('可以直接跳转到旅行与健身等一级功能', () => {
    expect(getAppTabOption('travel')).toMatchObject({
      label: '旅行',
      path: '/pages/travel/index',
      parentId: 'travel',
    })
    expect(getAppTabOption('fitness')).toMatchObject({
      label: '健身',
      path: '/pages/todo/index?kind=fitness',
      parentId: 'fitness',
    })
  })

  it('按当前页面与查询参数高亮准确的自定义入口', () => {
    const items = resolveAppTabItems({
      slot2: 'travel',
      slot3: 'expense',
      slot4: 'menu',
    })

    expect(
      resolveActiveAppTabItemId(
        items,
        'pages/travel/index',
        {},
        'travel',
      ),
    ).toBe('travel')
    expect(
      resolveActiveAppTabItemId(
        items,
        'pages/travel/index',
        {},
        'travel',
      ),
    ).toBe('travel')
  })

  it('根页面不会被同一个二级功能错误高亮', () => {
    const items = resolveAppTabItems({
      slot2: 'menu',
      slot3: 'expense',
      slot4: 'travel',
    })

    expect(
      resolveActiveAppTabItemId(items, 'pages/todo/index', {}, 'todo'),
    ).toBe('')

    expect(
      resolveActiveAppTabItemId(items, 'pages/todo/index', { kind: 'expense' }, 'todo'),
    ).toBe('expense')
  })
})
