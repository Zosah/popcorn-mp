import { describe, expect, it } from 'vitest'

import {
  beginMenuCooking,
  buildMenuCookingSteps,
  completeCurrentMenuStep,
  cookingElapsedSeconds,
  cookingProgressPercent,
  createMenuCookingSession,
  formatCookingElapsed,
  normalizeMenuCookingSession,
} from '../../src/domain/menu-cooking'

const stepIds = ['step-1', 'step-2', 'step-3']
const steps = stepIds.map((id, index) => ({
  id,
  title: `步骤 ${index + 1}`,
  description: `说明 ${index + 1}`,
}))

describe('菜单做菜会话', () => {
  it('创建时停留在备菜阶段', () => {
    const session = createMenuCookingSession('recipe-1', stepIds, 1000)

    expect(session.stage).toBe('prep')
    expect(session.currentStepIndex).toBe(0)
    expect(session.completedStepIds).toEqual([])
    expect(session.startedAt).toBeNull()
  })

  it('开始后记录开始时间，重复开始不重置计时', () => {
    const prep = createMenuCookingSession('recipe-1', stepIds, 1000)
    const cooking = beginMenuCooking(prep, 2000)
    const resumed = beginMenuCooking(cooking, 3000)

    expect(cooking.stage).toBe('cooking')
    expect(cooking.startedAt).toBe(2000)
    expect(resumed.startedAt).toBe(2000)
  })

  it('按顺序完成步骤，最后一步完成后进入完成态', () => {
    let session = beginMenuCooking(createMenuCookingSession('recipe-1', stepIds, 1000), 2000)
    session = completeCurrentMenuStep(session, 3000)
    expect(session.currentStepIndex).toBe(1)
    expect(session.completedStepIds).toEqual(['step-1'])

    session = completeCurrentMenuStep(session, 4000)
    session = completeCurrentMenuStep(session, 5000)
    expect(session.stage).toBe('done')
    expect(session.completedStepIds).toEqual(stepIds)
    expect(session.completedAt).toBe(5000)
  })

  it('菜谱步骤变化时丢弃旧会话', () => {
    const oldSession = beginMenuCooking(createMenuCookingSession('recipe-1', stepIds, 1000), 2000)
    const restored = normalizeMenuCookingSession(
      oldSession,
      'recipe-1',
      ['step-1', 'step-2'],
      3000,
    )

    expect(restored.stage).toBe('prep')
    expect(restored.stepIds).toEqual(['step-1', 'step-2'])
  })

  it('恢复会话时过滤未知步骤并补齐完成态', () => {
    const restored = normalizeMenuCookingSession({
      version: 1,
      recipeId: 'recipe-1',
      stepIds,
      stage: 'cooking',
      currentStepIndex: 1,
      completedStepIds: ['step-1', 'unknown'],
      startedAt: 1000,
      completedAt: null,
      updatedAt: 2000,
    }, 'recipe-1', stepIds, 3000)

    expect(restored.stage).toBe('cooking')
    expect(restored.completedStepIds).toEqual(['step-1'])
    expect(restored.currentStepIndex).toBe(1)
  })

  it('生成步骤状态并计算进度', () => {
    let session = beginMenuCooking(createMenuCookingSession('recipe-1', stepIds, 1000), 2000)
    session = completeCurrentMenuStep(session, 3000)

    const views = buildMenuCookingSteps(steps, session, 1)
    expect(views.map((item) => item.state)).toEqual(['done', 'current', 'upcoming'])
    expect(cookingProgressPercent(session)).toBe(33)
  })

  it('格式化计时并在完成后停止增长', () => {
    let session = beginMenuCooking(createMenuCookingSession('recipe-1', stepIds, 1000), 2000)
    expect(cookingElapsedSeconds(session, 62000)).toBe(60)
    expect(formatCookingElapsed(60)).toBe('01:00')
    expect(formatCookingElapsed(3661)).toBe('01:01:01')

    session = { ...session, stage: 'done', completedAt: 65000 }
    expect(cookingElapsedSeconds(session, 90000)).toBe(63)
  })
})
