import {
  CATEGORY_OPTIONS,
  LOCATION_OPTIONS,
} from '../../constants/inventory'
import {
  INVENTORY_CATEGORY_ICON_NAMES,
  INVENTORY_LOCATION_ICON_NAMES,
} from '../../constants/icon-names'
import { formatChineseDate } from '../../domain/expiry'
import { INVENTORY_ICONS } from '../../constants/inventory-icons'
import { inventoryIconUrl, resolveInventoryIcon } from '../../services/inventory-icon'
import type { InventoryItemInput } from '../../domain/inventory'
import { inventoryGateway } from '../../services/inventory'
import { mediaGateway } from '../../services/media'
import { MediaGatewayError } from '../../services/media-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import { getInventoryErrorMessage } from '../../utils/inventory-error'
import {
  chooseEditableImages,
  editRemoteImage,
  isImageEditCancelled,
} from '../../utils/image-editor'
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
  thumbSrc: string
}

function buildIconGroups() {
  const groups = new Map<string, Array<{ key: string; name: string; url: string }>>()
  for (const icon of INVENTORY_ICONS) {
    const group = icon.group || '其他'
    if (!groups.has(group)) groups.set(group, [])
    groups.get(group)!.push({ key: icon.key, name: icon.name, url: inventoryIconUrl(icon.key, 64) })
  }
  return Array.from(groups, ([group, items]) => ({ group, items }))
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
  iconKey: '',
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
    expiryDisplay: '',
    iconPickerOpen: false,
    iconGroups: buildIconGroups(),
    iconPreviewUrl: '',
    iconPreviewText: '自动',
    categoryIndex: 0,
    locationIndex: 0,
    categoryOptions: CATEGORY_OPTIONS.map((item) => ({
      value: item.value,
      label: item.label,
      iconName: INVENTORY_CATEGORY_ICON_NAMES[item.value],
    })),
    locationOptions: LOCATION_OPTIONS.map((item) => ({
      value: item.value,
      label: item.label,
      iconName: INVENTORY_LOCATION_ICON_NAMES[item.value],
    })),
    unitOptions: ['件', '瓶', '袋', '盒', '包', '罐', '个', '支'],
    expiryPresets: [
      { label: '7 天', days: 7 },
      { label: '1 个月', days: 30 },
      { label: '3 个月', days: 90 },
      { label: '半年', days: 180 },
    ],
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
          const src = asset.display.url || asset.thumb.url
          image = { mediaId: asset.id, src, thumbSrc: asset.thumb.url || src }
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
        expiryDisplay: formatChineseDate(item.expiresOn),
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
          iconKey: item.iconKey ?? '',
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
      this.setData({ loading: false }, () => this.refreshIconPreview())
    }
  },

  noop() {},

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

  async onChooseImage() {
    if (this.data.imageUploading || this.data.saving) return
    try {
      const [file] = await chooseEditableImages({ count: 1 })
      if (!file) return
      if (file.size > 10 * 1024 * 1024) {
        wx.showToast({ title: '图片不能超过 10 MiB', icon: 'none' })
        return
      }
      await this.uploadImage(file.tempFilePath, file.size)
    } catch (error) {
      if (!isImageEditCancelled(error)) {
        showMediaUploadError(error, '图片没有准备好')
      }
    }
  },

  async uploadImage(filePath: string, fileSize: number) {
    this.setData({ imageUploading: true })
    try {
      const asset = await mediaGateway.upload(filePath, 'inventory', fileSize)
      const src = asset.display.url || asset.thumb.url
      this.setData({
        image: { mediaId: asset.id, src, thumbSrc: asset.thumb.url || src },
        'form.imageMediaId': asset.id,
      })
      wx.showToast({ title: '图片已添加', icon: 'success' })
    } catch (error) {
      showMediaUploadError(error, '图片没有上传成功')
    } finally {
      this.setData({ imageUploading: false })
    }
  },

  async onEditImage() {
    if (this.data.imageUploading || this.data.saving) return
    const src = this.data.image?.src
    if (!src) return
    this.setData({ imageUploading: true })
    try {
      const localPath = await editRemoteImage(src)
      const asset = await mediaGateway.upload(localPath, 'inventory')
      const displayUrl = asset.display.url || asset.thumb.url
      this.setData({
        image: {
          mediaId: asset.id,
          src: displayUrl,
          thumbSrc: asset.thumb.url || displayUrl,
        },
        'form.imageMediaId': asset.id,
      })
      wx.showToast({ title: '图片已更新', icon: 'success' })
    } catch (error) {
      if (!isImageEditCancelled(error)) {
        showMediaUploadError(error, '图片没有更新成功')
      }
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

  onSelectCategory(event: { currentTarget: { dataset: { value: string } } }) {
    const value = event.currentTarget.dataset.value
    const index = CATEGORY_OPTIONS.findIndex((option) => option.value === value)
    if (index < 0) return
    this.setData({ categoryIndex: index, 'form.category': value })
  },

  onSelectLocation(event: { currentTarget: { dataset: { value: string } } }) {
    const value = event.currentTarget.dataset.value
    const index = LOCATION_OPTIONS.findIndex((option) => option.value === value)
    if (index < 0) return
    this.setData({ locationIndex: index, 'form.location': value })
  },

  onStepQuantity(event: { currentTarget: { dataset: { delta: string } } }) {
    const delta = Number(event.currentTarget.dataset.delta)
    const current = Number(this.data.form.quantity)
    const base = Number.isFinite(current) ? current : 0
    const next = Math.max(0, Math.round((base + delta) * 100) / 100)
    this.setData({ 'form.quantity': String(next) })
  },

  onSelectUnit(event: { currentTarget: { dataset: { value: string } } }) {
    this.setData({ 'form.unit': event.currentTarget.dataset.value })
  },

  onQuickExpiry(event: { currentTarget: { dataset: { days: string } } }) {
    const days = Number(event.currentTarget.dataset.days)
    if (!Number.isFinite(days) || days <= 0) return
    const target = new Date()
    target.setDate(target.getDate() + days)
    const yyyy = target.getFullYear()
    const mm = String(target.getMonth() + 1).padStart(2, '0')
    const dd = String(target.getDate()).padStart(2, '0')
    const value = `${yyyy}-${mm}-${dd}`
    this.setData({
      hasExpiry: true,
      'form.expiresOn': value,
      expiryDisplay: formatChineseDate(value),
    })
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
    const expiresOn = hasExpiry ? this.data.form.expiresOn ?? '' : null
    this.setData({
      hasExpiry,
      'form.expiresOn': expiresOn,
      expiryDisplay: formatChineseDate(expiresOn),
    })
  },

  onExpiryChange(event: PickerEvent) {
    this.setData({
      'form.expiresOn': event.detail.value,
      expiryDisplay: formatChineseDate(event.detail.value),
    })
  },

  onOpenIconPicker() {
    this.setData({ iconPickerOpen: true })
  },

  onCloseIconPicker() {
    this.setData({ iconPickerOpen: false })
  },

  onSelectIcon(event: { currentTarget: { dataset: { key?: string } } }) {
    const key = event.currentTarget.dataset.key ?? ''
    this.setData({
      'form.iconKey': key,
      iconPickerOpen: false,
    })
    this.refreshIconPreview()
  },

  onClearIcon() {
    this.setData({ 'form.iconKey': '', iconPickerOpen: false })
    this.refreshIconPreview()
  },

  refreshIconPreview() {
    const icon = resolveInventoryIcon({
      name: this.data.form.name,
      category: this.data.form.category,
      iconKey: this.data.form.iconKey,
    })
    this.setData({
      iconPreviewUrl: icon.iconUrl,
      iconPreviewText: icon.fallbackText,
    })
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
