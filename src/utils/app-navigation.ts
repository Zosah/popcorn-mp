export interface AppRootPageLike {
  route?: string
  options?: Record<string, string | undefined>
}

export type AppRootNavigationPlan =
  | { action: 'scroll-top' }
  | { action: 'back'; delta: number }
  | { action: 'open'; method: 'navigateTo' | 'redirectTo'; url: string }

function decodeQueryValue(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

function parseUrl(url: string): {
  normalizedUrl: string
  path: string
  query: Record<string, string>
} {
  const normalizedUrl = url.startsWith('/') ? url : `/${url}`
  const [path = '', queryString = ''] = normalizedUrl.replace(/^\//, '').split('?')
  const query: Record<string, string> = {}
  for (const pair of queryString.split('&')) {
    if (!pair) continue
    const [rawKey, rawValue = ''] = pair.split('=')
    if (!rawKey) continue
    query[decodeQueryValue(rawKey)] = decodeQueryValue(rawValue)
  }
  return { normalizedUrl, path, query }
}

function pageMatches(
  page: AppRootPageLike,
  path: string,
  query: Record<string, string>,
): boolean {
  if (page.route !== path) return false
  const pageQuery = page.options ?? {}
  const targetKeys = Object.keys(query).sort()
  const pageKeys = Object.keys(pageQuery).sort()
  if (targetKeys.length !== pageKeys.length) return false
  return targetKeys.every((key) => pageQuery[key] === query[key])
}

export function resolveAppRootNavigation(
  pages: readonly AppRootPageLike[],
  url: string,
  maxStackDepth = 8,
): AppRootNavigationPlan {
  const { normalizedUrl, path, query } = parseUrl(url)
  const currentPage = pages[pages.length - 1]
  if (currentPage && pageMatches(currentPage, path, query)) {
    return { action: 'scroll-top' }
  }

  const cachedIndex = pages.findIndex(
    (page, index) => index < pages.length - 1 && pageMatches(page, path, query),
  )
  if (cachedIndex >= 0) {
    return { action: 'back', delta: pages.length - 1 - cachedIndex }
  }

  return {
    action: 'open',
    method: pages.length >= maxStackDepth ? 'redirectTo' : 'navigateTo',
    url: normalizedUrl,
  }
}

export function openAppRoot(
  url: string,
  onSettled?: (ok: boolean) => void,
): void {
  const plan = resolveAppRootNavigation(getCurrentPages(), url)

  if (plan.action === 'scroll-top') {
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    onSettled?.(true)
    return
  }

  if (plan.action === 'back') {
    wx.navigateBack({
      delta: plan.delta,
      success: () => onSettled?.(true),
      fail: () => onSettled?.(false),
    })
    return
  }

  const options = {
    url: plan.url,
    success: () => onSettled?.(true),
    fail: () => onSettled?.(false),
  }
  if (plan.method === 'redirectTo') {
    wx.redirectTo(options)
    return
  }
  wx.navigateTo(options)
}
