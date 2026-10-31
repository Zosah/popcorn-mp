// 自定义底栏真实 HTTP + 开发者工具 UI 验收。
// 前提：env.ts 为 local + HTTP + mock 登录，本地 API、SSH 隧道与自动化端口已启动。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const identityKey = 'popcorn_api_mock_identity_v1'
const tabConfigPrefix = 'popcorn_app_tab_config_v1'
const suffix = Date.now().toString(36).slice(-9)
const ownerIdentity = `ato${suffix}`
const memberIdentity = `atm${suffix}`
const outsiderIdentity = `atx${suffix}`
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
    body: { identity, deviceLabel: '自定义底栏 HTTP 验收' },
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

async function clearTabCache(userId, spaceId) {
  await miniProgram.callWxMethod(
    'removeStorageSync',
    `${tabConfigPrefix}:${spaceId}:${userId}`,
  )
  await miniProgram.callWxMethod(
    'removeStorageSync',
    `${tabConfigPrefix}:${userId}`,
  )
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
  const path = `shots/app-tabs-http-${name}.png`
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

async function tabBarData(page) {
  const bar = await page.$('app-tab-bar')
  assert.ok(bar, '页面没有渲染 app-tab-bar')
  return bar.data()
}

function appTabPath(spaceId) {
  return `/spaces/${encodeURIComponent(spaceId)}/app-tab-settings`
}

function settings(overrides = {}) {
  return {
    slot2: 'pets',
    slot3: 'journal',
    ...overrides,
  }
}

async function updateAppTabs(spaceId, token, version, body, key) {
  return apiOk(appTabPath(spaceId), {
    method: 'PUT',
    token,
    headers: {
      'If-Match': `"${version}"`,
      'Idempotency-Key': key,
    },
    body,
  })
}

let owner
let member
let outsider
try {
  owner = await login(ownerIdentity, `底栏房主${suffix.slice(-3)}`, 'mint')
  member = await login(memberIdentity, `底栏成员${suffix.slice(-3)}`, 'peach')
  outsider = await login(outsiderIdentity, `底栏访客${suffix.slice(-3)}`, 'sun')
  const ownerSpaceId = owner.activeSpaceId
  const memberOwnSpaceId = member.activeSpaceId
  assert.notEqual(ownerSpaceId, outsider.activeSpaceId)

  const ownerDefault = (await apiOk(appTabPath(ownerSpaceId), { token: owner.token })).data
  assert.deepEqual(ownerDefault, {
    ...settings(),
    version: 1,
    updatedAt: ownerDefault.updatedAt,
  })
  const ownerDefaultAgain = await apiOk(appTabPath(ownerSpaceId), { token: owner.token })
  assert.equal(ownerDefaultAgain.data.version, 1)
  assert.equal(ownerDefaultAgain.data.updatedAt, ownerDefault.updatedAt)
  console.log('PASS 首次 GET 懒创建默认底栏，跨请求保持同一份记录')

  const memberOwnDefault = (await apiOk(appTabPath(memberOwnSpaceId), { token: member.token })).data
  assert.deepEqual(memberOwnDefault, {
    ...settings(),
    version: 1,
    updatedAt: memberOwnDefault.updatedAt,
  })
  const ownUpdate = await updateAppTabs(
    memberOwnSpaceId,
    member.token,
    1,
    settings({ slot2: 'menu', slot3: 'travel' }),
    `app_tab_own_${suffix}`,
  )
  assert.equal(ownUpdate.data.version, 2)

  const invite = (await apiOk(`/spaces/${encodeURIComponent(ownerSpaceId)}/invites`, {
    method: 'POST',
    token: owner.token,
  })).data
  await apiOk(`/invites/${encodeURIComponent(invite.code)}/accept`, {
    method: 'POST',
    token: member.token,
  })
  const sharedMemberDefault = (await apiOk(appTabPath(ownerSpaceId), { token: member.token })).data
  assert.deepEqual(sharedMemberDefault, {
    ...settings(),
    version: 1,
    updatedAt: sharedMemberDefault.updatedAt,
  })
  const ownStill = (await apiOk(appTabPath(memberOwnSpaceId), { token: member.token })).data
  assert.deepEqual(ownStill, ownUpdate.data)
  console.log('PASS 同一用户在不同空间拥有独立底栏，不会串配置')

  const updateKey = `app_tab_owner_${suffix}`
  const ownerInput = settings({ slot2: 'menu', slot3: 'plan' })
  const ownerUpdated = await updateAppTabs(
    ownerSpaceId,
    owner.token,
    1,
    ownerInput,
    updateKey,
  )
  assert.equal(ownerUpdated.status, 200)
  assert.equal(ownerUpdated.headers.get('etag'), '"2"')
  assert.deepEqual(ownerUpdated.data, {
    ...ownerInput,
    version: 2,
    updatedAt: ownerUpdated.data.updatedAt,
  })

  const ownerReplayed = await updateAppTabs(
    ownerSpaceId,
    owner.token,
    1,
    ownerInput,
    updateKey,
  )
  assert.deepEqual(ownerReplayed.data, ownerUpdated.data)
  assert.equal(ownerReplayed.headers.get('etag'), '"2"')
  console.log('PASS 底栏写入、ETag 递增与相同幂等键重放')

  const memberSharedStill = await apiOk(appTabPath(ownerSpaceId), { token: member.token })
  assert.deepEqual(memberSharedStill.data, sharedMemberDefault)
  const ownerOwnUnaffected = await apiOk(appTabPath(memberOwnSpaceId), { token: member.token })
  assert.deepEqual(ownerOwnUnaffected.data, ownUpdate.data)
  console.log('PASS 同一空间内用户偏好互相隔离，其他空间也不受影响')

  const stale = await apiRaw(appTabPath(ownerSpaceId), {
    method: 'PUT',
    token: owner.token,
    headers: {
      'If-Match': '"1"',
      'Idempotency-Key': `app_tab_stale_${suffix}`,
    },
    body: settings({ slot2: 'todo', slot3: 'journal' }),
  })
  assert.equal(stale.status, 409)
  assert.equal(stale.data.code, 'VERSION_CONFLICT')

  const missingPrecondition = await apiRaw(appTabPath(ownerSpaceId), {
    method: 'PUT',
    token: owner.token,
    body: settings(),
  })
  assert.equal(missingPrecondition.status, 428)
  assert.equal(missingPrecondition.data.code, 'PRECONDITION_REQUIRED')

  const invalid = await apiRaw(appTabPath(ownerSpaceId), {
    method: 'PUT',
    token: owner.token,
    headers: {
      'If-Match': '"2"',
      'Idempotency-Key': `app_tab_invalid_${suffix}`,
    },
    body: settings({ slot2: 'pets', slot3: 'pets' }),
  })
  assert.equal(invalid.status, 422)
  assert.equal(invalid.data.code, 'VALIDATION_FAILED')

  const outsiderRead = await apiRaw(appTabPath(ownerSpaceId), { token: outsider.token })
  assert.equal(outsiderRead.status, 404)
  assert.equal(outsiderRead.data.code, 'NOT_FOUND')
  console.log('PASS 旧版本冲突、缺少 If-Match、重复入口校验与非空间成员权限边界')

  await clearTabCache(owner.user.id, ownerSpaceId)
  await setApiSession(owner.token, owner, ownerIdentity)
  let page = await open('/pages/tab-settings/index')
  let pageData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.version === 2 ? data : false
  }, '自定义底栏设置页面加载')
  assert.equal(pageData.mode, 'http')
  assert.deepEqual(pageData.config, ownerInput)
  assert.deepEqual(
    pageData.previewItems.map((item) => item.id),
    ['home', 'menu', 'plan', 'profile'],
  )
  assert.equal(pageData.syncText, '已同步到空间')
  await assertNoHorizontalOverflow(page, '自定义底栏设置页')
  await screenshot('loaded')
  console.log('PASS 开发者工具页面读取真实底栏配置并渲染预览')

  await page.callMethod('onSelectSlot', {
    currentTarget: { dataset: { slot: 'slot2' } },
  })
  pageData = await page.data()
  assert.equal(pageData.editingSlot, 'slot2')
  const todoOption = await page.$('.tab-settings-option[data-id="todo"]')
  assert.ok(todoOption, '没有找到「待办与小计划」候选入口')
  await todoOption.tap()
  pageData = await waitFor(async () => {
    const data = await page.data()
    return !data.saving && data.version === 3 ? data : false
  }, '点击候选入口并保存')
  assert.deepEqual(pageData.config, settings({ slot2: 'todo', slot3: 'plan' }))
  assert.equal(pageData.syncText, '已同步到空间')
  await screenshot('saved')
  console.log('PASS 设置页点击候选入口后自动保存到服务端')

  page = await open('/pages/tab-settings/index')
  pageData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.version === 3 ? data : false
  }, '重新打开后持久化')
  assert.deepEqual(pageData.config, settings({ slot2: 'todo', slot3: 'plan' }))
  console.log('PASS 重新打开设置页仍读取服务端最新配置')

  page = await open('/pages/home/index')
  const homeData = await waitFor(async () => {
    const data = await tabBarData(page)
    return data.items?.length === 4 ? data : false
  }, '首页底栏渲染')
  assert.deepEqual(
    homeData.items.map((item) => item.label),
    ['家', '待办', '计划', '我的'],
  )
  assert.equal(homeData.activeId, 'home')
  await assertNoHorizontalOverflow(page, '首页自定义底栏')
  await screenshot('home')
  console.log('PASS 首页底栏实际渲染服务端配置的两个自定义入口')

  const bar = await page.$('app-tab-bar')
  const planTab = await bar.$('[data-id="plan"]')
  assert.ok(planTab, '首页底栏没有渲染「计划」入口')
  await planTab.tap()
  const targetPage = await waitFor(async () => {
    const current = await miniProgram.currentPage()
    return current?.path === 'pages/todo/index' && current.query?.kind === 'plan'
      ? current
      : false
  }, '点击底栏跳转到小计划')
  assert.equal(targetPage.path, 'pages/todo/index')
  assert.equal(targetPage.query.kind, 'plan')
  await screenshot('tab-navigation')
  console.log('PASS 点击自定义底栏入口可跳转到对应二级功能')

  const external = await updateAppTabs(
    ownerSpaceId,
    owner.token,
    3,
    settings({ slot2: 'menu', slot3: 'fitness' }),
    `app_tab_external_${suffix}`,
  )
  assert.equal(external.data.version, 4)
  page = await open('/pages/tab-settings/index')
  await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.version === 4 ? data : false
  }, '冲突前加载版本 4')

  await miniProgram.mockWxMethod('showToast', { title: '底栏已在别处更新' })
  await page.callMethod('onSelectSlot', {
    currentTarget: { dataset: { slot: 'slot3' } },
  })
  const expenseOption = await page.$('.tab-settings-option[data-id="expense"]')
  assert.ok(expenseOption, '没有找到账单候选入口')
  await updateAppTabs(
    ownerSpaceId,
    owner.token,
    4,
    settings({ slot2: 'journal', slot3: 'travel' }),
    `app_tab_conflict_${suffix}`,
  )
  await expenseOption.tap()
  pageData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && !data.saving && data.version === 5 ? data : false
  }, '版本冲突后载入最新配置')
  assert.deepEqual(pageData.config, settings({ slot2: 'journal', slot3: 'travel' }))
  assert.equal(pageData.errorText, '')
  await miniProgram.restoreWxMethod('showToast')
  await screenshot('conflict-recovered')
  console.log('PASS 页面遇到旧版本时自动载入服务端最新配置')

  await page.setData({
    loading: false,
    errorText: '网络不太稳定，请稍后再试',
    syncText: '使用本机版本',
  })
  await screenshot('error-state')
  await page.callMethod('onRetry')
  await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.errorText === '' && data.version === 5
  }, '错误态重试恢复')
  console.log('PASS 错误态渲染与重试恢复')

  page = await open('/pages/profile/index')
  const profileData = await waitFor(async () => {
    const data = await page.data()
    return data.isLoggedIn && !data.todoLoading
      ? data
      : false
  }, '个人中心加载')
  assert.equal(profileData.tabBarSummary, '家 / 记录 / 旅行 / 我的')
  await assertNoHorizontalOverflow(page, '个人中心')
  await screenshot('profile-summary')
  console.log('PASS 个人中心按当前空间与用户展示底栏摘要')

  assert.deepEqual(runtimeErrors, [])
  console.log('PASS 开发者工具无运行时 JS 错误')
} finally {
  try {
    await miniProgram.restoreWxMethod('showToast')
  } catch {
    // 未 mock 时忽略。
  }
  if (owner && member) {
    await clearTabCache(owner.user.id, owner.activeSpaceId).catch(() => undefined)
    await clearTabCache(member.user.id, member.activeSpaceId).catch(() => undefined)
  }
  await miniProgram.disconnect().catch(() => undefined)
}
