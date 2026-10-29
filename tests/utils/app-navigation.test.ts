import { describe, expect, it } from 'vitest'

import { resolveAppRootNavigation } from '../../src/utils/app-navigation'

describe('自定义底栏根页面导航', () => {
  it('当前页与目标一致时只回到顶部', () => {
    expect(
      resolveAppRootNavigation(
        [{ route: 'pages/home/index', options: {} }],
        '/pages/home/index',
      ),
    ).toEqual({ action: 'scroll-top' })
  })

  it('页面已缓存时直接返回，避免销毁重建', () => {
    expect(
      resolveAppRootNavigation(
        [
          { route: 'pages/home/index', options: {} },
          { route: 'pages/pets/index', options: {} },
          { route: 'pages/journal/index', options: {} },
        ],
        '/pages/pets/index',
      ),
    ).toEqual({ action: 'back', delta: 1 })
  })

  it('首次进入使用 navigateTo 保留页面实例', () => {
    expect(
      resolveAppRootNavigation(
        [{ route: 'pages/home/index', options: {} }],
        '/pages/todo/index?kind=travel',
      ),
    ).toEqual({
      action: 'open',
      method: 'navigateTo',
      url: '/pages/todo/index?kind=travel',
    })
  })

  it('区分同一页面下的不同二级视图', () => {
    expect(
      resolveAppRootNavigation(
        [{ route: 'pages/pets/index', options: { section: 'care' } }],
        '/pages/pets/index?section=daily',
      ),
    ).toEqual({
      action: 'open',
      method: 'navigateTo',
      url: '/pages/pets/index?section=daily',
    })
  })

  it('页面栈接近上限时改为替换当前页', () => {
    const pages = Array.from({ length: 8 }, (_, index) => ({
      route: `pages/cache-${index}/index`,
      options: {},
    }))
    expect(
      resolveAppRootNavigation(pages, '/pages/menu/index'),
    ).toEqual({
      action: 'open',
      method: 'redirectTo',
      url: '/pages/menu/index',
    })
  })
})
