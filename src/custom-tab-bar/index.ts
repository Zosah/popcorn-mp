const tabs = [
  { pagePath: '/pages/home/index', label: '家', icon: 'house' },
  { pagePath: '/pages/inventory/index', label: '库存', icon: 'package' },
  { pagePath: '/pages/journal/index', label: '记录', icon: 'notebook-tabs' },
  { pagePath: '/pages/profile/index', label: '我的', icon: 'user-round' },
]

Component({
  data: {
    selected: 0,
    tabs,
  },

  pageLifetimes: {
    show() {
      const pages = getCurrentPages()
      const currentPage = pages[pages.length - 1]
      const currentPath = currentPage ? `/${currentPage.route}` : ''
      const selected = tabs.findIndex((tab) => tab.pagePath === currentPath)
      if (selected >= 0) {
        this.setData({ selected })
      }
    },
  },

  methods: {
    onSwitchTab(event: WechatMiniprogram.TouchEvent) {
      const index = Number(event.currentTarget.dataset.index)
      const tab = tabs[index]
      if (!tab || index === this.data.selected) {
        return
      }
      const previous = this.data.selected
      this.setData({ selected: index })
      wx.switchTab({
        url: tab.pagePath,
        fail: () => this.setData({ selected: previous }),
      })
    },
  },
})
