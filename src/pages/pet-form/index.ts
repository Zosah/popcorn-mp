import { addCalendarDays, getShanghaiDateOnly } from '../../domain/expiry'
import type { PetSpecies } from '../../domain/demo-pet'
import { mediaGateway } from '../../services/media'
import { getMediaErrorMessage } from '../../services/media-gateway'
import { petGateway } from '../../services/pet'
import { getPetErrorMessage } from '../../services/pet-gateway'
import { navigateBackOrTab } from '../../utils/demo-navigation'
import {
  chooseEditableImages,
  isImageEditCancelled,
} from '../../utils/image-editor'
import { showMediaUploadError } from '../../utils/media-error'

interface PetFormAvatar {
  mediaId: string
  src: string
  thumbSrc: string
}

const SPECIES_OPTIONS: Array<{
  value: PetSpecies
  label: string
  icon: string
  hint: string
}> = [
  { value: 'cat', label: '猫咪', icon: 'pet-tab-profile', hint: '安静或活泼的小猫' },
  { value: 'dog', label: '狗狗', icon: 'pet-tab-profile', hint: '每天想出门的伙伴' },
  { value: 'other', label: '其他', icon: 'pet-supply-custom', hint: '兔子、仓鼠或其他伙伴' },
]

const today = getShanghaiDateOnly(Date.now())

Page({
  data: {
    saving: false,
    avatarUploading: false,
    errorText: '',
    maxDate: today,
    avatar: null as PetFormAvatar | null,
    avatarMediaId: '',
    speciesOptions: SPECIES_OPTIONS,
    speciesHint: '选狗狗会启用遛狗、剪指甲，以及牵引绳、尿垫这类用品分类',
    sexOptions: [
      { value: 'female', label: '妹妹' },
      { value: 'male', label: '弟弟' },
    ],
    form: {
      name: '',
      species: 'cat' as PetSpecies,
      breed: '',
      sex: 'female' as 'female' | 'male',
      birthday: addCalendarDays(today, -365),
      homeOn: today,
      neuteredOn: '',
      status: '刚刚加入这个家',
    },
  },

  onBack() {
    navigateBackOrTab('/pages/pets/index')
  },

  onFieldInput(event: {
    currentTarget: { dataset: { field: 'name' | 'breed' | 'status' } }
    detail: { value: string }
  }) {
    const field = event.currentTarget.dataset.field
    this.setData({ [`form.${field}`]: event.detail.value, errorText: '' })
  },

  onSpeciesSelect(event: {
    currentTarget: { dataset: { value: PetSpecies } }
  }) {
    const species = event.currentTarget.dataset.value
    if (!SPECIES_OPTIONS.some((item) => item.value === species)) return
    this.setData({ 'form.species': species, errorText: '' })
  },

  onSexSelect(event: {
    currentTarget: { dataset: { value: 'female' | 'male' } }
  }) {
    const sex = event.currentTarget.dataset.value
    if (sex !== 'female' && sex !== 'male') return
    this.setData({ 'form.sex': sex, errorText: '' })
  },

  onBirthdayChange(event: { detail: { value: string } }) {
    this.setData({ 'form.birthday': event.detail.value, errorText: '' })
  },

  onHomeDateChange(event: { detail: { value: string } }) {
    this.setData({ 'form.homeOn': event.detail.value, errorText: '' })
  },

  onNeuteredToggle() {
    this.setData({
      'form.neuteredOn': this.data.form.neuteredOn ? '' : today,
      errorText: '',
    })
  },

  onNeuteredDateChange(event: { detail: { value: string } }) {
    this.setData({ 'form.neuteredOn': event.detail.value, errorText: '' })
  },

  async onChooseAvatar() {
    if (this.data.avatarUploading || this.data.saving) return
    try {
      const [file] = await chooseEditableImages({ count: 1, cropSquare: true })
      if (!file) return
      if (file.size > 10 * 1024 * 1024) {
        wx.showToast({ title: '图片不能超过 10 MiB', icon: 'none' })
        return
      }
      await this.uploadAvatar(file.tempFilePath, file.size)
    } catch (error) {
      if (!isImageEditCancelled(error)) {
        showMediaUploadError(error, '照片没有准备好')
      }
    }
  },

  onAvatarTap() {
    if (this.data.avatar) {
      this.onPreviewAvatar()
      return
    }
    this.onChooseAvatar()
  },

  async uploadAvatar(filePath: string, fileSize: number) {
    this.setData({ avatarUploading: true, errorText: '' })
    try {
      const asset = await mediaGateway.upload(filePath, 'avatar', fileSize)
      const src = asset.display.url || asset.thumb.url
      this.setData({
        avatar: {
          mediaId: asset.id,
          src,
          thumbSrc: asset.thumb.url || src,
        },
        avatarMediaId: asset.id,
      })
      wx.showToast({ title: '照片已准备好', icon: 'success' })
    } catch (error) {
      const message = getMediaErrorMessage(error, '照片上传没有完成')
      this.setData({ errorText: message })
      showMediaUploadError(error, '照片上传没有完成')
    } finally {
      this.setData({ avatarUploading: false })
    }
  },

  onPreviewAvatar() {
    const src = this.data.avatar?.src
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
  },

  onRemoveAvatar() {
    if (this.data.avatarUploading || this.data.saving) return
    this.setData({ avatar: null, avatarMediaId: '' })
  },

  async onSave() {
    if (this.data.saving || this.data.avatarUploading) return
    const form = this.data.form
    const name = form.name.trim()
    const breed = form.breed.trim()
    const status = form.status.trim()

    if (!name) {
      this.showValidation('先写下它的名字吧')
      return
    }
    if (Array.from(name).length > 20) {
      this.showValidation('名字最多 20 个字符')
      return
    }
    if (Array.from(breed).length > 30) {
      this.showValidation('品种最多 30 个字符')
      return
    }
    if (Array.from(status).length > 30) {
      this.showValidation('状态说明最多 30 个字符')
      return
    }
    if (!form.birthday) {
      this.showValidation('请选择出生日期')
      return
    }
    if (!form.homeOn) {
      this.showValidation('请选择到家日期')
      return
    }
    if (form.homeOn < form.birthday) {
      this.showValidation('到家日期不能早于出生日期')
      return
    }
    if (form.neuteredOn && form.neuteredOn < form.birthday) {
      this.showValidation('绝育日期不能早于出生日期')
      return
    }

    this.setData({ saving: true, errorText: '' })
    try {
      await petGateway.createPet({
        name,
        species: form.species,
        profile: {
          breed,
          sex: form.sex,
          birthday: form.birthday,
          homeOn: form.homeOn,
          neuteredOn: form.neuteredOn || null,
          status,
          avatarMediaId: this.data.avatarMediaId,
        },
      })
      wx.showToast({ title: `${name}已加入`, icon: 'success' })
      setTimeout(() => navigateBackOrTab('/pages/pets/index'), 450)
    } catch (error) {
      const message = getPetErrorMessage(error, '宠物档案没有保存成功')
      this.setData({ errorText: message })
      wx.showToast({ title: message, icon: 'none' })
    } finally {
      this.setData({ saving: false })
    }
  },

  showValidation(message: string) {
    this.setData({ errorText: message })
    wx.showToast({ title: message, icon: 'none' })
  },
})
