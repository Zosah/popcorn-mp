import { formatVersionLabel } from '../../config/env'
import { resetAllDemoData } from '../../services/demo-reset'
import { getDemoSpaceName } from '../../services/demo-space'
import { listDemoTodoItems } from '../../services/demo-todo'
import { syncDemoTabBar } from '../../utils/demo-tab-bar'

Page({
  data: {
    version: formatVersionLabel(),
    spaceName: '我们的家',
    todoPendingCount: 0,
    todoSummary: '旅行准备、计划、健身、吃什么和账单',
  },

  onShow() {
    syncDemoTabBar(this, 3)
    const items = listDemoTodoItems()
    const pendingCount = items.filter((item) => !item.done).length
    const travelCount = items.filter(
      (item) => item.kind === 'travel' && !item.done,
    ).length
    const summary = pendingCount
      ? `${pendingCount} 件未完成${travelCount ? ` · ${travelCount} 个旅行准备` : ''}`
      : '目前都做完了，可以再记一件'
    this.setData({
      spaceName: getDemoSpaceName(),
      todoPendingCount: pendingCount,
      todoSummary: summary,
    })
  },

  onOpenSpace() {
    wx.navigateTo({ url: '/pages/space/index' })
  },

  onOpenTodo() {
    wx.navigateTo({ url: '/pages/todo/index' })
  },

  onOpenReminders() {
    wx.navigateTo({ url: '/pages/reminder-settings/index' })
  },

  onOpenInvite() {
    wx.navigateTo({ url: '/pages/invite/index' })
  },

  onResetDemo() {
    wx.showModal({
      title: '恢复 Demo 初始数据？',
      content: '库存、宠物、生活记录、菜单、待办、提醒和空间设置都会恢复成初始示例。',
      confirmText: '重置',
      confirmColor: '#e8695c',
      success: (result) => {
        if (!result.confirm) return
        resetAllDemoData()
        this.setData({ spaceName: getDemoSpaceName() })
        this.onShow()
        wx.showToast({ title: 'Demo 已恢复', icon: 'success' })
      },
    })
  },
})
