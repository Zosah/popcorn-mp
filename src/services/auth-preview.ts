import { getAuthState } from './auth'

interface AuthGateSnapshot {
  visible: boolean
  force: boolean
}

let dismissedForSession = false
let visible = false
let force = false
const listeners = new Set<(snapshot: AuthGateSnapshot) => void>()

function snapshot(): AuthGateSnapshot {
  return { visible, force }
}

function emit(): void {
  const current = snapshot()
  for (const listener of listeners) listener(current)
}

export function subscribeAuthGate(
  listener: (snapshot: AuthGateSnapshot) => void,
): () => void {
  listeners.add(listener)
  listener(snapshot())
  return () => listeners.delete(listener)
}

/** 进入根页面时调用；用户本次会话收起过就不再主动打扰。 */
export function promptAuthGateIfNeeded(): void {
  if (getAuthState().isLoggedIn) {
    hideAuthGate()
    return
  }
  if (dismissedForSession) return
  visible = true
  force = false
  emit()
}

/** 写操作前调用。即使用户收起过预览提示，也会再次提醒。 */
export function requireAuthForWrite(): boolean {
  if (getAuthState().isLoggedIn) return true
  visible = true
  force = true
  emit()
  return false
}

export function dismissAuthGate(): void {
  dismissedForSession = true
  visible = false
  force = false
  emit()
}

export function hideAuthGate(): void {
  visible = false
  force = false
  emit()
}

/** 登录成功后重置，保证以后退出登录还会重新提示。 */
export function resetAuthPreviewSession(): void {
  dismissedForSession = false
  visible = false
  force = false
  emit()
}

export function getAuthGateSnapshot(): AuthGateSnapshot {
  return snapshot()
}
