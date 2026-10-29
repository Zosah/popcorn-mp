export function openAppRoot(url: string): void {
  const normalizedUrl = url.startsWith('/') ? url : `/${url}`
  const [rawPath = '', query = ''] = normalizedUrl.replace(/^\//, '').split('?')
  const pages = getCurrentPages()
  const currentRoute = pages[pages.length - 1]?.route ?? ''

  if (currentRoute === rawPath && !query) {
    wx.pageScrollTo({ scrollTop: 0, duration: 0 })
    return
  }

  wx.reLaunch({ url: normalizedUrl })
}
