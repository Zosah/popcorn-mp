import { appConfig } from '../../config/env'
import { hydrateAuthState } from '../../services/auth'
import {
  APP_TAB_OPTIONS,
  buildAppTabOwnerId,
  getAppTabOption,
  getAppTabSnapshot,
  normalizeAppTabConfig,
  resolveAppTabItems,
  type AppTabConfig,
  type AppTabCustomId,
  type AppTabItem,
  type AppTabOption,
} from '../../services/app-tab-config'
import {
  appTabGateway,
  syncAppTabSettings,
} from '../../services/app-tab-settings'
import {
  getAppTabErrorMessage,
  isAppTabVersionConflict,
} from '../../services/app-tab-gateway'

type EditableSlot = 'slot2' | 'slot3'

interface SlotCardView extends AppTabItem {
  slot: EditableSlot
  positionLabel: string
}

interface CandidateView extends AppTabOption {
  selected: boolean
  disabled: boolean
  stateLabel: string
}

interface CandidateGroupView {
  key: 'primary' | 'secondary'
  title: string
  hint: string
  items: CandidateView[]
}

function buildSlots(config: AppTabConfig): SlotCardView[] {
  return [
    {
      ...getAppTabOption(config.slot2),
      slot: 'slot2',
      positionLabel: '第二个位置',
    },
    {
      ...getAppTabOption(config.slot3),
      slot: 'slot3',
      positionLabel: '第三个位置',
    },
  ]
}

function buildCandidateGroups(
  config: AppTabConfig,
  editingSlot: EditableSlot,
): CandidateGroupView[] {
  const otherSlot: EditableSlot = editingSlot === 'slot2' ? 'slot3' : 'slot2'
  const candidates = APP_TAB_OPTIONS.map((option) => {
    const selected = option.id === config[editingSlot]
    const disabled = option.id === config[otherSlot]
    return {
      ...option,
      selected,
      disabled,
      stateLabel: selected
        ? '正在这个位置'
        : disabled
          ? '已在另一个位置'
          : '',
    }
  })
  return [
    {
      key: 'primary',
      title: '一级入口',
      hint: '打开完整页面',
      items: candidates.filter((option) => option.level === 'primary'),
    },
    {
      key: 'secondary',
      title: '二级功能',
      hint: '直达具体场景',
      items: candidates.filter((option) => option.level === 'secondary'),
    },
  ]
}

Page({
  data: {
    ownerId: 'guest',
    config: {
      slot2: 'pets',
      slot3: 'journal',
    } as AppTabConfig,
    version: 1,
    editingSlot: 'slot2' as EditableSlot,
    slots: [] as SlotCardView[],
    previewItems: [] as AppTabItem[],
    candidateGroups: [] as CandidateGroupView[],
    loading: true,
    saving: false,
    errorText: '',
    mode: appConfig.demoMode ? 'demo' : 'http',
    syncText: appConfig.demoMode ? '本机保存' : '正在同步',
  },

  onLoad() {
    void this.loadSettings()
  },

  async loadSettings() {
    const localAuth = await hydrateAuthState()
    const ownerId = buildAppTabOwnerId(
      localAuth.user?.id ?? '',
      localAuth.activeSpaceId,
    )
    const local = getAppTabSnapshot(ownerId)
    this.setData({
      ownerId,
      version: local.version,
      loading: true,
      saving: false,
      errorText: '',
      syncText: appConfig.demoMode ? '本机保存' : '正在同步',
    })
    this.render(local)

    if (appConfig.demoMode) {
      this.setData({ loading: false, syncText: '本机保存' })
      return
    }

    try {
      await syncAppTabSettings()
      const synced = getAppTabSnapshot(ownerId)
      this.setData({
        version: synced.version,
        loading: false,
        errorText: '',
        syncText: '已同步到空间',
      })
      this.render(synced)
    } catch (error) {
      this.setData({
        loading: false,
        errorText: getAppTabErrorMessage(error, '底栏设置暂时没有同步过来'),
        syncText: '使用本机版本',
      })
    }
  },

  onRetry() {
    if (this.data.loading) return
    void this.loadSettings()
  },

  render(config: AppTabConfig, editingSlot?: EditableSlot) {
    const normalized = normalizeAppTabConfig(config)
    const activeSlot = editingSlot ?? this.data.editingSlot
    this.setData({
      config: normalized,
      slots: buildSlots(normalized),
      previewItems: resolveAppTabItems(normalized),
      candidateGroups: buildCandidateGroups(normalized, activeSlot),
    })
  },

  onSelectSlot(event: {
    currentTarget: { dataset: { slot?: EditableSlot } }
  }) {
    const slot = event.currentTarget.dataset.slot
    if (!slot) return
    this.setData({ editingSlot: slot })
    this.render(this.data.config, slot)
  },

  async onChooseCandidate(event: {
    currentTarget: { dataset: { id?: AppTabCustomId } }
  }) {
    if (this.data.loading || this.data.saving) return
    const id = event.currentTarget.dataset.id
    if (!id) return
    const option = APP_TAB_OPTIONS.find((item) => item.id === id)
    if (!option) return

    const { editingSlot, config, version } = this.data
    const otherSlot: EditableSlot = editingSlot === 'slot2' ? 'slot3' : 'slot2'
    if (config[otherSlot] === id) {
      wx.showToast({ title: '这个功能已经放在另一个位置了', icon: 'none' })
      return
    }

    if (config[editingSlot] === id) return
    const nextConfig = {
      ...config,
      [editingSlot]: id,
    }
    const previous = { ...config }
    this.setData({
      config: nextConfig,
      saving: true,
      errorText: '',
      syncText: appConfig.demoMode ? '保存中' : '同步中',
    })
    this.render(nextConfig)

    try {
      const saved = await appTabGateway.update(nextConfig, version)
      this.setData({
        version: saved.version,
        saving: false,
        errorText: '',
        syncText: appConfig.demoMode ? '本机保存' : '已同步到空间',
      })
      this.render(saved)
      wx.showToast({ title: `已放到${editingSlot === 'slot2' ? '第二' : '第三'}个位置`, icon: 'none' })
    } catch (error) {
      if (isAppTabVersionConflict(error)) {
        this.setData({ saving: false })
        await this.loadSettings()
        wx.showToast({ title: '底栏已在别处更新，已载入最新版本', icon: 'none' })
        return
      }
      const message = getAppTabErrorMessage(error, '这次没有保存成功')
      this.setData({
        config: previous,
        saving: false,
        errorText: message,
        syncText: '未同步',
      })
      this.render(previous)
      wx.showToast({ title: message, icon: 'none' })
    }
  },
})
