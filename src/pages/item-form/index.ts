import {
  CATEGORY_OPTIONS,
  LOCATION_OPTIONS,
} from '../../constants/inventory'
import {
  INVENTORY_CATEGORY_ICON_NAMES,
  INVENTORY_LOCATION_ICON_NAMES,
} from '../../constants/icon-names'
import type { InventoryItemInput } from '../../domain/inventory'
import { inventoryGateway } from '../../services/demo-inventory'
import { navigateBackOrTab } from '../../utils/demo-navigation'

interface PickerEvent {
  detail: { value: string }
}

interface InputEvent {
  detail: { value: string }
}

interface SwitchEvent {
  detail: { value: boolean }
}

const DEFAULT_FORM: InventoryItemInput = {
  name: '',
  category: 'food',
  quantity: '1',
  unit: '件',
  location: 'fridge',
  purchasedOn: null,
  openedOn: null,
  expiresOn: null,
  note: '',
}

Page({
  data: {
    itemId: '',
    version: 0,
    saving: false,
    hasExpiry: false,
    categoryIndex: 0,
    locationIndex: 0,
    categoryLabels: CATEGORY_OPTIONS.map((item) => item.label),
    locationLabels: LOCATION_OPTIONS.map((item) => item.label),
    categoryIconNames: CATEGORY_OPTIONS.map(
      (item) => INVENTORY_CATEGORY_ICON_NAMES[item.value],
    ),
    locationIconNames: LOCATION_OPTIONS.map(
      (item) => INVENTORY_LOCATION_ICON_NAMES[item.value],
    ),
    form: { ...DEFAULT_FORM },
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = options.id ?? ''
    if (itemId) {
      wx.setNavigationBarTitle({ title: '编辑物品' })
      this.setData({ itemId })
      void this.loadItem(itemId)
    }
  },

  async loadItem(id: string) {
    const item = await inventoryGateway.get(id)
    if (!item) {
      wx.showToast({ title: '物品不存在', icon: 'none' })
      navigateBackOrTab('/pages/inventory/index')
      return
    }
    this.setData({
      version: item.version,
      hasExpiry: item.expiresOn !== null,
      categoryIndex: Math.max(
        0,
        CATEGORY_OPTIONS.findIndex((option) => option.value === item.category),
      ),
      locationIndex: Math.max(
        0,
        LOCATION_OPTIONS.findIndex((option) => option.value === item.location),
      ),
      form: {
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        unit: item.unit,
        location: item.location,
        purchasedOn: item.purchasedOn,
        openedOn: item.openedOn,
        expiresOn: item.expiresOn,
        note: item.note,
      },
    })
  },

  onBack() {
    navigateBackOrTab('/pages/inventory/index')
  },

  onNameInput(event: InputEvent) {
    this.setData({ 'form.name': event.detail.value })
  },

  onQuantityInput(event: InputEvent) {
    this.setData({ 'form.quantity': event.detail.value })
  },

  onUnitInput(event: InputEvent) {
    this.setData({ 'form.unit': event.detail.value })
  },

  onNoteInput(event: InputEvent) {
    this.setData({ 'form.note': event.detail.value })
  },

  onCategoryChange(event: PickerEvent) {
    const index = Number(event.detail.value)
    const option = CATEGORY_OPTIONS[index]
    if (option) {
      this.setData({ categoryIndex: index, 'form.category': option.value })
    }
  },

  onLocationChange(event: PickerEvent) {
    const index = Number(event.detail.value)
    const option = LOCATION_OPTIONS[index]
    if (option) {
      this.setData({ locationIndex: index, 'form.location': option.value })
    }
  },

  onExpiryToggle(event: SwitchEvent) {
    const hasExpiry = event.detail.value
    this.setData({
      hasExpiry,
      'form.expiresOn': hasExpiry ? this.data.form.expiresOn ?? '' : null,
    })
  },

  onExpiryChange(event: PickerEvent) {
    this.setData({ 'form.expiresOn': event.detail.value })
  },

  async onSave() {
    const form = this.data.form
    if (!form.name.trim()) {
      wx.showToast({ title: '请填写物品名称', icon: 'none' })
      return
    }
    if (!form.quantity || Number(form.quantity) <= 0) {
      wx.showToast({ title: '数量需要大于 0', icon: 'none' })
      return
    }
    if (this.data.hasExpiry && !form.expiresOn) {
      wx.showToast({ title: '请选择有效期', icon: 'none' })
      return
    }

    this.setData({ saving: true })
    try {
      if (this.data.itemId) {
        await inventoryGateway.update(
          this.data.itemId,
          { ...form, expiresOn: this.data.hasExpiry ? form.expiresOn : null },
          this.data.version,
        )
      } else {
        await inventoryGateway.create({
          ...form,
          expiresOn: this.data.hasExpiry ? form.expiresOn : null,
        })
      }
      wx.showToast({ title: this.data.itemId ? '已更新' : '已添加', icon: 'success' })
      navigateBackOrTab('/pages/inventory/index')
    } catch (error) {
      wx.showToast({
        title: error instanceof Error ? error.message : '保存失败',
        icon: 'none',
      })
    } finally {
      this.setData({ saving: false })
    }
  },
})
