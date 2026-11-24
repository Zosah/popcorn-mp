/**
 * 全局轻提示：不带图标、单行展示，文字太长时自动缩字号而不是换行。
 * 页面只需在 json 里注册 app-toast，并混入 appToastBehavior。
 */
/** 页面外调用入口：拿到当前页并触发轻提示。 */
export function showToast(page: unknown, text: string, duration = 1800): void {
  const target = page as { showToast?: (value: string, ms?: number) => void }
  if (target && typeof target.showToast === 'function') {
    target.showToast(text, duration)
    return
  }
  wx.showToast({ title: text, icon: 'none' })
}

export const appToastBehavior = Behavior({
  data: {
    appToastVisible: false,
    appToastText: '',
  },

  methods: {
    showToast(text: string, duration = 1800) {
      if (!text) return
      const timer = (this as unknown as { __toastTimer?: number }).__toastTimer
      if (timer) clearTimeout(timer)
      this.setData({ appToastVisible: true, appToastText: text })
      const next = setTimeout(() => {
        this.setData({ appToastVisible: false })
      }, duration)
      ;(this as unknown as { __toastTimer?: number }).__toastTimer = next as unknown as number
    },
  },
})
