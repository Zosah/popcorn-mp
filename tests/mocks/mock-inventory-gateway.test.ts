import { describe, expect, it } from 'vitest'

import type { InventoryItemInput } from '../../src/domain/inventory'
import {
  MockInventoryGateway,
  type InventoryStorage,
} from '../../src/mocks/mock-inventory-gateway'
import { InventoryGatewayError } from '../../src/services/inventory-gateway'
import { createInventoryItem } from '../fixtures/inventory'

class MemoryStorage implements InventoryStorage {
  private items: ReturnType<typeof createInventoryItem>[] | null = null

  get() {
    return this.items?.map((item) => ({ ...item })) ?? null
  }

  set(items: readonly ReturnType<typeof createInventoryItem>[]) {
    this.items = items.map((item) => ({ ...item }))
  }
}

const input: InventoryItemInput = {
  name: '  新鲜鸡蛋  ',
  category: 'food',
  quantity: '12',
  unit: '枚',
  location: 'fridge',
  purchasedOn: '2026-08-26',
  openedOn: null,
  expiresOn: '2026-09-05',
  note: '周末早餐',
}

function createGateway(storage?: InventoryStorage) {
  return new MockInventoryGateway({
    initialItems: [createInventoryItem()],
    storage,
    now: () => Date.parse('2026-08-26T08:00:00.000Z'),
    idGenerator: () => 'generated-id',
  })
}

describe('MockInventoryGateway', () => {
  it('初始化数据与读取结果不会被调用方引用污染', async () => {
    const initial = createInventoryItem()
    const gateway = new MockInventoryGateway({ initialItems: [initial] })
    const first = await gateway.get(initial.id)
    if (!first) throw new Error('测试数据不存在')
    first.name = '页面临时改名'

    expect((await gateway.get(initial.id))?.name).toBe('鲜牛奶')
    expect(initial.name).toBe('鲜牛奶')
  })

  it('创建时清理名称并生成稳定字段', async () => {
    const gateway = createGateway()
    const created = await gateway.create(input)

    expect(created).toMatchObject({
      id: 'generated-id',
      name: '新鲜鸡蛋',
      status: 'active',
      version: 1,
      createdAt: '2026-08-26T08:00:00.000Z',
      updatedAt: '2026-08-26T08:00:00.000Z',
    })
    expect((await gateway.get('generated-id'))?.name).toBe('新鲜鸡蛋')
  })

  it('更新后版本加一，旧版本更新返回冲突', async () => {
    const gateway = createGateway()
    const updated = await gateway.update('item-1', { ...input, name: '低脂牛奶' }, 1)
    expect(updated.version).toBe(2)
    expect(updated.name).toBe('低脂牛奶')

    await expect(gateway.update('item-1', input, 1)).rejects.toMatchObject({
      code: 'VERSION_CONFLICT',
    })
  })

  it('不存在物品返回 NOT_FOUND', async () => {
    const gateway = createGateway()
    await expect(gateway.update('missing', input, 1)).rejects.toEqual(
      new InventoryGatewayError('NOT_FOUND', '物品不存在'),
    )
  })

  it('支持状态变更、恢复和软删除', async () => {
    const gateway = createGateway()
    const consumed = await gateway.changeStatus('item-1', 'consumed', 1)
    expect(consumed).toMatchObject({ status: 'consumed', version: 2 })

    const restored = await gateway.changeStatus('item-1', 'active', 2)
    expect(restored).toMatchObject({ status: 'active', version: 3 })

    await gateway.remove('item-1', 3)
    expect(await gateway.get('item-1')).toBeNull()
    expect(await gateway.list({}, '2026-08-26')).toEqual([])
  })

  it('列表复用领域搜索筛选规则', async () => {
    const gateway = createGateway()
    await gateway.create(input)
    expect(
      (await gateway.list({ categories: ['food'], query: '鸡蛋' }, '2026-08-26')).map(
        (item) => item.id,
      ),
    ).toEqual(['generated-id'])
  })

  it('通过存储适配器跨实例保留数据', async () => {
    const storage = new MemoryStorage()
    const first = createGateway(storage)
    await first.create(input)

    const second = createGateway(storage)
    expect((await second.get('generated-id'))?.name).toBe('新鲜鸡蛋')
  })
})
