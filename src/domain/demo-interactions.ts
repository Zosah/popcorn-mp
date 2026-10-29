import type { InventoryLifecycleStatus } from './inventory'

export type DemoBackIntent =
  | { method: 'navigateBack'; delta: number }
  | { method: 'relaunch'; url: DemoTabPath }

export type DemoTabPath =
  | '/pages/home/index'
  | '/pages/inventory/index'
  | '/pages/journal/index'
  | '/pages/pets/index'
  | '/pages/todo/index'
  | '/pages/menu/index'
  | '/pages/profile/index'

export type InventoryViewMode = 'active' | 'history'

export type InventoryLifecycleActionKey =
  | 'consume'
  | 'discard'
  | 'archive'
  | 'restore'

export interface InventoryLifecycleAction {
  key: InventoryLifecycleActionKey
  nextStatus: InventoryLifecycleStatus
}

/**
 * 生成页面返回意图：有上一页时返回上一页，否则回到指定根页面。
 */
export function resolveDemoBackIntent(
  pageStackDepth: number,
  fallbackTab: DemoTabPath,
): DemoBackIntent {
  return pageStackDepth > 1
    ? { method: 'navigateBack', delta: 1 }
    : { method: 'relaunch', url: fallbackTab }
}

/**
 * 将库存视图切换状态转换为网关可使用的生命周期筛选值。
 */
export function resolveInventoryLifecycleStatuses(
  mode: InventoryViewMode,
): InventoryLifecycleStatus[] {
  return mode === 'active'
    ? ['active']
    : ['consumed', 'discarded', 'archived']
}

/**
 * 根据物品当前状态提供下一步可执行操作。
 */
export function resolveInventoryLifecycleActions(
  status: InventoryLifecycleStatus,
): InventoryLifecycleAction[] {
  if (status !== 'active') {
    return [{ key: 'restore', nextStatus: 'active' }]
  }

  return [
    { key: 'consume', nextStatus: 'consumed' },
    { key: 'discard', nextStatus: 'discarded' },
    { key: 'archive', nextStatus: 'archived' },
  ]
}
