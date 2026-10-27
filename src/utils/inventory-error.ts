const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHENTICATED: '登录状态已失效，请回到「我的」重新登录',
  NO_ACTIVE_SPACE: '还没有可用的共同空间，请先完成空间设置',
  NETWORK_ERROR: '网络好像走神了，请稍后再试',
  VERSION_CONFLICT: '这件物品刚被更新，请刷新后再试',
  NOT_FOUND: '这件物品已经不在了',
  TOO_MANY_PAGES: '库存数据较多，请增加筛选条件后再试',
}

interface ErrorLike {
  code?: unknown
  message?: unknown
}

/** 将接口错误转换成适合直接展示给用户的短提示。 */
export function getInventoryErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (!error || typeof error !== 'object') return fallback
  const value = error as ErrorLike
  const code = typeof value.code === 'string' ? value.code : ''
  const stableMessage = ERROR_MESSAGES[code]
  if (stableMessage) return stableMessage
  const message = typeof value.message === 'string' ? value.message.trim() : ''
  if (!message) return fallback
  if (/^request:fail/i.test(message)) return '网络好像走神了，请稍后再试'
  return message
}
