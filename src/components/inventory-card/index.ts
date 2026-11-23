interface InventoryCardItem {
  id?: string
}

Component({
  properties: {
    item: {
      type: Object,
      value: {} as InventoryCardItem,
    },
  },

  methods: {
    onTap() {
      this.triggerEvent('cardtap', { id: (this.data.item as InventoryCardItem).id })
    },

    onStepperTap() {
      // 步进器区域不触发进详情
    },

    onQuickAdjust(event: { currentTarget: { dataset: { delta?: number | string } } }) {
      const delta = Number(event.currentTarget.dataset.delta ?? 0)
      if (!delta) return
      this.triggerEvent('adjust', { id: (this.data.item as InventoryCardItem).id, delta })
    },
  },
})
