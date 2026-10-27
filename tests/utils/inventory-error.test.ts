import { describe, expect, it } from 'vitest'

import { getInventoryErrorMessage } from '../../src/utils/inventory-error'

describe('库存错误提示', () => {
  it('优先使用稳定的业务提示', () => {
    expect(getInventoryErrorMessage({ code: 'VERSION_CONFLICT' }, '兜底'))
      .toBe('这件物品刚被更新，请刷新后再试')
    expect(getInventoryErrorMessage({ code: 'UNAUTHENTICATED' }, '兜底'))
      .toBe('登录状态已失效，请回到「我的」重新登录')
  })

  it('把微信网络错误归一成用户可理解的提示', () => {
    expect(getInventoryErrorMessage({ code: 'UNKNOWN', message: 'request:fail timeout' }, '兜底'))
      .toBe('网络好像走神了，请稍后再试')
  })

  it('保留后端返回的可读文案，缺失时使用兜底', () => {
    expect(getInventoryErrorMessage({ code: 'INTERNAL', message: '服务暂时不可用' }, '兜底'))
      .toBe('服务暂时不可用')
    expect(getInventoryErrorMessage(null, '兜底')).toBe('兜底')
  })
})
