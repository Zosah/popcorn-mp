export const DEMO_AVATAR_TONES = [
  'lavender',
  'mint',
  'peach',
  'sun',
] as const

export type DemoAvatarTone = (typeof DEMO_AVATAR_TONES)[number]

export const DEMO_AVATAR_OPTIONS: ReadonlyArray<{
  value: DemoAvatarTone
  label: string
}> = [
  { value: 'lavender', label: '晚霞' },
  { value: 'mint', label: '薄荷' },
  { value: 'peach', label: '蜜桃' },
  { value: 'sun', label: '日光' },
]

export interface DemoUserProfile {
  id: string
  nickname: string
  avatarTone: DemoAvatarTone
  avatarMediaId: string
  createdAt: string
}

export interface DemoUserInput {
  nickname: string
  avatarTone: DemoAvatarTone
  avatarMediaId?: string
}

export function isDemoAvatarTone(value: unknown): value is DemoAvatarTone {
  return DEMO_AVATAR_TONES.includes(value as DemoAvatarTone)
}

export function normalizeDemoNickname(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

export function validateDemoNickname(value: string): string {
  const nickname = normalizeDemoNickname(value)
  if (!nickname) return '给自己取一个名字吧'
  if (Array.from(nickname).length > 16) return '名字最多 16 个字符'
  return ''
}

export function buildDemoAvatarText(nickname: string): string {
  const [firstCharacter] = Array.from(normalizeDemoNickname(nickname))
  return firstCharacter ? firstCharacter.toUpperCase() : '时'
}

export function createDemoUserProfile(
  input: DemoUserInput,
  options: { nowMs?: number; random?: () => number } = {},
): DemoUserProfile {
  const nickname = normalizeDemoNickname(input.nickname)
  const nowMs = options.nowMs ?? Date.now()
  const random = options.random ?? Math.random
  const suffix = Math.floor(random() * 1_000_000)
    .toString(36)
    .padStart(4, '0')

  return {
    id: `demo-user-${nowMs.toString(36)}-${suffix}`,
    nickname,
    avatarTone: input.avatarTone,
    avatarMediaId: input.avatarMediaId?.trim() ?? '',
    createdAt: new Date(nowMs).toISOString(),
  }
}
