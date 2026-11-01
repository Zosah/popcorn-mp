/** 首屏没有缓存时，至少展示一小段 loading，避免一闪而过。 */
export async function waitForMinimumLoading(
  startedAt: number,
  minimumMs = 500,
): Promise<void> {
  const remaining = minimumMs - (Date.now() - startedAt)
  if (remaining <= 0) return
  await new Promise<void>((resolve) => setTimeout(resolve, remaining))
}
