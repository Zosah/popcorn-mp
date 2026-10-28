export interface RequestGate {
  begin(): number
  isCurrent(sequence: number): boolean
  invalidate(): void
}

export interface Debouncer {
  schedule(task: () => void): void
  cancel(): void
}

/**
 * 页面级请求闸门：只允许最后一次发起的请求写入页面状态。
 * 写入操作开始前可调用 invalidate，避免尚未返回的旧查询覆盖新数据。
 */
export function createRequestGate(): RequestGate {
  let currentSequence = 0

  return {
    begin() {
      currentSequence += 1
      return currentSequence
    },
    isCurrent(sequence) {
      return sequence === currentSequence
    },
    invalidate() {
      currentSequence += 1
    },
  }
}

export function createDebouncer(delayMs = 300): Debouncer {
  let timer: ReturnType<typeof setTimeout> | null = null

  return {
    schedule(task) {
      if (timer !== null) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        task()
      }, delayMs)
    },
    cancel() {
      if (timer === null) return
      clearTimeout(timer)
      timer = null
    },
  }
}
