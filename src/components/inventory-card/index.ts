Component({
  properties: {
    item: {
      type: Object,
      value: null,
    },
  },
  methods: {
    onTap() {
      const data = this.data as unknown as { item: { id: string } }
      this.triggerEvent('cardtap', { id: data.item.id })
    },
  },
})
