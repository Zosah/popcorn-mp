// 连接已开启自动化端口的微信开发者工具，验证 B1/B2 的真实 HTTP 页面链路。
// 前提：env.ts 已切换为 local + HTTP + mock 登录，且本地 API 可访问。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const miniProgram = await automator.connect({ wsEndpoint })
console.log('B2 automator connected')
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

async function readCurrentPage() {
  try {
    const page = await miniProgram.currentPage()
    if (!page) return null
    return { page, data: await page.data() }
  } catch (error) {
    if (String(error).includes('page destroyed')) return null
    throw error
  }
}

// 页面跳转期间 automator 可能仍持有旧句柄；始终从 currentPage() 重新取页面。
async function waitForPage(check, label, timeoutMs = 12000) {
  const startedAt = Date.now()
  let lastValue
  while (Date.now() - startedAt < timeoutMs) {
    const current = await readCurrentPage()
    if (current) {
      lastValue = await check(current.data)
      if (lastValue) return { page: current.page, data: lastValue }
    }
    await wait(250)
  }
  throw new Error(`等待超时：${label}，最后状态：${JSON.stringify(lastValue)}`)
}

async function callMethodIgnoringDestroyed(page, method) {
  try {
    await page.callMethod(method)
  } catch (error) {
    if (!String(error).includes('page destroyed')) throw error
  }
}

async function clearApiSession() {
  await miniProgram.callWxMethod('removeStorageSync', 'popcorn_api_auth_token_v1')
  await miniProgram.callWxMethod('removeStorageSync', 'popcorn_api_auth_session_v1')
}

async function registerApiUser(identity, nickname, tone) {
  console.log(`B2 register ${nickname}`)
  await clearApiSession()
  console.log('B2 session cleared')
  await miniProgram.callWxMethod(
    'setStorageSync',
    'popcorn_api_mock_identity_v1',
    identity,
  )
  let page = await open('/pages/auth/index')
  console.log('B2 auth opened')
  const login = await waitForPage(
    (data) => (data.mode === 'login' ? data : false),
    '登录页就绪',
  )
  page = login.page
  console.log('B2 auth ready')
  await callMethodIgnoringDestroyed(page, 'onWechatLogin')
  console.log('B2 login submitted')
  const register = await waitForPage(
    (data) => (data.mode === 'register' ? data : false),
    '资料完善页',
  )
  page = register.page
  console.log('B2 register ready')
  await page.setData({
    nicknameInput: nickname,
    nicknamePreview: nickname.slice(0, 1),
    selectedTone: tone,
  })
  await callMethodIgnoringDestroyed(page, 'onSubmitProfile')
  console.log('B2 profile submitted')
  await wait(1200)

  const session = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_api_auth_session_v1',
  )
  assert.equal(session.user.nickname, nickname)
  assert.equal(session.onboardingRequired, false)
  return session
}

async function readApiToken() {
  return miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_api_auth_token_v1',
  )
}

async function apiStatus(path, token) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: path.endsWith('/members/me') ? 'DELETE' : 'GET',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  return response.status
}

try {
  const ownerSession = await registerApiUser(ownerIdentity, ownerNickname, 'mint')
  const ownerToken = await readApiToken()
  console.log('PASS HTTP 新用户注册与会话落盘')

  let page = await open('/pages/space/index')
  let snapshot = await waitForPage((next) => (
    !next.isLoading && next.isDemoMode === false && next.isLoggedIn
      ? next
      : false
  ), '空间详情加载')
  page = snapshot.page
  let data = snapshot.data
  assert.equal(data.spaceId, ownerSession.activeSpaceId)
  assert.equal(data.isOwner, true)
  assert.equal(data.memberCount, 1)
  assert.equal(data.members[0].nickname, ownerNickname)
  assert.equal(data.canLeaveSpace, false)
  console.log('PASS HTTP 空间详情与成员列表')

  assert.equal(
    await apiStatus(`/spaces/${encodeURIComponent(ownerSession.activeSpaceId)}/members/me`, ownerToken),
    403,
  )
  console.log('PASS HTTP 创建者不能退出自己的空间')

  await page.callMethod('renameApiSpace', renamedSpace)
  snapshot = await waitForPage(
    (next) => (next.spaceName === renamedSpace ? next : false),
    '空间重命名',
  )
  page = snapshot.page
  console.log('PASS HTTP 空间重命名')

  await page.callMethod('onRefreshInvite')
  snapshot = await waitForPage(
    (next) => (next.inviteCode?.length === 10 ? next : false),
    '邀请码创建',
  )
  page = snapshot.page
  data = snapshot.data
  const inviteCode = data.inviteCode
  assert.match(inviteCode, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/)
  console.log('PASS HTTP owner 创建一次性邀请码')

  page = await go(`/pages/invite/index?code=${inviteCode}`)
  snapshot = await waitForPage(
    (next) => (next.status === 'available' ? next : false),
    '邀请码预览',
  )
  page = snapshot.page
  data = snapshot.data
  assert.equal(data.spaceName, renamedSpace)
  assert.equal(data.inviterName, ownerNickname)
  assert.equal(data.canAccept, true)
  console.log('PASS HTTP 邀请码公开预览')

  await clearApiSession()
  const memberSession = await registerApiUser(memberIdentity, memberNickname, 'peach')
  const memberToken = await readApiToken()
  page = await open(`/pages/invite/index?code=${inviteCode}`)
  snapshot = await waitForPage(
    (next) => (next.status === 'available' ? next : false),
    '成员预览邀请',
  )
  page = snapshot.page
  await page.callMethod('onAccept')
  snapshot = await waitForPage(
    (next) => (next.status === 'accepted' ? next : false),
    '接受邀请',
  )
  page = snapshot.page
  data = snapshot.data
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

  assert.equal(
    await apiStatus(`/spaces/${encodeURIComponent(ownerSession.activeSpaceId)}`, memberToken),
    200,
  )
  assert.equal(await apiStatus('/spaces/s_notexists0', memberToken), 404)
  console.log('PASS HTTP 成员空间权限与越权隔离')

  page = await open(`/pages/invite/index?code=${inviteCode}`)
  snapshot = await waitForPage(
    (next) => (next.status === 'used' ? next : false),
    '单次邀请码失效',
  )
  page = snapshot.page
  console.log('PASS HTTP 邀请码只能使用一次')

  page = await open('/pages/space/index')
  snapshot = await waitForPage(
    (next) => (
      !next.isLoading && next.spaceId === ownerSession.activeSpaceId
        ? next
        : false
    ),
    '成员空间详情',
  )
  page = snapshot.page
  data = snapshot.data
  assert.equal(data.canLeaveSpace, true)
  // reLaunch 会主动销毁当前页面，automator 可能因此返回 page destroyed；
  // 以本地会话是否已切换为权威结果。
  await callMethodIgnoringDestroyed(page, 'leaveCurrentSpace')
  const leftSession = await waitFor(async () => {
    const next = await miniProgram.callWxMethod(
      'getStorageSync',
      'popcorn_api_auth_session_v1',
    )
    return next?.activeSpaceId && next.activeSpaceId !== ownerSession.activeSpaceId
      ? next
      : false
  }, '退出空间后刷新会话')
  assert.equal(
    leftSession.spaces.some((space) => space.id === ownerSession.activeSpaceId),
    false,
  )
  assert.equal(
    await apiStatus(`/spaces/${encodeURIComponent(ownerSession.activeSpaceId)}`, memberToken),
    404,
  )
  console.log('PASS HTTP 成员退出空间并恢复个人空间')

  assert.deepEqual(runtimeErrors, [])
  console.log('B2 HTTP RUNTIME VERIFICATION PASSED')
} finally {
  await miniProgram.disconnect()
}
