interface DemoTabBarInstance {
  setData(data: { selected: number }): void
}

interface DemoTabPage {
  getTabBar?: () => DemoTabBarInstance | null | undefined
}

/**
 * 页面显示时显式同步自定义 TabBar，避免不同 Tab 的组件实例保留旧选中态。
 */
export function syncDemoTabBar(page: DemoTabPage, selected: number): void {
  const tabBar = page.getTabBar?.()
  if (tabBar) tabBar.setData({ selected })
}
