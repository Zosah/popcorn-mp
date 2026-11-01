import { appConfig } from '../config/env'
import { getDemoAuthState } from './demo-auth'
import { readStoredApiSession } from '../stores/session'

/**
 * 根页面内存缓存。
 *
 * reLaunch 切 Tab 会销毁页面实例，所以缓存必须放在模块级，并按「用户 + 空间」
 * 隔离。默认 2 分钟内直接命中；超过后先展示旧内容，再在后台刷新。下拉刷新
 * 会强制穿透缓存。
 */
export const PAGE_CACHE_FRESH_MS = 2 * 60 * 1000
export const PAGE_CACHE_MAX_AGE_MS = 15 * 60 * 1000

interface StoredPageCacheEntry {
  value: unknown
  storedAt: number
}

export interface PageCacheResult<T> {
  value: T
  storedAt: number
  ageMs: number
  fresh: boolean
}

const pageCache = new Map<string, StoredPageCacheEntry>()
const ownerListeners = new Set<() => void>()

export function getPageCacheOwner(): string {
  if (appConfig.demoMode) {
    const auth = getDemoAuthState()
    return `demo:${auth.user?.id || 'guest'}`
  }
  const stored = readStoredApiSession()
  if (!stored) return 'guest'
  return `api:${stored.session.user.id}:${stored.session.activeSpaceId}`
}

export function buildPageCacheKey(key: string): string {
  const normalized = key.trim()
  return `${getPageCacheOwner()}::${normalized}`
}

export function readPageCache<T>(
  key: string,
  options: {
    freshForMs?: number
    maxAgeMs?: number
    now?: number
  } = {},
): PageCacheResult<T> | null {
  const storageKey = buildPageCacheKey(key)
  const entry = pageCache.get(storageKey)
  if (!entry) return null

  const now = options.now ?? Date.now()
  const ageMs = Math.max(0, now - entry.storedAt)
  const maxAgeMs = options.maxAgeMs ?? PAGE_CACHE_MAX_AGE_MS
  if (ageMs > maxAgeMs) {
    pageCache.delete(storageKey)
    return null
  }

  return {
    value: entry.value as T,
    storedAt: entry.storedAt,
    ageMs,
    fresh: ageMs <= (options.freshForMs ?? PAGE_CACHE_FRESH_MS),
  }
}

export function writePageCache<T>(
  key: string,
  value: T,
  now = Date.now(),
): void {
  pageCache.set(buildPageCacheKey(key), {
    value,
    storedAt: now,
  })
}

/** 清掉当前用户空间下的某类缓存；不传前缀则清掉当前空间全部页面缓存。 */
export function invalidatePageCache(prefix = ''): void {
  const ownerPrefix = `${getPageCacheOwner()}::`
  const targetPrefix = `${ownerPrefix}${prefix}`
  for (const key of pageCache.keys()) {
    if (key.startsWith(targetPrefix)) pageCache.delete(key)
  }
  for (const listener of ownerListeners) listener()
}

/** 退出、切换空间或清空本机数据时使用。 */
export function clearPageCache(): void {
  pageCache.clear()
  for (const listener of ownerListeners) listener()
}

export function subscribePageCacheOwner(listener: () => void): () => void {
  ownerListeners.add(listener)
  return () => ownerListeners.delete(listener)
}
