import { clearApiSession, readApiToken } from '../stores/session'

const AUTH_PAGE_ROUTE = 'pages/auth/index'
let handledToken = ''

/**
 * 统一处理“已登录请求”收到的 401。
 *
 * 只处理仍在使用当前本地 Token 的请求，避免旧请求迟到的 401 把刚建立的
 * 新会话清掉；并发 401 也只有第一个会触发提示和页面跳转。
 */
export function handleApiUnauthorized(failedToken: string): void {
  const token = failedToken.trim()
  if (!token || readApiToken() !== token) return

  clearApiSession()
  if (handledToken === token) return
  handledToken = token

  const pages = getCurrentPages()
  const currentRoute = pages[pages.length - 1]?.route ?? ''
  if (currentRoute === AUTH_PAGE_ROUTE) return

  wx.showToast({
    title: '登录已失效，请重新登录',
    icon: 'none',
  })
  wx.navigateTo({
    url: '/pages/auth/index?mode=login&reason=session-expired',
    fail() {
      wx.redirectTo({
        url: '/pages/auth/index?mode=login&reason=session-expired',
      })
    },
  })
}
