export interface AppRootPageLike {
  route?: string
  options?: Record<string, string | undefined>
}

export type AppRootNavigationPlan =
  | { action: 'scroll-top' }
  | { action: 'relaunch'; url: string }

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
): AppRootNavigationPlan {
  const { normalizedUrl, path, query } = parseUrl(url)
  const currentPage = pages[pages.length - 1]
  if (currentPage && pageMatches(currentPage, path, query)) {
    return { action: 'scroll-top' }
  }

  // 根页面之间是平级切换，不再压入页面栈。
  // reLaunch 不会把旧页面和旧底栏留在新页面下面，避免切页时出现双层叠加。
  return { action: 'relaunch', url: normalizedUrl }
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

  wx.reLaunch({
    url: plan.url,
    success: () => onSettled?.(true),
    fail: () => onSettled?.(false),
  })
}
