import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const APP_PAGES = JSON.parse(
  readFileSync(new URL('../src/app.json', import.meta.url), 'utf8'),
) as { pages: string[] }

const ROOT_FEATURE_PAGES = [
  'pages/home/index',
  'pages/inventory/index',
  'pages/journal/index',
  'pages/menu/index',
  'pages/pets/index',
  'pages/profile/index',
  'pages/todo/index',
  'pages/travel/index',
] as const

function readPageFile(page: string, extension: 'json' | 'ts' | 'wxml'): string {
  return readFileSync(
    new URL(`../src/${page}.${extension}`, import.meta.url),
    'utf8',
  )
}

function readPageConfig(page: string): {
  navigationStyle?: string
  navigationBarTitleText?: string
} {
  return JSON.parse(readPageFile(page, 'json')) as {
    navigationStyle?: string
    navigationBarTitleText?: string
  }
}

describe('页面导航覆盖', () => {
  it('每个一级功能都能通过底栏回到首页', () => {
    for (const page of ROOT_FEATURE_PAGES) {
      expect(APP_PAGES.pages, `${page} 未注册`).toContain(page)
      expect(
        readPageFile(page, 'wxml'),
        `${page} 缺少底栏，无法回到首页`,
      ).toContain('<app-tab-bar')
    }
  })

  it('只有真正自绘导航的页面才关闭系统返回栏', () => {
    const customNavigationPages = APP_PAGES.pages
      .filter((page) => readPageConfig(page).navigationStyle === 'custom')
      .sort()

    expect(customNavigationPages).toEqual([
      'pages/home/index',
      'pages/profile/index',
    ])
  })

  it('除首页和个人页外都使用非空的原生标题', () => {
    for (const page of APP_PAGES.pages) {
      if (page === 'pages/home/index' || page === 'pages/profile/index') continue
      const config = readPageConfig(page)
      expect(config.navigationStyle, `${page} 不应关闭原生导航`).not.toBe('custom')
      expect(config.navigationBarTitleText?.trim(), `${page} 缺少原生标题`).toBeTruthy()
    }
  })

  it('旅行页不再重复绘制顶部标题和返回按钮', () => {
    const wxml = readPageFile('pages/travel/index', 'wxml')
    expect(wxml).not.toContain('travel-topbar')
    expect(wxml).not.toContain('bindtap="onBack"')
  })
})
