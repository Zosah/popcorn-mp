import { describe, expect, it } from 'vitest'

import {
  buildDemoAvatarText,
  createDemoUserProfile,
  normalizeDemoNickname,
  validateDemoNickname,
} from '../../src/domain/demo-auth'

describe('Demo 账号资料', () => {
  it('昵称会去掉首尾空格并合并连续空白', () => {
    expect(normalizeDemoNickname('  小  满  ')).toBe('小 满')
  })

  it('昵称不能为空且最多十六个字符', () => {
    expect(validateDemoNickname('   ')).toBe('给自己取一个名字吧')
    expect(validateDemoNickname('一二三四五六七八九十一二三四五六七')).toBe(
      '名字最多 16 个字符',
    )
    expect(validateDemoNickname('小满')).toBe('')
  })

  it('头像文字取昵称首字，英文转为大写', () => {
    expect(buildDemoAvatarText('小满')).toBe('小')
    expect(buildDemoAvatarText('momo')).toBe('M')
    expect(buildDemoAvatarText('')).toBe('时')
  })

  it('创建资料时生成稳定可识别的本机账号', () => {
    const user = createDemoUserProfile(
      { nickname: ' 小满 ', avatarTone: 'mint' },
      { nowMs: 1_700_000_000_000, random: () => 0.5 },
    )

    expect(user).toMatchObject({
      nickname: '小满',
      avatarTone: 'mint',
      createdAt: '2023-11-14T22:13:20.000Z',
    })
    expect(user.id).toMatch(/^demo-user-/)
  })
})
