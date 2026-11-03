import { beforeEach, describe, expect, it, vi } from 'vitest'

import { DemoPetGateway } from '../../src/services/demo-pet-gateway'

describe('Demo 宠物网关', () => {
  let storage: Map<string, unknown>

  beforeEach(() => {
    storage = new Map()
    vi.stubGlobal('wx', {
      getStorageSync: (key: string) => storage.get(key) ?? '',
      setStorageSync: (key: string, value: unknown) => storage.set(key, value),
      removeStorageSync: (key: string) => storage.delete(key),
    })
  })

  it('列表、切换与事件查找保持同一份本地状态', async () => {
    const gateway = new DemoPetGateway()
    const first = await gateway.list()
    const secondPet = first.pets[1]
    if (!secondPet) throw new Error('缺少第二只演示宠物')

    const switched = await gateway.setActivePet(secondPet.profile.id)
    expect(switched.activePetId).toBe(secondPet.profile.id)

    const event = secondPet.events[0]
    if (!event) throw new Error('缺少演示事件')
    const match = await gateway.findEvent(event.id)
    expect(match?.pet.profile.id).toBe(secondPet.profile.id)
    expect(match?.event.id).toBe(event.id)
  })

  it('事件更新和删除校验事件自身版本', async () => {
    const gateway = new DemoPetGateway()
    const collection = await gateway.list()
    const pet = collection.pets[0]
    const event = pet?.events[0]
    if (!pet || !event) throw new Error('缺少演示宠物事件')

    const updated = await gateway.updateEvent(pet.profile.id, event.id, {
      type: event.type,
      occurredOn: event.occurredOn,
      title: '更新后的标题',
      note: '',
      provider: '',
      cost: '',
      nextOn: null,
    }, event.version ?? 1)
    expect(updated.events.find((item) => item.id === event.id)?.title).toBe('更新后的标题')

    await expect(gateway.removeEvent(
      pet.profile.id,
      event.id,
      event.version ?? 1,
    )).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })

    const latest = updated.events.find((item) => item.id === event.id)
    await gateway.removeEvent(
      pet.profile.id,
      event.id,
      latest?.version ?? 1,
    )
    expect((await gateway.findEvent(event.id))).toBeNull()
  })

  it('创建周期照护事件时保存周期并自动推算下次日期', async () => {
    const gateway = new DemoPetGateway()
    const collection = await gateway.list()
    const pet = collection.pets[0]
    if (!pet) throw new Error('缺少演示宠物')

    const updated = await gateway.createEvent(pet.profile.id, {
      type: 'external-deworm',
      occurredOn: '2026-10-31',
      title: '完成体外驱虫',
      note: '',
      nextOn: null,
      recurrenceDays: 30,
    })
    const event = updated.events.find((item) => item.title === '完成体外驱虫')

    expect(event).toMatchObject({
      recurrenceDays: 30,
      nextOn: '2026-11-30',
    })
  })

  it('用品状态更新使用用品自身版本', async () => {
    const gateway = new DemoPetGateway()
    const collection = await gateway.list()
    const pet = collection.pets[0]
    const supply = pet?.supplies[0]
    if (!pet || !supply) throw new Error('缺少演示宠物用品')

    const updated = await gateway.setSupplyStatus(
      pet.profile.id,
      supply.id,
      'loved',
      supply.version ?? 1,
    )
    expect(updated.supplies.find((item) => item.id === supply.id)).toMatchObject({
      preference: 'loved',
      version: (supply.version ?? 1) + 1,
    })
  })

  it('自定义背景会保留历史，切回系统背景也不会丢失', async () => {
    const gateway = new DemoPetGateway()
    const collection = await gateway.list()
    const pet = collection.pets[0]
    if (!pet) throw new Error('缺少演示宠物')

    const first = await gateway.updateProfile(pet.profile.id, {
      name: pet.profile.name,
      species: pet.profile.species,
      breed: pet.profile.breed,
      sex: pet.profile.sex,
      birthday: pet.profile.birthday,
      homeOn: pet.profile.homeOn,
      neuteredOn: pet.profile.neuteredOn,
      status: pet.profile.status,
      avatarMediaId: pet.profile.avatarMediaId ?? '',
      backgroundKey: pet.profile.backgroundKey,
      backgroundMediaId: 'media-first',
      backgroundUrl: '/images/demo-flowers.jpg',
    }, pet.profile.version ?? 1)

    const second = await gateway.updateProfile(pet.profile.id, {
      name: first.profile.name,
      species: first.profile.species,
      breed: first.profile.breed,
      sex: first.profile.sex,
      birthday: first.profile.birthday,
      homeOn: first.profile.homeOn,
      neuteredOn: first.profile.neuteredOn,
      status: first.profile.status,
      avatarMediaId: first.profile.avatarMediaId ?? '',
      backgroundKey: 'mist',
      backgroundMediaId: '',
    }, first.profile.version ?? 1)

    expect(second.profile).toMatchObject({
      backgroundKey: 'mist',
      backgroundMediaId: '',
      backgroundUrl: '',
    })
    expect(second.profile.backgroundHistory).toEqual([
      expect.objectContaining({
        mediaId: 'media-first',
        url: '/images/demo-flowers.jpg',
      }),
    ])
  })

  it('日常记录可以使用补录时间', async () => {
    const gateway = new DemoPetGateway()
    const collection = await gateway.list()
    const pet = collection.pets[0]
    if (!pet) throw new Error('缺少演示宠物')

    const updated = await gateway.addDailyLog(pet.profile.id, {
      type: 'litter-change',
      summary: '整盆更换',
      recordedAt: '2026-11-02T00:35:00.000Z',
    })

    expect(updated.dailyLogs[0]).toMatchObject({
      type: 'litter-change',
      summary: '整盆更换',
      recordedAt: '2026-11-02T00:35:00.000Z',
    })
  })

  it('体重记录支持新增、编辑和删除', async () => {
    const gateway = new DemoPetGateway()
    const collection = await gateway.list()
    const pet = collection.pets[0]
    if (!pet) throw new Error('缺少演示宠物')

    const created = await gateway.addWeight(pet.profile.id, {
      value: '4.6',
      recordedOn: '2026-11-03',
    })
    const weight = created.weights.find((item) => item.recordedOn === '2026-11-03')
    if (!weight) throw new Error('新增体重记录失败')

    const updated = await gateway.updateWeight(pet.profile.id, weight.id, {
      value: '4.8',
      recordedOn: '2026-11-02',
    })
    expect(updated.weights.find((item) => item.id === weight.id)).toMatchObject({
      value: '4.8',
      recordedOn: '2026-11-02',
    })

    const removed = await gateway.removeWeight(pet.profile.id, weight.id)
    expect(removed.weights.some((item) => item.id === weight.id)).toBe(false)
  })

  it('日常记录删除后保留软删除标记并从页面数据中过滤', async () => {
    const gateway = new DemoPetGateway()
    const collection = await gateway.list()
    const pet = collection.pets[0]
    const log = pet?.dailyLogs.find((item) => !item.deletedAt)
    if (!pet || !log) throw new Error('缺少演示日常记录')

    const removed = await gateway.removeDailyLog(pet.profile.id, log.id)
    expect(removed.dailyLogs.find((item) => item.id === log.id)?.deletedAt).toBeTruthy()
    await expect(gateway.removeDailyLog(pet.profile.id, log.id)).rejects.toMatchObject({
      code: 'DAILY_LOG_NOT_FOUND',
    })
  })

  it('用品支持整条编辑并校验用品自身版本', async () => {
    const gateway = new DemoPetGateway()
    const collection = await gateway.list()
    const pet = collection.pets[0]
    const supply = pet?.supplies[0]
    if (!pet || !supply) throw new Error('缺少演示宠物用品')

    const updated = await gateway.updateSupply(pet.profile.id, supply.id, {
      category: 'custom',
      categoryLabel: '玩具',
      name: '新逗猫棒',
      brand: 'PIDAN',
      preference: 'loved',
      note: '很喜欢',
      mediaId: '',
    }, supply.version ?? 1)

    expect(updated.supplies.find((item) => item.id === supply.id)).toMatchObject({
      category: 'custom',
      categoryLabel: '玩具',
      name: '新逗猫棒',
      preference: 'loved',
      version: (supply.version ?? 1) + 1,
    })
    await expect(gateway.updateSupply(pet.profile.id, supply.id, {
      category: supply.category,
      categoryLabel: supply.categoryLabel,
      name: supply.name,
      brand: supply.brand,
      preference: supply.preference,
      note: supply.note,
      mediaId: supply.mediaId ?? '',
    }, supply.version ?? 1)).rejects.toMatchObject({ code: 'VERSION_CONFLICT' })
  })

  it('最近状态最多两条，并支持编辑和删除', async () => {
    const gateway = new DemoPetGateway()
    const collection = await gateway.list()
    const pet = collection.pets[0]
    if (!pet) throw new Error('缺少演示宠物')

    let current = pet
    for (const note of pet.profile.statusNotes) {
      current = await gateway.removeStatusNote(
        pet.profile.id,
        note.id,
        note.version,
      )
    }

    current = await gateway.createStatusNote(pet.profile.id, '今天精神很好')
    const first = current.profile.statusNotes[0]
    if (!first) throw new Error('新增最近状态失败')
    current = await gateway.updateStatusNote(pet.profile.id, first.id, '今天特别精神', first.version)
    expect(current.profile.statusNotes[0]?.content).toBe('今天特别精神')

    current = await gateway.createStatusNote(pet.profile.id, '晚饭吃得很快')
    expect(current.profile.statusNotes).toHaveLength(2)
    await expect(gateway.createStatusNote(pet.profile.id, '第三条')).rejects.toMatchObject({
      code: 'STATUS_LIMIT',
    })

    const removed = await gateway.removeStatusNote(
      pet.profile.id,
      current.profile.statusNotes[0]?.id ?? '',
      current.profile.statusNotes[0]?.version ?? 1,
    )
    expect(removed.profile.statusNotes).toHaveLength(1)
  })

  it('删除当前宠物后切换剩余档案，最后一只删除后保持空状态', async () => {
    const gateway = new DemoPetGateway()
    const initial = await gateway.list()
    const first = initial.pets[0]
    const second = initial.pets[1]
    if (!first || !second) throw new Error('缺少演示宠物')

    await gateway.remove(first.profile.id, first.profile.version ?? 1)
    let remaining = await gateway.list()
    expect(remaining.pets.map((item) => item.profile.id)).not.toContain(first.profile.id)
    expect(remaining.activePetId).toBe(second.profile.id)

    await gateway.remove(second.profile.id, second.profile.version ?? 1)
    remaining = await gateway.list()
    expect(remaining.pets).toEqual([])
    expect(remaining.activePetId).toBe('')
  })
})
