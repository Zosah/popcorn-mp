/**
 * 兼容旧调用点：不再强制展示固定时长的 loading。
 * 页面有缓存时直接回显，真实网络加载时由页面自身的 loading 状态负责。
 */
export async function waitForMinimumLoading(
  _startedAt: number,
  _minimumMs = 0,
): Promise<void> {
  return
}
