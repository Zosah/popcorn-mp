// 功能清单 / 首页快捷 / 底部导航真实 HTTP + 开发者工具 UI 验收。
// 前提：src/config/env.ts 为 local + HTTP + mock 登录，本地 API、数据库隧道和自动化端口已启动。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const identityKey = 'popcorn_api_mock_identity_v1'
const featureSettingsPrefix = 'popcorn_feature_settings_v2'
const legacyTabPrefix = 'popcorn_app_tab_config_v1'
const suffix = Date.now().toString(36).slice(-9)
const ownerIdentity = `fso${suffix}`
const memberIdentity = `fsm${suffix}`
const outsiderIdentity = `fsx${suffix}`
const defaultSettings = {
  homeSlots: ['journal', 'inventory', 'todo', 'pets'],
  tabSlots: ['pets', 'journal', 'todo'],
}

let miniProgram = await automator.connect({ wsEndpoint })
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
    body: { identity, deviceLabel: '功能配置 HTTP 验收' },
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

async function clearSettingsCache(userId, spaceId) {
  for (const prefix of [featureSettingsPrefix, legacyTabPrefix]) {
    await miniProgram.callWxMethod('removeStorageSync', `${prefix}:${spaceId}:${userId}`)
    await miniProgram.callWxMethod('removeStorageSync', `${prefix}:${userId}`)
  }
}

async function withTimeout(promise, timeoutMs, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label}超时（${timeoutMs}ms）`)), timeoutMs)
      }),
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function reconnectMiniProgram() {
  await miniProgram.disconnect().catch(() => undefined)
  miniProgram = await automator.connect({ wsEndpoint })
}

async function open(url) {
  let lastError
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      await withTimeout(miniProgram.reLaunch(url), 15000, `打开 ${url}`)
      await wait(700)
      const page = await miniProgram.currentPage()
      const expectedPath = url.replace(/^\//, '').split('?')[0]
      const redirectedLegacySettings = expectedPath === 'pages/tab-settings/index' &&
        page?.path === 'pages/feature-settings/index'
      if (!page || (page.path !== expectedPath && !redirectedLegacySettings)) {
        throw new Error(`页面打开失败：${url}，当前页面：${page?.path ?? '无'}`)
      }
      return page
    } catch (error) {
      lastError = error
      console.error(`WARN 页面打开失败，第 ${attempt} 次：${url}`, error)
      if (attempt < 2) {
        await reconnectMiniProgram()
        await wait(1000)
      }
    }
  }
  throw lastError
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
  const path = `shots/feature-settings-http-${name}.png`
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

function featurePath(spaceId) {
  return `/spaces/${encodeURIComponent(spaceId)}/feature-settings`
}

function legacyPath(spaceId) {
  return `/spaces/${encodeURIComponent(spaceId)}/app-tab-settings`
}

function expectedFeatureSettings(config, version, updatedAt) {
  return {
    homeSlots: config.homeSlots,
    tabSlots: config.tabSlots,
    version,
    updatedAt,
  }
}

async function updateFeatures(spaceId, token, version, body, key) {
  return apiOk(featurePath(spaceId), {
    method: 'PUT',
    token,
    headers: {
      'If-Match': `"${version}"`,
      'Idempotency-Key': key,
    },
    body,
  })
}

async function updateLegacyTabs(spaceId, token, version, body, key) {
  return apiOk(legacyPath(spaceId), {
    method: 'PUT',
    token,
    headers: {
      'If-Match': `"${version}"`,
      'Idempotency-Key': key,
    },
    body,
  })
}

async function pageDataWhere(page, predicate, label) {
  return waitFor(async () => {
    const data = await page.data()
    return predicate(data) ? data : false
  }, label)
}

async function slotElements(page) {
  return page.$$('.feature-slot')
}

async function dragSlot(page, fromIndex, toIndex) {
  const slots = await slotElements(page)
  assert.ok(slots.length >= Math.max(fromIndex, toIndex) + 1, '拖拽槽位数量不足')
  const fromOffset = await slots[fromIndex].offset()
  const toOffset = await slots[toIndex].offset()
  const fromSize = await slots[fromIndex].size()
  const toSize = await slots[toIndex].size()
  const fromX = Number(fromOffset.left) + Number(fromSize.width) / 2
  const fromY = Number(fromOffset.top) + Number(fromSize.height) / 2
  const toX = Number(toOffset.left) + Number(toSize.width) / 2
  const toY = Number(toOffset.top) + Number(toSize.height) / 2
  await slots[fromIndex].touchstart({
    touches: [{ identifier: 1, clientX: fromX, clientY: fromY, pageX: fromX, pageY: fromY }],
  })
  await wait(450)
  await slots[fromIndex].touchmove({
    touches: [{ identifier: 1, clientX: toX, clientY: toY, pageX: toX, pageY: toY }],
  })
  await wait(100)
  await slots[fromIndex].touchend({
    touches: [],
    changedTouches: [{ identifier: 1, clientX: toX, clientY: toY, pageX: toX, pageY: toY }],
  })
}

let owner
let member
let outsider
try {
  owner = await login(ownerIdentity, `配置房主${suffix.slice(-3)}`, 'mint')
  member = await login(memberIdentity, `配置成员${suffix.slice(-3)}`, 'peach')
  outsider = await login(outsiderIdentity, `配置访客${suffix.slice(-3)}`, 'sun')
  const ownerSpaceId = owner.activeSpaceId
  const memberOwnSpaceId = member.activeSpaceId
  assert.notEqual(ownerSpaceId, outsider.activeSpaceId)

  const ownerDefault = (await apiOk(featurePath(ownerSpaceId), { token: owner.token })).data
  assert.deepEqual(ownerDefault, expectedFeatureSettings(defaultSettings, 1, ownerDefault.updatedAt))
  const ownerDefaultAgain = await apiOk(featurePath(ownerSpaceId), { token: owner.token })
  assert.deepEqual(ownerDefaultAgain.data, ownerDefault)
  console.log('PASS 新版 GET 懒创建首页 4 槽位与底栏 3 槽位默认配置')

  const crossRegionInput = {
    homeSlots: ['menu', 'todo', 'journal', 'pets'],
    tabSlots: ['menu', 'expense', 'pets'],
  }
  const updateKey = `feature_settings_owner_${suffix}`
  const ownerUpdated = await updateFeatures(ownerSpaceId, owner.token, 1, crossRegionInput, updateKey)
  assert.equal(ownerUpdated.status, 200)
  assert.equal(ownerUpdated.headers.get('etag'), '"2"')
  assert.deepEqual(
    ownerUpdated.data,
    expectedFeatureSettings(crossRegionInput, 2, ownerUpdated.data.updatedAt),
  )
  const ownerReplayed = await updateFeatures(ownerSpaceId, owner.token, 1, crossRegionInput, updateKey)
  assert.deepEqual(ownerReplayed.data, ownerUpdated.data)
  assert.equal(ownerReplayed.headers.get('etag'), '"2"')
  console.log('PASS 首页与底栏统一写入、跨区域允许重复、ETag 递增和幂等重放')

  const legacyInput = { slot2: 'fitness', slot3: 'journal', slot4: 'todo' }
  const legacyUpdated = await updateLegacyTabs(
    ownerSpaceId,
    owner.token,
    2,
    legacyInput,
    `feature_settings_legacy_${suffix}`,
  )
  assert.equal(legacyUpdated.data.version, 3)
  assert.deepEqual(legacyUpdated.data, {
    ...legacyInput,
    version: 3,
    updatedAt: legacyUpdated.data.updatedAt,
  })
  const afterLegacy = (await apiOk(featurePath(ownerSpaceId), { token: owner.token })).data
  assert.deepEqual(afterLegacy, expectedFeatureSettings({
    homeSlots: crossRegionInput.homeSlots,
    tabSlots: ['fitness', 'journal', 'todo'],
  }, 3, afterLegacy.updatedAt))
  console.log('PASS 旧底栏接口只更新底栏并保留新版首页配置')

  const duplicate = await apiRaw(featurePath(ownerSpaceId), {
    method: 'PUT',
    token: owner.token,
    headers: {
      'If-Match': '"3"',
      'Idempotency-Key': `feature_settings_duplicate_${suffix}`,
    },
    body: {
      homeSlots: ['menu', 'menu', 'journal', 'pets'],
      tabSlots: ['fitness', 'journal', 'todo'],
    },
  })
  assert.equal(duplicate.status, 422)
  assert.equal(duplicate.data.code, 'VALIDATION_FAILED')

  const stale = await apiRaw(featurePath(ownerSpaceId), {
    method: 'PUT',
    token: owner.token,
    headers: {
      'If-Match': '"1"',
      'Idempotency-Key': `feature_settings_stale_${suffix}`,
    },
    body: defaultSettings,
  })
  assert.equal(stale.status, 409)
  assert.equal(stale.data.code, 'VERSION_CONFLICT')

  const outsiderRead = await apiRaw(featurePath(ownerSpaceId), { token: outsider.token })
  assert.equal(outsiderRead.status, 404)
  assert.equal(outsiderRead.data.code, 'NOT_FOUND')
  console.log('PASS 同区重复拒绝、旧版本冲突、非空间成员权限边界')

  const memberOwnDefault = (await apiOk(featurePath(memberOwnSpaceId), { token: member.token })).data
  assert.deepEqual(memberOwnDefault, expectedFeatureSettings(defaultSettings, 1, memberOwnDefault.updatedAt))
  const memberOwnUpdate = await updateFeatures(memberOwnSpaceId, member.token, 1, {
    homeSlots: ['inventory', 'menu', 'journal', 'pets'],
    tabSlots: ['menu', 'todo', 'pets'],
  }, `feature_settings_member_own_${suffix}`)
  assert.equal(memberOwnUpdate.data.version, 2)

  const invite = (await apiOk(`/spaces/${encodeURIComponent(ownerSpaceId)}/invites`, {
    method: 'POST',
    token: owner.token,
  })).data
  await apiOk(`/invites/${encodeURIComponent(invite.code)}/accept`, {
    method: 'POST',
    token: member.token,
  })
  const memberSharedDefault = (await apiOk(featurePath(ownerSpaceId), { token: member.token })).data
  assert.deepEqual(
    memberSharedDefault,
    expectedFeatureSettings(defaultSettings, 1, memberSharedDefault.updatedAt),
  )
  const memberOwnStill = (await apiOk(featurePath(memberOwnSpaceId), { token: member.token })).data
  assert.deepEqual(memberOwnStill, memberOwnUpdate.data)
  const ownerStill = (await apiOk(featurePath(ownerSpaceId), { token: owner.token })).data
  assert.deepEqual(ownerStill, afterLegacy)
  console.log('PASS 同空间双用户、同用户双空间的配置彼此隔离')

  await clearSettingsCache(owner.user.id, ownerSpaceId)
  await setApiSession(owner.token, owner, ownerIdentity)
  const openedAt = Date.now()
  let page = await open('/pages/feature-settings/index')
  let pageData = await pageDataWhere(
    page,
    (data) => !data.initialLoading && data.hasLoaded && data.version === 3,
    '功能配置页首次加载',
  )
  assert.ok(Date.now() - openedAt >= 420, '首次加载未体现最短 loading 时长')
  assert.equal(pageData.activeRegion, 'home')
  assert.deepEqual(pageData.slots.map((item) => item.id), afterLegacy.homeSlots)
  assert.deepEqual(pageData.config, {
    homeSlots: afterLegacy.homeSlots,
    tabSlots: afterLegacy.tabSlots,
  })
  assert.equal(pageData.syncText, '已同步到空间')
  await assertNoHorizontalOverflow(page, '功能配置页')
  await screenshot('home-loaded')
  console.log('PASS 开发者工具读取真实配置并渲染首页 4 个快捷入口')

  const beforeHomeDrag = pageData.config.homeSlots
  await dragSlot(page, 0, 3)
  pageData = await pageDataWhere(
    page,
    (data) => !data.saving && data.version === 4,
    '首页 2×2 拖拽保存',
  )
  const expectedHomeAfterDrag = [...beforeHomeDrag.slice(1), beforeHomeDrag[0]]
  assert.deepEqual(pageData.config.homeSlots, expectedHomeAfterDrag)
  assert.equal(pageData.syncText, '已同步到空间')
  const homeAfterDrag = (await apiOk(featurePath(ownerSpaceId), { token: owner.token })).data
  assert.deepEqual(homeAfterDrag.homeSlots, expectedHomeAfterDrag)
  await screenshot('home-dragged')
  console.log('PASS 首页 2×2 槽位长按拖动并按最近落点保存')

  await page.callMethod('onEditSlot', {
    currentTarget: { dataset: { index: 1 } },
  })
  pageData = await page.data()
  assert.equal(pageData.pickerOpen, true)
  assert.equal(pageData.editingIndex, 1)
  const reminderOption = await page.$('.candidate-card[data-id="reminders"]')
  assert.ok(reminderOption, '没有找到「提醒设置」候选卡')
  await reminderOption.tap()
  pageData = await pageDataWhere(
    page,
    (data) => !data.saving && data.version === 5,
    '轻触更换首页快捷',
  )
  assert.equal(pageData.slots[1].id, 'reminders')
  assert.equal(pageData.pickerOpen, false)
  await screenshot('home-replaced')
  console.log('PASS 点击槽位后按分类选择候选功能并统一保存')

  await page.callMethod('onSwitchRegion', {
    currentTarget: { dataset: { region: 'tab' } },
  })
  pageData = await pageDataWhere(
    page,
    (data) => data.activeRegion === 'tab',
    '切换到底部导航配置',
  )
  assert.deepEqual(pageData.slots.map((item) => item.id), ['fitness', 'journal', 'todo'])
  assert.deepEqual(
    pageData.tabPreview.map((item) => item.shortLabel),
    ['家', '健身', '记录', '待办', '我的'],
  )
  await screenshot('tab-loaded')

  const beforeTabDrag = pageData.config.tabSlots
  await dragSlot(page, 0, 2)
  pageData = await pageDataWhere(
    page,
    (data) => !data.saving && data.version === 6,
    '底栏三列拖拽保存',
  )
  assert.deepEqual(pageData.config.tabSlots, [...beforeTabDrag.slice(1), beforeTabDrag[0]])
  await screenshot('tab-dragged')
  console.log('PASS 底栏 3 个槽位拖动排序并保存')

  await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
  await page.callMethod('onResetDefault')
  pageData = await pageDataWhere(
    page,
    (data) => !data.saving && data.version === 7,
    '恢复默认配置',
  )
  assert.deepEqual(pageData.config, defaultSettings)
  await miniProgram.restoreWxMethod('showModal')
  await screenshot('default-restored')
  console.log('PASS 恢复默认同时重置首页与底栏')

  await page.callMethod('onPullDownRefresh')
  pageData = await pageDataWhere(
    page,
    (data) => !data.saving && data.version === 7 && data.errorText === '',
    '下拉刷新',
  )
  assert.deepEqual(pageData.config, defaultSettings)
  console.log('PASS 配置页下拉刷新保持最新服务端状态')

  const externalConfig = {
    homeSlots: ['menu', 'inventory', 'todo', 'pets'],
    tabSlots: ['pets', 'expense', 'fitness'],
  }
  const external = await updateFeatures(
    ownerSpaceId,
    owner.token,
    7,
    externalConfig,
    `feature_settings_external_${suffix}`,
  )
  assert.equal(external.data.version, 8)
  await updateFeatures(
    ownerSpaceId,
    owner.token,
    8,
    {
      homeSlots: ['menu', 'todo', 'fitness', 'pets'],
      tabSlots: ['pets', 'expense', 'travel'],
    },
    `feature_settings_conflict_${suffix}`,
  )

  await page.callMethod('onEditSlot', {
    currentTarget: { dataset: { index: 0 } },
  })
  const menuOption = await page.$('.candidate-card[data-id="menu"]')
  assert.ok(menuOption, '没有找到今天吃什么候选卡')
  await menuOption.tap()
  pageData = await pageDataWhere(
    page,
    (data) => !data.saving && Boolean(data.errorText),
    '版本冲突回滚',
  )
  assert.equal(pageData.version, 7)
  assert.deepEqual(pageData.config, defaultSettings)
  assert.match(pageData.errorText, /另一台设备/)
  await screenshot('conflict-rollback')
  await page.callMethod('onRetry')
  pageData = await pageDataWhere(
    page,
    (data) => !data.saving && data.version === 9 && data.errorText === '',
    '冲突后刷新恢复',
  )
  assert.deepEqual(pageData.config, {
    homeSlots: ['menu', 'todo', 'fitness', 'pets'],
    tabSlots: ['pets', 'expense', 'travel'],
  })
  await screenshot('conflict-recovered')
  console.log('PASS 版本冲突回滚到上次保存版本，下拉重试后载入最新配置')

  page = await open('/pages/feature-list/index')
  const featureListData = await pageDataWhere(
    page,
    (data) => data.groups.length === 3,
    '功能清单加载',
  )
  assert.deepEqual(
    featureListData.groups.map((group) => group.category.title),
    ['工具', '备忘', '成员'],
  )
  const placedMenu = featureListData.groups
    .flatMap((group) => group.items)
    .find((item) => item.id === 'menu')
  assert.equal(placedMenu?.placementLabel, '首页')
  assert.ok((await page.$$('.feature-row')).length >= 6, '功能清单条目过少')
  await assertNoHorizontalOverflow(page, '功能清单页')
  await screenshot('feature-list')
  console.log('PASS 功能清单按工具 / 备忘 / 成员分类并标注快捷位置')

  page = await open('/pages/profile/index')
  await pageDataWhere(page, (data) => data.isLoggedIn, '个人中心加载')
  const settingRows = await page.$$('.settings-row')
  const settingTexts = await Promise.all(settingRows.map((row) => row.text()))
  assert.ok(settingTexts.some((text) => text.includes('功能清单') && text.includes('查看全部功能')))
  assert.ok(settingTexts.some((text) => text.includes('功能配置') && text.includes('首页与底栏')))
  assert.ok(settingTexts.some((text) => text.includes('提醒设置') && text.includes('通知与订阅')))
  await screenshot('profile-entry')
  console.log('PASS 个人页提供功能清单、功能配置、提醒设置三个清晰入口')

  page = await open('/pages/home/index')
  const homeData = await pageDataWhere(
    page,
    (data) => data.homeShortcuts.length === 4,
    '首页快捷入口渲染',
  )
  assert.deepEqual(
    homeData.homeShortcuts.map((item) => item.id),
    ['menu', 'todo', 'fitness', 'pets'],
  )
  const bar = await page.$('app-tab-bar')
  assert.ok(bar, '首页没有渲染 app-tab-bar')
  const barData = await bar.data()
  assert.deepEqual(
    barData.items.map((item) => item.label),
    ['家', '宠物', '账单', '旅行', '我的'],
  )
  await assertNoHorizontalOverflow(page, '首页功能快捷与底栏')
  await screenshot('home-applied')
  console.log('PASS 首页 4 个快捷入口和底栏 3 个入口即时应用最新配置')

  const menuShortcut = await page.$('.function-item[data-id="menu"]')
  assert.ok(menuShortcut, '首页没有渲染今天吃什么快捷入口')
  await menuShortcut.tap()
  const menuPage = await waitFor(async () => {
    const current = await miniProgram.currentPage()
    return current?.path === 'pages/menu/index' ? current : false
  }, '首页快捷跳转今天吃什么')
  assert.equal(menuPage.path, 'pages/menu/index')
  console.log('PASS 点击首页快捷入口可跳转到对应二级功能')

  page = await open('/pages/tab-settings/index')
  await waitFor(async () => {
    const current = await miniProgram.currentPage()
    return current?.path === 'pages/feature-settings/index' ? current : false
  }, '旧配置页兼容重定向')
  console.log('PASS 旧配置页入口兼容重定向到新版功能配置页')

  assert.deepEqual(runtimeErrors, [])
  console.log('PASS 开发者工具无运行时 JS 错误')
} finally {
  try {
    await miniProgram.restoreWxMethod('showModal')
  } catch {
    // 未 mock 时忽略。
  }
  if (owner) {
    await clearSettingsCache(owner.user.id, owner.activeSpaceId).catch(() => undefined)
  }
  if (member) {
    await clearSettingsCache(member.user.id, member.activeSpaceId).catch(() => undefined)
  }
  await miniProgram.disconnect().catch(() => undefined)
}
