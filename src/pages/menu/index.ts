import { navigateBackOrTab } from '../../utils/demo-navigation'

interface MenuIngredient {
  id: string
  name: string
  amount: string
  source: string
  ready: boolean
}

const INGREDIENTS: MenuIngredient[] = [
  { id: 'beef', name: '牛腩', amount: '400g', source: '冰箱冷冻', ready: true },
  { id: 'tomato', name: '番茄', amount: '3 个', source: '冰箱冷藏', ready: true },
  { id: 'potato', name: '土豆', amount: '2 个', source: '需要购买', ready: false },
  { id: 'onion', name: '洋葱', amount: '半个', source: '厨房', ready: true },
]

Page({
  data: {
    servings: 2,
    ingredients: INGREDIENTS,
    readyCount: INGREDIENTS.filter((item) => item.ready).length,
  },

  onBack() {
    navigateBackOrTab('/pages/home/index')
  },

  onChangeServings(event: { currentTarget: { dataset: { delta: string } } }) {
    const delta = Number(event.currentTarget.dataset.delta)
    this.setData({ servings: Math.min(6, Math.max(1, this.data.servings + delta)) })
  },

  onToggleIngredient(event: { currentTarget: { dataset: { id: string } } }) {
    const ingredients = this.data.ingredients.map((item) =>
      item.id === event.currentTarget.dataset.id
        ? { ...item, ready: !item.ready }
        : item,
    )
    this.setData({
      ingredients,
      readyCount: ingredients.filter((item) => item.ready).length,
    })
  },

  onStartCooking() {
    const missingCount = this.data.ingredients.filter((item) => !item.ready).length
    wx.showModal({
      title: missingCount > 0 ? '还有食材没准备好' : '可以开火啦',
      content:
        missingCount > 0
          ? `还有 ${missingCount} 样食材待准备，Demo 中可以点选食材更新状态。`
          : '食材已经齐了，真实版本会在这里进入分步烹饪模式。',
      showCancel: false,
      confirmText: '知道了',
    })
  },
})
