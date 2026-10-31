/** 做菜会话只保存在本机，用于离开页面后继续当前菜谱流程。 */
export const MENU_COOKING_SESSION_VERSION = 1

export type MenuCookingStage = 'prep' | 'cooking' | 'done'

export interface MenuCookingSession {
  version: typeof MENU_COOKING_SESSION_VERSION
  recipeId: string
  stepIds: string[]
  stage: MenuCookingStage
  currentStepIndex: number
  completedStepIds: string[]
  startedAt: number | null
  completedAt: number | null
  updatedAt: number
}

export interface MenuCookingStepSource {
  id: string
  title: string
  description: string
}

export interface MenuCookingStepView extends MenuCookingStepSource {
  stepNumber: number
  state: 'done' | 'current' | 'upcoming'
}

export function createMenuCookingSession(
  recipeId: string,
  stepIds: string[],
  now = Date.now(),
): MenuCookingSession {
  const normalizedStepIds = uniqueNonEmpty(stepIds)
  return {
    version: MENU_COOKING_SESSION_VERSION,
    recipeId,
    stepIds: normalizedStepIds,
    stage: 'prep',
    currentStepIndex: 0,
    completedStepIds: [],
    startedAt: null,
    completedAt: null,
    updatedAt: now,
  }
}

/**
 * 恢复本机会话时重新校验菜谱与步骤，避免菜谱编辑后继续使用过期进度。
 */
export function normalizeMenuCookingSession(
  value: unknown,
  recipeId: string,
  stepIds: string[],
  now = Date.now(),
): MenuCookingSession {
  const normalizedStepIds = uniqueNonEmpty(stepIds)
  if (!isRecord(value)
    || value.version !== MENU_COOKING_SESSION_VERSION
    || value.recipeId !== recipeId
    || !sameStringArray(value.stepIds, normalizedStepIds)) {
    return createMenuCookingSession(recipeId, normalizedStepIds, now)
  }

  const knownStepIds = new Set(normalizedStepIds)
  const completedStepIds = Array.isArray(value.completedStepIds)
    ? uniqueNonEmpty(value.completedStepIds.filter(
        (item): item is string => typeof item === 'string',
      )).filter((item) => knownStepIds.has(item))
    : []
  const stage = parseStage(value.stage)
  const startedAt = parseTimestamp(value.startedAt)
  const completedAt = parseTimestamp(value.completedAt)
  const currentStepIndex = firstIncompleteIndex(normalizedStepIds, completedStepIds)
  const allCompleted = normalizedStepIds.length > 0 && currentStepIndex >= normalizedStepIds.length

  if (stage === 'done' || allCompleted) {
    return {
      version: MENU_COOKING_SESSION_VERSION,
      recipeId,
      stepIds: normalizedStepIds,
      stage: 'done',
      currentStepIndex: normalizedStepIds.length,
      completedStepIds: [...normalizedStepIds],
      startedAt: startedAt ?? now,
      completedAt: completedAt ?? now,
      updatedAt: now,
    }
  }

  if (stage === 'cooking') {
    return {
      version: MENU_COOKING_SESSION_VERSION,
      recipeId,
      stepIds: normalizedStepIds,
      stage: 'cooking',
      currentStepIndex,
      completedStepIds,
      startedAt: startedAt ?? now,
      completedAt: null,
      updatedAt: now,
    }
  }

  return createMenuCookingSession(recipeId, normalizedStepIds, now)
}

export function beginMenuCooking(
  session: MenuCookingSession,
  now = Date.now(),
): MenuCookingSession {
  return {
    ...session,
    stage: 'cooking',
    startedAt: session.startedAt ?? now,
    completedAt: null,
    updatedAt: now,
  }
}

export function completeCurrentMenuStep(
  session: MenuCookingSession,
  now = Date.now(),
): MenuCookingSession {
  if (session.stage !== 'cooking') return session
  const currentStepId = session.stepIds[session.currentStepIndex]
  if (!currentStepId) return session

  const completedStepIds = uniqueNonEmpty([...session.completedStepIds, currentStepId])
  const currentStepIndex = firstIncompleteIndex(session.stepIds, completedStepIds)
  const isDone = currentStepIndex >= session.stepIds.length
  return {
    ...session,
    stage: isDone ? 'done' : 'cooking',
    currentStepIndex,
    completedStepIds,
    completedAt: isDone ? now : null,
    updatedAt: now,
  }
}

export function buildMenuCookingSteps(
  steps: MenuCookingStepSource[],
  session: MenuCookingSession,
  viewStepIndex: number,
): MenuCookingStepView[] {
  const completed = new Set(session.completedStepIds)
  const activeIndex = normalizeStepIndex(viewStepIndex, steps.length)
  return steps.map((step, index) => ({
    id: step.id,
    title: step.title,
    description: step.description,
    stepNumber: index + 1,
    state: completed.has(step.id)
      ? 'done'
      : index === activeIndex
        ? 'current'
        : 'upcoming',
  }))
}

export function cookingProgressPercent(session: MenuCookingSession): number {
  if (!session.stepIds.length) return 0
  return Math.round((session.completedStepIds.length / session.stepIds.length) * 100)
}

export function cookingElapsedSeconds(
  session: MenuCookingSession,
  now = Date.now(),
): number {
  if (!session.startedAt) return 0
  const end = session.completedAt ?? now
  return Math.max(0, Math.floor((end - session.startedAt) / 1000))
}

export function formatCookingElapsed(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const seconds = safeSeconds % 60
  const parts = [minutes, seconds].map((value) => String(value).padStart(2, '0'))
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${parts.join(':')}` : parts.join(':')
}

export function normalizeCookingStepIndex(index: number, stepCount: number): number {
  if (!Number.isInteger(index) || stepCount <= 0) return 0
  return Math.min(stepCount - 1, Math.max(0, index))
}

function firstIncompleteIndex(stepIds: string[], completedStepIds: string[]): number {
  const completed = new Set(completedStepIds)
  const index = stepIds.findIndex((stepId) => !completed.has(stepId))
  return index >= 0 ? index : stepIds.length
}

function normalizeStepIndex(index: number, stepCount: number): number {
  if (!Number.isInteger(index) || stepCount <= 0) return 0
  return Math.min(stepCount - 1, Math.max(0, index))
}

function parseStage(value: unknown): MenuCookingStage {
  return value === 'cooking' || value === 'done' ? value : 'prep'
}

function parseTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

function sameStringArray(value: unknown, expected: string[]): value is string[] {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((item, index) => item === expected[index])
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.filter((value) => typeof value === 'string' && value.trim()))]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
