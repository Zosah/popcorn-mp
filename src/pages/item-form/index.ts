import {
  CATEGORY_OPTIONS,
  LOCATION_OPTIONS,
} from '../../constants/inventory'
import {
  INVENTORY_CATEGORY_ICON_NAMES,
  INVENTORY_LOCATION_ICON_NAMES,
} from '../../constants/icon-names'
import type { InventoryItemInput } from '../../domain/inventory'
import { inventoryGateway } from '../../services/inventory'
import { mediaGateway } from '../../services/media'
import { MediaGatewayError } from '../../services/media-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { getInventoryErrorMessage } from '../../utils/inventory-error'
import { showMediaUploadError } from '../../utils/media-error'

interface PickerEvent {
  detail: { value: string }
}

interface InputEvent {
  detail: { value: string }
}

interface SwitchEvent {
  detail: { value: boolean }
}

interface InventoryImage {
  mediaId: string
  src: string
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
  imageMediaId: '',
}

Page({
  data: {
    itemId: '',
    version: 0,
    loading: false,
    loadError: '',
    saving: false,
    imageUploading: false,
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
    image: null as InventoryImage | null,
    form: { ...DEFAULT_FORM },
  },

  onLoad(options: Record<string, string | undefined>) {
    const itemId = options.id ?? ''
    if (itemId) {
      wx.setNavigationBarTitle({ title: '编辑物品' })
      this.setData({ itemId, loading: true })
      void this.loadItem(itemId)
    }
  },

  async loadItem(id: string) {
    this.setData({ loading: true, loadError: '' })
    try {
      const item = await inventoryGateway.get(id)
      if (!item) {
        wx.showToast({ title: '物品不存在', icon: 'none' })
        navigateBackOrTab('/pages/inventory/index')
        return
      }
      let image: InventoryImage | null = null
      let imageMediaId = item.imageMediaId
      if (item.imageMediaId) {
        try {
          const asset = await mediaGateway.get(item.imageMediaId)
          image = { mediaId: asset.id, src: asset.display.url }
        } catch (error) {
          // 只有确认图片不存在时才清空；临时签名失败仍保留原图，避免误删。
          if (error instanceof MediaGatewayError &&
            (error.code === 'NOT_FOUND' || error.code === 'MEDIA_NOT_FOUND')) {
            imageMediaId = ''
          }
        }
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
        image,
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
          imageMediaId,
        },
      })
    } catch (error) {
      this.setData({
        loadError: getInventoryErrorMessage(
          error,
          '物品信息暂时没有加载出来',
        ),
      })
    } finally {
      this.setData({ loading: false })
    }
  },

  onRetryLoad() {
    if (this.data.itemId) void this.loadItem(this.data.itemId)
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

  onChooseImage() {
    if (this.data.imageUploading || this.data.saving) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (result) => {
        const file = result.tempFiles[0]
        if (!file) return
        if (file.size > 10 * 1024 * 1024) {
          wx.showToast({ title: '图片不能超过 10 MiB', icon: 'none' })
          return
        }
        void this.uploadImage(file)
      },
    })
  },

  async uploadImage(file: WechatMiniprogram.MediaFile) {
    this.setData({ imageUploading: true })
    try {
      const asset = await mediaGateway.upload(file.tempFilePath, 'inventory', file.size)
      this.setData({
        image: { mediaId: asset.id, src: asset.display.url },
        'form.imageMediaId': asset.id,
      })
      wx.showToast({ title: '图片已添加', icon: 'success' })
    } catch (error) {
      showMediaUploadError(error, '图片没有上传成功')
    } finally {
      this.setData({ imageUploading: false })
    }
  },

  onPreviewImage() {
    const src = this.data.image?.src
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
  },

  onRemoveImage() {
    if (this.data.imageUploading || this.data.saving) return
    this.setData({ image: null, 'form.imageMediaId': '' })
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
    if (this.data.loading || this.data.loadError || this.data.imageUploading) return
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
        title: getInventoryErrorMessage(error, '保存失败'),
        icon: 'none',
      })
    } finally {
      this.setData({ saving: false })
    }
  },
})
