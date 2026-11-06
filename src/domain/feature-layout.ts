import type { FeatureId } from './feature-catalog'

/**
 * 把一个功能放入目标位置。
 *
 * - 目标位置原本有功能时直接替换；
 * - 功能已在同一区域内时，与目标位置交换，避免同一区域出现重复入口；
 * - 索引越界时保持原样。
 */
export function placeFeatureInSlots(
  slots: readonly FeatureId[],
  featureId: FeatureId,
  targetIndex: number,
): FeatureId[] {
  const next = [...slots]
  if (targetIndex < 0 || targetIndex >= next.length) return next

  const existingIndex = next.indexOf(featureId)
  if (existingIndex === targetIndex) return next

  const replaced = next[targetIndex]
  if (!replaced) return next

  if (existingIndex < 0) {
    next[targetIndex] = featureId
    return next
  }

  next[existingIndex] = replaced
  next[targetIndex] = featureId
  return next
}

/** 在同一区域内移动功能，保持其他位置连续。 */
export function moveFeatureWithinSlots(
  slots: readonly FeatureId[],
  fromIndex: number,
  toIndex: number,
): FeatureId[] {
  const next = [...slots]
  if (
    fromIndex < 0
    || toIndex < 0
    || fromIndex >= next.length
    || toIndex >= next.length
    || fromIndex === toIndex
  ) {
    return next
  }

  const [moving] = next.splice(fromIndex, 1)
  if (!moving) return next
  next.splice(toIndex, 0, moving)
  return next
}

/** 跨区域拖动时交换两个槽位，确保八个入口始终全局唯一。 */
export function swapFeatureAcrossSlots(
  sourceSlots: readonly FeatureId[],
  sourceIndex: number,
  targetSlots: readonly FeatureId[],
  targetIndex: number,
): { source: FeatureId[]; target: FeatureId[] } {
  const source = [...sourceSlots]
  const target = [...targetSlots]
  if (
    sourceIndex < 0
    || targetIndex < 0
    || sourceIndex >= source.length
    || targetIndex >= target.length
  ) {
    return { source, target }
  }

  const moving = source[sourceIndex]
  const replaced = target[targetIndex]
  if (!moving || !replaced) return { source, target }

  source[sourceIndex] = replaced
  target[targetIndex] = moving
  return { source, target }
}

/**
 * 把功能放进底栏。首页快捷入口已下线，但服务端仍要求 5 个 homeSlots，
 * 因此功能从隐藏区移进底栏时，用被顶掉的那个功能补回它原来的位置，
 * 保证「5 + 3、全局不重复」的契约。
 */
export function placeIntoTabSlots(
  homeSlots: readonly FeatureId[],
  tabSlots: readonly FeatureId[],
  featureId: FeatureId,
  targetIndex: number,
  allFeatureIds: readonly FeatureId[],
): { homeSlots: FeatureId[]; tabSlots: FeatureId[] } | null {
  const home = [...homeSlots]
  const tab = [...tabSlots]
  if (targetIndex < 0 || targetIndex >= tab.length) return null

  const displaced = tab[targetIndex]
  if (displaced === featureId) return null
  tab[targetIndex] = featureId

  const homeIndex = home.indexOf(featureId)
  if (homeIndex < 0) return { homeSlots: home, tabSlots: tab }

  if (displaced && !home.includes(displaced)) {
    home[homeIndex] = displaced
    return { homeSlots: home, tabSlots: tab }
  }

  const filler = allFeatureIds.find(
    (id) => id !== featureId && !home.includes(id) && !tab.includes(id),
  )
  if (!filler) return null
  home[homeIndex] = filler
  return { homeSlots: home, tabSlots: tab }
}
