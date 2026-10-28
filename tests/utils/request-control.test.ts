import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDebouncer, createRequestGate } from '../../src/utils/request-control'

afterEach(() => {
  vi.useRealTimers()
})

describe('createRequestGate', () => {
  it('只认可最后一次请求', () => {
    const gate = createRequestGate()
    const first = gate.begin()
    const second = gate.begin()

    expect(gate.isCurrent(first)).toBe(false)
    expect(gate.isCurrent(second)).toBe(true)
  })

  it('失效后拒绝之前尚未返回的请求', () => {
    const gate = createRequestGate()
    const pending = gate.begin()

    gate.invalidate()

    expect(gate.isCurrent(pending)).toBe(false)
  })
})

describe('createDebouncer', () => {
  it('只执行等待窗口内最后一次任务', () => {
    vi.useFakeTimers()
    const debouncer = createDebouncer(300)
    const first = vi.fn()
    const second = vi.fn()

    debouncer.schedule(first)
    vi.advanceTimersByTime(200)
    debouncer.schedule(second)
    vi.advanceTimersByTime(299)

    expect(first).not.toHaveBeenCalled()
    expect(second).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()
  })

  it('取消后不再执行任务', () => {
    vi.useFakeTimers()
    const debouncer = createDebouncer(300)
    const task = vi.fn()

    debouncer.schedule(task)
    debouncer.cancel()
    vi.runAllTimers()

    expect(task).not.toHaveBeenCalled()
  })
})
