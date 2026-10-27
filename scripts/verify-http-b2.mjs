// 连接已开启自动化端口的微信开发者工具，验证 B1/B2 的真实 HTTP 页面链路。
// 前提：env.ts 已切换为 local + HTTP + mock 登录，且本地 API 可访问。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const runtimeErrors = []
const suffix = Date.now().toString().slice(-10)
const ownerIdentity = `uio${suffix}`
const memberIdentity = `uim${suffix}`
const ownerNickname = `B2房主${suffix.slice(-4)}`
const memberNickname = `B2成员${suffix.slice(-4)}`
const renamedSpace = `B2 验收空间 ${suffix.slice(-4)}`

miniProgram.on('console', (message) => {
  if (message.type === 'error') {
    runtimeErrors.push(`console: ${message.args?.join(' ')}`)
  }
})
miniProgram.on('exception', (error) => {
  runtimeErrors.push(`exception: ${error.message ?? String(error)}`)
})

async function open(url) {
  const page = await miniProgram.reLaunch(url)
  await wait(700)
  if (!page) throw new Error(`页面打开失败：${url}`)
  return page
}

async function go(url) {
  const page = await miniProgram.navigateTo(url)
  await wait(700)
  if (!page) throw new Error(`页面跳转失败：${url}`)
  return page
}

async function waitFor(check, label, timeoutMs = 12000) {
  const startedAt = Date.now()
  let lastValue
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await check()
    if (lastValue) return lastValue
    await wait(250)
  }
  throw new Error(`等待超时：${label}，最后状态：${JSON.stringify(lastValue)}`)
}

async function clearApiSession() {
  await miniProgram.callWxMethod('removeStorageSync', 'popcorn_api_auth_token_v1')
  await miniProgram.callWxMethod('removeStorageSync', 'popcorn_api_auth_session_v1')
}

async function registerApiUser(identity, nickname, tone) {
  await clearApiSession()
  await miniProgram.callWxMethod(
    'setStorageSync',
    'popcorn_api_mock_identity_v1',
    identity,
  )
  let page = await open('/pages/auth/index')
  await waitFor(async () => (await page.data()).mode === 'login', '登录页就绪')
  await page.callMethod('onWechatLogin')
  page = await miniProgram.currentPage()
  await waitFor(async () => (await page.data()).mode === 'register', '资料完善页')
  await page.setData({
    nicknameInput: nickname,
    nicknamePreview: nickname.slice(0, 1),
    selectedTone: tone,
  })
  await page.callMethod('onSubmitProfile')
  await wait(1200)

  const session = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_api_auth_session_v1',
  )
  assert.equal(session.user.nickname, nickname)
  assert.equal(session.onboardingRequired, false)
  return session
}

try {
  const ownerSession = await registerApiUser(ownerIdentity, ownerNickname, 'mint')
  console.log('PASS HTTP 新用户注册与会话落盘')

  let page = await open('/pages/space/index')
  await waitFor(async () => {
    const data = await page.data()
    return !data.isLoading && data.isDemoMode === false && data.isLoggedIn
      ? data
      : false
  }, '空间详情加载')
  let data = await page.data()
  assert.equal(data.spaceId, ownerSession.activeSpaceId)
  assert.equal(data.isOwner, true)
  assert.equal(data.memberCount, 1)
  assert.equal(data.members[0].nickname, ownerNickname)
  console.log('PASS HTTP 空间详情与成员列表')

  await page.callMethod('renameApiSpace', renamedSpace)
  await waitFor(async () => (await page.data()).spaceName === renamedSpace, '空间重命名')
  console.log('PASS HTTP 空间重命名')

  await page.callMethod('onRefreshInvite')
  data = await waitFor(async () => {
    const next = await page.data()
    return next.inviteCode?.length === 10 ? next : false
  }, '邀请码创建')
  const inviteCode = data.inviteCode
  assert.match(inviteCode, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/)
  console.log('PASS HTTP owner 创建一次性邀请码')

  page = await go(`/pages/invite/index?code=${inviteCode}`)
  data = await waitFor(async () => {
    const next = await page.data()
    return next.status === 'available' ? next : false
  }, '邀请码预览')
  assert.equal(data.spaceName, renamedSpace)
  assert.equal(data.inviterName, ownerNickname)
  assert.equal(data.canAccept, true)
  console.log('PASS HTTP 邀请码公开预览')

  await clearApiSession()
  const memberSession = await registerApiUser(memberIdentity, memberNickname, 'peach')
  page = await open(`/pages/invite/index?code=${inviteCode}`)
  await waitFor(async () => (await page.data()).status === 'available', '成员预览邀请')
  await page.callMethod('onAccept')
  data = await waitFor(async () => {
    const next = await page.data()
    return next.status === 'accepted' ? next : false
  }, '接受邀请')
  assert.equal(data.spaceName, renamedSpace)
  assert.equal(data.canAccept, false)

  const joinedSession = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_api_auth_session_v1',
  )
  assert.equal(joinedSession.user.id, memberSession.user.id)
  const joinedSpace = joinedSession.spaces.find((space) => space.id === ownerSession.activeSpaceId)
  assert.ok(joinedSpace, '接受邀请后会话应包含共同空间')
  assert.equal(joinedSpace.name, renamedSpace)
  assert.equal(joinedSpace.role, 'member')
  console.log('PASS HTTP 第二个用户接受邀请并刷新会话')

  page = await open(`/pages/invite/index?code=${inviteCode}`)
  await waitFor(async () => (await page.data()).status === 'used', '单次邀请码失效')
  console.log('PASS HTTP 邀请码只能使用一次')

  assert.deepEqual(runtimeErrors, [])
  console.log('B2 HTTP RUNTIME VERIFICATION PASSED')
} finally {
  await miniProgram.disconnect()
}
