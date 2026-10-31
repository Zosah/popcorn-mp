import { describe, expect, it } from 'vitest'

import {
  JournalGatewayError,
  getJournalErrorMessage,
} from '../../src/services/journal-gateway'

describe('生活记录错误文案', () => {
  it('把网络失败映射为明确的可重试提示', () => {
    expect(getJournalErrorMessage(
      new JournalGatewayError('NETWORK_ERROR', 'request:fail timeout'),
      '这条记录暂时没有加载出来',
    )).toBe('网络不太稳定，请稍后再试')
  })

  it('对版本冲突提示刷新后重试', () => {
    expect(getJournalErrorMessage(
      new JournalGatewayError('VERSION_CONFLICT', '版本不一致'),
      '保存失败',
    )).toBe('记录已在别处更新，请刷新后再试')
  })

  it('非网关错误使用页面提供的兜底文案', () => {
    expect(getJournalErrorMessage(new Error('unknown'), '这条记录暂时没有加载出来'))
      .toBe('这条记录暂时没有加载出来')
  })
})
