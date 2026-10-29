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
        active: string
        items: AppTabItem[]
      }
      const item = data.items.find((candidate) => candidate.id === id)
      if (!item) return
      openAppRoot(item.path)
    },
  },
})
