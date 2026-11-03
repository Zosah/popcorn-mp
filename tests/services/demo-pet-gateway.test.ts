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
