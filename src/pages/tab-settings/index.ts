import { hydrateAuthState } from '../../services/auth'
import {
  APP_TAB_OPTIONS,
  getAppTabConfig,
  getAppTabOption,
  normalizeAppTabConfig,
  resolveAppTabItems,
  saveAppTabConfig,
  type AppTabConfig,
  type AppTabCustomId,
  type AppTabItem,
  type AppTabOption,
} from '../../services/app-tab-config'

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
    editingSlot: 'slot2' as EditableSlot,
    slots: [] as SlotCardView[],
    previewItems: [] as AppTabItem[],
    candidateGroups: [] as CandidateGroupView[],
  },

  async onLoad() {
    const auth = await hydrateAuthState()
    const ownerId = auth.user?.id || auth.activeSpaceId || 'guest'
    const config = getAppTabConfig(ownerId)
    this.setData({ ownerId })
    this.render(config)
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

  onChooseCandidate(event: {
    currentTarget: { dataset: { id?: AppTabCustomId } }
  }) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    const option = APP_TAB_OPTIONS.find((item) => item.id === id)
    if (!option) return

    const { editingSlot, config, ownerId } = this.data
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
    const saved = saveAppTabConfig(nextConfig, ownerId)
    this.render(saved)
    wx.showToast({ title: `已放到${editingSlot === 'slot2' ? '第二' : '第三'}个位置`, icon: 'none' })
  },
})
