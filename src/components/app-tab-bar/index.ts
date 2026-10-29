import {
  getAppTabConfig,
  resolveActiveAppTabItemId,
  resolveAppTabItems,
  type AppTabId,
  type AppTabItem,
} from '../../services/app-tab-config'
import { openAppRoot } from '../../utils/app-navigation'

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
    pendingId: '',
  },

  lifetimes: {
    attached() {
      this.refresh()
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
      this.setData({
        items,
        pendingId: '',
        activeId: resolveActiveAppTabItemId(
          items,
          currentPage?.route ?? '',
          currentPage?.options ?? {},
          (this.properties as unknown as { active?: string }).active ?? '',
        ),
      })
    },

    onSelect(event: {
      currentTarget: { dataset: { id?: AppTabId } }
    }) {
      const id = event.currentTarget.dataset.id
      const data = this.data as unknown as {
        pendingId: string
        items: AppTabItem[]
      }
      const item = data.items.find((candidate) => candidate.id === id)
      if (!item) return
      // 切页动画期间锁住整个底栏，避免连续点击触发重复导航。
      if (data.pendingId) return
      this.setData({ pendingId: id || '' }, () => {
        openAppRoot(item.path, () => {
          if (id === this.data.pendingId) {
            this.setData({ pendingId: '' })
          }
        })
      })
    },

    clearPending() {
      if (this.data.pendingId) this.setData({ pendingId: '' })
    },
  },
})
