import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { DemoPetProfile } from '../../src/domain/demo-pet'
import { createDemoPetState } from '../../src/mocks/pet-fixtures'
import {
  addDemoPet,
  getDemoPetStore,
  getDemoPetEvent,
  getDemoPetState,
  listDemoPetProfiles,
  removeDemoPet,
  removeDemoPetEvent,
  switchDemoPet,
  updateDemoPetEvent,
} from '../../src/services/demo-pet'

const LEGACY_STORAGE_KEY = 'popcorn_demo_pet_v1'
const STORAGE_KEY = 'popcorn_demo_pets_v2'

describe('宠物本地多档案存储', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map<string, unknown>()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
    })
  })

  it('把旧版单宠物数据迁移为多宠物容器', () => {
    const legacy = createDemoPetState(Date.UTC(2026, 7, 27))
    delete (legacy.profile as Partial<DemoPetProfile>).species
    storage.set(LEGACY_STORAGE_KEY, legacy)

    const store = getDemoPetStore()

    expect(store.activePetId).toBe(legacy.profile.id)
    expect(store.pets).toHaveLength(2)
    expect(store.pets[0]?.profile.species).toBe('cat')
    expect(storage.has(STORAGE_KEY)).toBe(true)
  })

  it('切换宠物后所有读取指向当前档案', () => {
    getDemoPetStore()
    const second = listDemoPetProfiles()[1]
    if (!second) throw new Error('第二只演示宠物不存在')

    switchDemoPet(second.id)

    expect(getDemoPetState().profile.name).toBe('芝麻')
  })

  it('新增伙伴后自动切换到新档案', () => {
    getDemoPetStore()
    const created = addDemoPet({ name: ' 团子 ', species: 'other' })

    expect(created.profile).toMatchObject({ name: '团子', species: 'other' })
    expect(getDemoPetState().profile.id).toBe(created.profile.id)
    expect(listDemoPetProfiles()).toHaveLength(3)
  })

  it('支持读取、编辑和删除当前宠物事件', () => {
    const original = getDemoPetState().events[0]
    if (!original) throw new Error('宠物演示事件不存在')

    const detached = getDemoPetEvent(original.id)
    if (!detached) throw new Error('无法读取宠物演示事件')
    detached.title = '页面临时标题'
    expect(getDemoPetEvent(original.id)?.title).toBe(original.title)

    updateDemoPetEvent(original.id, {
      type: 'visit',
      occurredOn: '2026-08-28',
      title: '  复诊完成  ',
      note: '恢复良好',
      provider: '社区宠物医院',
      cost: '260',
      nextOn: '2026-09-28',
    })
    expect(getDemoPetEvent(original.id)).toMatchObject({
      type: 'visit',
      occurredOn: '2026-08-28',
      title: '复诊完成',
      provider: '社区宠物医院',
      cost: '260',
      nextOn: '2026-09-28',
    })

    removeDemoPetEvent(original.id)
    expect(getDemoPetEvent(original.id)).toBeNull()
  })

  it('删除全部档案后不会自动重新播种演示宠物', () => {
    getDemoPetStore()
    for (const profile of listDemoPetProfiles()) removeDemoPet(profile.id)

    const store = getDemoPetStore()
    expect(store.pets).toEqual([])
    expect(store.activePetId).toBe('')
  })
})
