/**
 * 统一的下拉刷新外观：页面只需实现 onPullRefreshTask()，由 behavior 负责
 * 打开品牌托盘、等待任务结束、关闭系统刷新并收起托盘。
 */
export const pullRefreshBehavior = Behavior({
  data: {
    pullRefreshing: false,
  },
  methods: {
    onPullDownRefresh() {
      const task = (this as unknown as { onPullRefreshTask?: () => unknown }).onPullRefreshTask
      this.setData({ pullRefreshing: true })
      Promise.resolve(task ? task.call(this) : undefined)
        .catch(() => undefined)
        .then(() => {
          this.setData({ pullRefreshing: false })
          wx.stopPullDownRefresh()
        })
    },
  },
})
