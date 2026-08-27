import { describe, expect, it } from 'vitest'

import {
  buildDemoInvitePath,
  createDemoInviteCode,
  isDemoInviteCode,
  normalizeDemoInviteCode,
  resolveDemoInvite,
} from '../../src/domain/demo-invite'

describe('Demo 邀请码', () => {
  it('统一清理空格并转换为大写', () => {
    expect(normalizeDemoInviteCode('  pop12ab3  ')).toBe('POP12AB3')
  })

  it.each(['SHIKEZAI', 'SKZ12345', 'SKZ12AB3', 'POPCORN', 'POP12345'])(
    '接受约定的邀请码格式 %s',
    (code) => {
      expect(isDemoInviteCode(code)).toBe(true)
    },
  )

  it.each(['', 'POPCOR', 'ABC12345', 'POP123456'])(
    '拒绝不符合约定的格式 %s',
    (code) => {
      expect(isDemoInviteCode(code)).toBe(false)
    },
  )

  it('区分空值、无效、可接受与已经接受', () => {
    expect(resolveDemoInvite('')).toEqual({ code: '', status: 'empty' })
    expect(resolveDemoInvite('wrong')).toEqual({
      code: 'WRONG',
      status: 'invalid',
    })
    expect(resolveDemoInvite('pop12345')).toEqual({
      code: 'POP12345',
      status: 'available',
    })
    expect(resolveDemoInvite('pop12345', ['POP12345'])).toEqual({
      code: 'POP12345',
      status: 'accepted',
    })
  })

  it('生成稳定的邀请码与分享路径', () => {
    expect(createDemoInviteCode(123)).toBe('SKZ00123')
    expect(createDemoInviteCode(987654321)).toBe('SKZ54321')
    expect(buildDemoInvitePath(' skz12ab3 ')).toBe(
      '/pages/invite/index?code=SKZ12AB3',
    )
  })
})
