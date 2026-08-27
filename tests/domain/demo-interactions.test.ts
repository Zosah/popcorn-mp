import { describe, expect, it } from 'vitest'

import {
  resolveDemoBackIntent,
  resolveInventoryLifecycleActions,
  resolveInventoryLifecycleStatuses,
} from '../../src/domain/demo-interactions'

describe('resolveDemoBackIntent', () => {
  it('有上一页时返回上一页，不额外创建页面层级', () => {
    expect(resolveDemoBackIntent(2, '/pages/inventory/index')).toEqual({
      method: 'navigateBack',
      delta: 1,
    })
  })

  it('直接打开子页且没有上一页时回到指定 Tab', () => {
    expect(resolveDemoBackIntent(1, '/pages/inventory/index')).toEqual({
      method: 'switchTab',
      url: '/pages/inventory/index',
    })
  })
})

describe('resolveInventoryLifecycleStatuses', () => {
  it('在库视图只显示当前仍在使用的物品', () => {
    expect(resolveInventoryLifecycleStatuses('active')).toEqual(['active'])
  })

  it('历史视图集中显示用完、丢弃和归档物品', () => {
    expect(resolveInventoryLifecycleStatuses('history')).toEqual([
      'consumed',
      'discarded',
      'archived',
    ])
  })
})

describe('resolveInventoryLifecycleActions', () => {
  it('在库物品可标记用完、丢弃或归档', () => {
    expect(resolveInventoryLifecycleActions('active')).toEqual([
      { key: 'consume', nextStatus: 'consumed' },
      { key: 'discard', nextStatus: 'discarded' },
      { key: 'archive', nextStatus: 'archived' },
    ])
  })

  it.each(['consumed', 'discarded', 'archived'] as const)(
    '%s 状态只提供恢复到库存操作',
    (status) => {
      expect(resolveInventoryLifecycleActions(status)).toEqual([
        { key: 'restore', nextStatus: 'active' },
      ])
    },
  )
})
