// 提醒设置真实 HTTP + 开发者工具 UI 验收。
// 前提：env.ts 为 local + HTTP + mock 登录，本地 API、SSH 隧道与自动化端口已启动。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const identityKey = 'popcorn_api_mock_identity_v1'
const suffix = Date.now().toString(36).slice(-9)
const ownerIdentity = `rmo${suffix}`
const memberIdentity = `rmm${suffix}`
const outsiderIdentity = `rmx${suffix}`
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const runtimeErrors = []

miniProgram.on('console', (message) => {
  if (message.type === 'error') {
    runtimeErrors.push(`console: ${message.args?.join(' ')}`)
  }
})
miniProgram.on('exception', (error) => {
  runtimeErrors.push(`exception: ${error.message ?? String(error)}`)
})

async function apiRaw(path, options = {}) {
  const headers = { ...(options.headers ?? {}) }
  if (options.token) headers.Authorization = `Bearer ${options.token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
  const text = await response.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  return { status: response.status, data, headers: response.headers }
}

async function apiOk(path, options = {}) {
  const result = await apiRaw(path, options)
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${result.status}: ${JSON.stringify(result.data)}`)
  }
  return result
}

async function login(identity, nickname, avatarTone) {
  const loginResult = await apiOk('/auth/mock', {
    method: 'POST',
    body: { identity, deviceLabel: '提醒设置 HTTP 验收' },
  })
  const token = loginResult.data.token
  const session = loginResult.data.onboardingRequired
    ? (await apiOk('/me', {
        method: 'PUT',
        token,
        body: { nickname, avatarTone },
      })).data
    : loginResult.data
  return { ...session, token }
}

async function setApiSession(token, session, identity) {
  await miniProgram.callWxMethod('removeStorageSync', tokenKey)
  await miniProgram.callWxMethod('removeStorageSync', sessionKey)
  await miniProgram.callWxMethod('setStorageSync', tokenKey, token)
  await miniProgram.callWxMethod('setStorageSync', sessionKey, session)
  await miniProgram.callWxMethod('setStorageSync', identityKey, identity)
}

async function open(url) {
  const page = await miniProgram.reLaunch(url)
  await wait(450)
  if (!page) throw new Error(`页面打开失败：${url}`)
  return page
}

async function waitFor(check, label, timeoutMs = 20000) {
  const startedAt = Date.now()
  let lastValue
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await check()
    if (lastValue) return lastValue
    await wait(250)
  }
  throw new Error(`等待超时：${label}，最后状态：${JSON.stringify(lastValue)}`)
}

async function screenshot(name) {
  await miniProgram.pageScrollTo(0)
  await wait(350)
  const path = `shots/reminders-http-${name}.png`
  await miniProgram.screenshot({ path })
  console.log('CAPTURE', path)
}

async function assertNoHorizontalOverflow(page, label) {
  const info = await miniProgram.systemInfo()
  const size = await page.size()
  assert.ok(
    Number(size.width) <= info.windowWidth + 1,
    `${label} 出现横向溢出：${size.width} > ${info.windowWidth}`,
  )
}

function reminderPath(spaceId) {
  return `/spaces/${encodeURIComponent(spaceId)}/reminder-settings`
}

function input(overrides = {}) {
  return {
    expiry: true,
    petCare: true,
    weeklyReview: false,
    reminderTime: '20:30',
    ...overrides,
  }
}

let owner
let member
let outsider
let utcBefore
try {
  owner = await login(ownerIdentity, `提醒房主${suffix.slice(-3)}`, 'mint')
  member = await login(memberIdentity, `提醒成员${suffix.slice(-3)}`, 'peach')
  outsider = await login(outsiderIdentity, `提醒访客${suffix.slice(-3)}`, 'sun')
  const spaceId = owner.activeSpaceId
  assert.notEqual(spaceId, outsider.activeSpaceId)

  const invite = (await apiOk(`/spaces/${encodeURIComponent(spaceId)}/invites`, {
    method: 'POST',
    token: owner.token,
  })).data
  await apiOk(`/invites/${encodeURIComponent(invite.code)}/accept`, {
    method: 'POST',
    token: member.token,
  })
  const memberSession = (await apiOk('/session', { token: member.token })).data
  const sharedMemberSession = { ...memberSession, activeSpaceId: spaceId }
  assert.ok(memberSession.spaces.some((space) => space.id === spaceId))
  console.log('PASS 两个 mock 用户进入同一空间，访客保持独立空间')

  utcBefore = new Date().toISOString()
  const ownerDefault = await apiOk(reminderPath(spaceId), { token: owner.token })
  assert.equal(ownerDefault.status, 200)
  assert.equal(ownerDefault.headers.get('etag'), '"1"')
  assert.deepEqual(ownerDefault.data, {
    ...input(),
    version: 1,
    updatedAt: ownerDefault.data.updatedAt,
  })
  assert.ok(ownerDefault.data.updatedAt >= utcBefore.slice(0, 10))
  const ownerDefaultAgain = await apiOk(reminderPath(spaceId), { token: owner.token })
  assert.equal(ownerDefaultAgain.data.version, 1)
  assert.equal(ownerDefaultAgain.data.updatedAt, ownerDefault.data.updatedAt)
  console.log('PASS 首次 GET 懒创建默认设置，跨请求保持同一份记录')

  const updateKey = `reminder_smoke_update_${suffix}`
  const ownerInput = input({
    expiry: false,
    weeklyReview: true,
    reminderTime: '21:15',
  })
  const ownerUpdated = await apiOk(reminderPath(spaceId), {
    method: 'PUT',
    token: owner.token,
    headers: {
      'If-Match': '"1"',
      'Idempotency-Key': updateKey,
    },
    body: ownerInput,
  })
  assert.equal(ownerUpdated.status, 200)
  assert.equal(ownerUpdated.headers.get('etag'), '"2"')
  assert.deepEqual(ownerUpdated.data, {
    ...ownerInput,
    version: 2,
    updatedAt: ownerUpdated.data.updatedAt,
  })
  const ownerReplayed = await apiOk(reminderPath(spaceId), {
    method: 'PUT',
    token: owner.token,
    headers: {
      'If-Match': '"1"',
      'Idempotency-Key': updateKey,
    },
    body: ownerInput,
  })
  assert.deepEqual(ownerReplayed.data, ownerUpdated.data)
  assert.equal(ownerReplayed.headers.get('etag'), '"2"')
  console.log('PASS 提醒设置写入、ETag 递增与相同幂等键重放')

  const memberDefault = await apiOk(reminderPath(spaceId), { token: member.token })
  assert.equal(memberDefault.data.version, 1)
  assert.deepEqual(memberDefault.data, {
    ...input(),
    version: 1,
    updatedAt: memberDefault.data.updatedAt,
  })
  const memberUpdated = await apiOk(reminderPath(spaceId), {
    method: 'PUT',
    token: member.token,
    headers: {
      'If-Match': '"1"',
      'Idempotency-Key': `reminder_smoke_member_${suffix}`,
    },
    body: input({ petCare: false, reminderTime: '08:05' }),
  })
  assert.equal(memberUpdated.data.version, 2)
  const ownerStill = await apiOk(reminderPath(spaceId), { token: owner.token })
  assert.deepEqual(ownerStill.data, ownerUpdated.data)
  console.log('PASS 同一空间内用户偏好互相隔离')

  const stale = await apiRaw(reminderPath(spaceId), {
    method: 'PUT',
    token: owner.token,
    headers: {
      'If-Match': '"1"',
      'Idempotency-Key': `reminder_smoke_stale_${suffix}`,
    },
    body: input({ reminderTime: '19:00' }),
  })
  assert.equal(stale.status, 409)
  assert.equal(stale.data.code, 'VERSION_CONFLICT')
  const missingPrecondition = await apiRaw(reminderPath(spaceId), {
    method: 'PUT',
    token: owner.token,
    body: input(),
  })
  assert.equal(missingPrecondition.status, 428)
  assert.equal(missingPrecondition.data.code, 'PRECONDITION_REQUIRED')
  const outsiderRead = await apiRaw(reminderPath(spaceId), { token: outsider.token })
  assert.equal(outsiderRead.status, 404)
  assert.equal(outsiderRead.data.code, 'NOT_FOUND')
  console.log('PASS 旧版本冲突、缺少 If-Match 与非空间成员权限边界')

  await setApiSession(owner.token, owner, ownerIdentity)
  let page = await open('/pages/reminder-settings/index')
  let pageData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.settings?.version === 2 ? data : false
  }, '提醒设置页面加载')
  assert.equal(pageData.mode, 'http')
  assert.equal(pageData.settings.expiry, false)
  assert.equal(pageData.settings.weeklyReview, true)
  assert.equal(pageData.settings.reminderTime, '21:15')
  assert.equal(pageData.syncText, '已保存到空间')
  await assertNoHorizontalOverflow(page, '提醒设置页')
  await screenshot('loaded')
  console.log('PASS 开发者工具页面读取真实提醒设置')

  await page.callMethod('onToggle', {
    currentTarget: { dataset: { key: 'expiry' } },
    detail: { value: true },
  })
  pageData = await waitFor(async () => {
    const data = await page.data()
    return !data.saving && data.settings?.version === 3 ? data : false
  }, '页面开关保存')
  assert.equal(pageData.settings.expiry, true)
  assert.equal(pageData.syncText, '已保存到空间')

  await page.callMethod('onTimeChange', { detail: { value: '22:10' } })
  pageData = await waitFor(async () => {
    const data = await page.data()
    return !data.saving && data.settings?.version === 4 ? data : false
  }, '页面时间保存')
  assert.equal(pageData.settings.reminderTime, '22:10')
  await screenshot('saved')

  page = await open('/pages/reminder-settings/index')
  pageData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.settings?.version === 4 ? data : false
  }, '重新打开后持久化')
  assert.equal(pageData.settings.expiry, true)
  assert.equal(pageData.settings.reminderTime, '22:10')
  console.log('PASS 页面开关与时间保存后重新打开仍保留')

  const external = await apiOk(reminderPath(spaceId), {
    method: 'PUT',
    token: owner.token,
    headers: {
      'If-Match': '"4"',
      'Idempotency-Key': `reminder_smoke_external_${suffix}`,
    },
    body: input({ petCare: false, weeklyReview: true, reminderTime: '22:30' }),
  })
  assert.equal(external.data.version, 5)

  await miniProgram.mockWxMethod('showToast', { title: '设置已在别处更新' })
  await page.callMethod('onToggle', {
    currentTarget: { dataset: { key: 'weeklyReview' } },
    detail: { value: false },
  })
  pageData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.settings?.version === 5 ? data : false
  }, '版本冲突后载入最新设置')
  assert.equal(pageData.settings.petCare, false)
  assert.equal(pageData.settings.weeklyReview, true)
  assert.equal(pageData.settings.reminderTime, '22:30')
  assert.equal(pageData.errorText, '')
  await miniProgram.restoreWxMethod('showToast')
  await screenshot('conflict-recovered')
  console.log('PASS 页面遇到旧版本时自动载入最新设置')

  await page.setData({
    loading: false,
    errorText: '网络不太稳定，请稍后再试',
    syncState: 'local',
    syncText: '未同步',
  })
  await screenshot('error-state')
  await page.callMethod('onRetry')
  await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.errorText === '' && data.settings?.version === 5
  }, '错误态重试恢复')
  console.log('PASS 错误态渲染与重试恢复')

  assert.deepEqual(runtimeErrors, [])
  console.log('PASS 开发者工具无运行时 JS 错误')
} finally {
  try {
    await miniProgram.restoreWxMethod('showToast')
  } catch {
    // 未 mock 时忽略。
  }
  await miniProgram.disconnect()
}
