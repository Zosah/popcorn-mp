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

  it('根页面之间使用替换式导航，不把旧页面留在栈里', () => {
    expect(
      resolveAppRootNavigation(
        [
          { route: 'pages/home/index', options: {} },
          { route: 'pages/pets/index', options: {} },
          { route: 'pages/journal/index', options: {} },
        ],
        '/pages/pets/index',
      ),
    ).toEqual({ action: 'relaunch', url: '/pages/pets/index' })
  })

  it('首次切换根页面同样不压入页面栈', () => {
    expect(
      resolveAppRootNavigation(
        [{ route: 'pages/home/index', options: {} }],
        '/pages/todo/index?kind=travel',
      ),
    ).toEqual({
      action: 'relaunch',
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
      action: 'relaunch',
      url: '/pages/pets/index?section=daily',
    })
  })

  it('缺少前导斜杠时自动补齐路径', () => {
    expect(
      resolveAppRootNavigation(
        [{ route: 'pages/home/index', options: {} }],
        'pages/menu/index',
      ),
    ).toEqual({ action: 'relaunch', url: '/pages/menu/index' })
  })
})
