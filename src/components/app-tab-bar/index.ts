import {
  getAppTabConfig,
  resolveActiveAppTabItemId,
  subscribeAppTabConfig,
  resolveAppTabItems,
  type AppTabId,
  type AppTabItem,
} from '../../services/app-tab-config'

const appTabSubscriptions = new WeakMap<object, () => void>()

Component({
  properties: {
    active: {
      type: String,
      value: '',
    },
  },

  data: {
    items: [] as AppTabItem[],
    activeId: '',
    visualActiveId: '',
    pendingId: '',
  },

  lifetimes: {
    attached() {
      appTabSubscriptions.get(this)?.()
      appTabSubscriptions.set(this, subscribeAppTabConfig(() => {
        this.refresh()
      }))
      this.refresh()
    },
    detached() {
      appTabSubscriptions.get(this)?.()
      appTabSubscriptions.delete(this)
    },
  },

  pageLifetimes: {
    show() {
      this.refresh()
    },
    hide() {
      this.clearPending()
    },
  },

  methods: {
    refresh() {
      const items = resolveAppTabItems(getAppTabConfig())
      const pages = getCurrentPages() as Array<{
        route?: string
        options?: Record<string, string | undefined>
      }>
      const currentPage = pages[pages.length - 1]
      const activeId = resolveActiveAppTabItemId(
        items,
        currentPage?.route ?? '',
        currentPage?.options ?? {},
        (this.properties as unknown as { active?: string }).active ?? '',
      )
      this.setData({
        items,
        activeId,
        visualActiveId: activeId,
        pendingId: '',
      })
    },

    onSelect(event: {
      currentTarget: { dataset: { id?: AppTabId } }
    }) {
      const id = event.currentTarget.dataset.id
      const data = this.data as unknown as {
        activeId: string
        pendingId: string
        items: AppTabItem[]
      }
      const item = data.items.find((candidate) => candidate.id === id)
      if (!item) return
      if (data.pendingId) return

      if (id === data.activeId) {
        wx.pageScrollTo({ scrollTop: 0, duration: 0 })
        return
      }

      // 点击后立刻只保留一个选中态，避免“当前项 + 待进入项”同时高亮。
      this.setData({
        pendingId: id || '',
        visualActiveId: id || data.activeId,
      })

      // 先让选中态完成一帧绘制，再触发 reLaunch，避免点击态和新页面叠在一起。
      setTimeout(() => {
        wx.reLaunch({
          url: item.path,
          success: () => {
            if (id === this.data.pendingId) {
              this.setData({ pendingId: '' })
            }
          },
          fail: () => {
            this.setData({
              pendingId: '',
              visualActiveId: this.data.activeId,
            })
          },
        })
      }, 70)
    },

    clearPending() {
      if (this.data.pendingId) {
        this.setData({
          pendingId: '',
          visualActiveId: this.data.activeId,
        })
      }
    },
  },
})
