// 连接已开启自动化端口的微信开发者工具，验证 B3 库存真实 HTTP 链路。
// 前提：env.ts 已切换为 local + HTTP + mock 登录，且本地 API 可访问。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const runtimeErrors = []
const suffix = Date.now().toString().slice(-10)
const ownerIdentity = `bio${suffix}`
const memberIdentity = `bim${suffix}`
const ownerNickname = `B3房主${suffix.slice(-4)}`
const memberNickname = `B3成员${suffix.slice(-4)}`
const itemName = `B3鲜奶${suffix.slice(-4)}`
const updatedItemName = `${itemName}低脂`
const expiresOn = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
const TOKEN_KEY = 'popcorn_api_auth_token_v1'
const SESSION_KEY = 'popcorn_api_auth_session_v1'
const IDENTITY_KEY = 'popcorn_api_mock_identity_v1'

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
  return result.data
}

async function login(identity, nickname, avatarTone) {
  const login = await apiOk('/auth/mock', {
    method: 'POST',
    body: { identity, deviceLabel: 'B3 HTTP 验收' },
  })
  const token = login.token
  let session = login
  if (session.onboardingRequired) {
    session = await apiOk('/me', {
      method: 'PUT',
      token,
      body: { nickname, avatarTone },
    })
  }
  assert.equal(session.user.nickname, nickname)
  assert.equal(session.onboardingRequired, false)
  return { ...session, token }
}

async function setApiSession(token, session, identity) {
  await miniProgram.callWxMethod('removeStorageSync', TOKEN_KEY)
  await miniProgram.callWxMethod('removeStorageSync', SESSION_KEY)
  await miniProgram.callWxMethod('setStorageSync', TOKEN_KEY, token)
  await miniProgram.callWxMethod('setStorageSync', SESSION_KEY, session)
  await miniProgram.callWxMethod('setStorageSync', IDENTITY_KEY, identity)
}

async function open(url) {
  const page = await miniProgram.reLaunch(url)
  await wait(500)
  if (!page) throw new Error(`页面打开失败：${url}`)
  return page
}

async function waitFor(check, label, timeoutMs = 15000) {
  const startedAt = Date.now()
  let lastValue
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await check()
    if (lastValue) return lastValue
    await wait(250)
  }
  throw new Error(`等待超时：${label}，最后状态：${JSON.stringify(lastValue)}`)
}

async function listApiItems(token, spaceId, query = '') {
  const search = new URLSearchParams({ limit: '100' })
  if (query) search.set('query', query)
  const page = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/inventory/items?${search}`, { token })
  return page.items
}

async function waitApiItem(token, spaceId, id, predicate = () => true, label = '库存接口状态') {
  return waitFor(async () => {
    const result = await apiRaw(`/spaces/${encodeURIComponent(spaceId)}/inventory/items/${encodeURIComponent(id)}`, { token })
    return result.status === 200 && predicate(result.data) ? result.data : false
  }, label)
}

function itemsFromPage(data) {
  return (data.sections ?? []).flatMap((section) => section.items ?? [])
}

async function waitUiItem(token, session, identity, spaceId, id, label) {
  await setApiSession(token, session, identity)
  const page = await open('/pages/inventory/index')
  return waitFor(async () => {
    const data = await page.data()
    if (data.loading) return false
    return itemsFromPage(data).find((item) => item.id === id) ?? false
  }, label)
}

async function changeStatusViaUi(token, session, identity, spaceId, itemId, targetStatus, expectedVersion) {
  await setApiSession(token, session, identity)
  const page = await open(`/pages/item-detail/index?id=${encodeURIComponent(itemId)}`)
  await waitFor(async () => {
    const item = (await page.data()).item
    return item?.version === expectedVersion ? item : false
  }, `详情版本 ${expectedVersion}`)
  await page.callMethod('onChangeStatus', {
    currentTarget: { dataset: { status: targetStatus } },
  })
  return waitApiItem(
    token,
    spaceId,
    itemId,
    (item) => item.status === targetStatus && item.version === expectedVersion + 1,
    `状态切换 ${targetStatus}`,
  )
}

try {
  const owner = await login(ownerIdentity, ownerNickname, 'mint')
  const ownerSpaceId = owner.activeSpaceId
  assert.ok(ownerSpaceId, 'owner 应拥有默认空间')
  console.log('PASS HTTP owner 注册与会话')

  const member = await login(memberIdentity, memberNickname, 'peach')
  const invite = await apiOk(`/spaces/${encodeURIComponent(ownerSpaceId)}/invites`, {
    method: 'POST',
    token: owner.token,
  })
  assert.match(invite.code, /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{10}$/)
  await apiOk(`/invites/${encodeURIComponent(invite.code)}/accept`, {
    method: 'POST',
    token: member.token,
  })
  const memberSession = await apiOk('/session', { token: member.token })
  assert.ok(memberSession.spaces.some((space) => space.id === ownerSpaceId))
  const sharedMemberSession = { ...memberSession, activeSpaceId: ownerSpaceId }
  console.log('PASS HTTP 两个 mock 用户进入同一空间')

  await setApiSession(owner.token, owner, ownerIdentity)
  const formPage = await open('/pages/item-form/index')
  await waitFor(async () => (await formPage.data()).itemId === '', '新增物品页')
  await formPage.setData({
    hasExpiry: true,
    form: {
      name: itemName,
      category: 'drink',
      quantity: '2',
      unit: '盒',
      location: 'fridge',
      purchasedOn: null,
      openedOn: null,
      expiresOn,
      note: 'B3 HTTP 验收',
    },
  })
  await formPage.callMethod('onSave')

  const created = await waitFor(async () => {
    const items = await listApiItems(owner.token, ownerSpaceId, itemName)
    return items.find((item) => item.name === itemName) ?? false
  }, '前端创建库存')
  assert.equal(created.version, 1)
  assert.equal(created.status, 'active')
  console.log('PASS HTTP 前端通过库存 Gateway 创建物品')

  const summaryAfterCreate = await apiOk(`/spaces/${encodeURIComponent(ownerSpaceId)}/inventory/summary`, {
    token: owner.token,
  })
  assert.equal(summaryAfterCreate.total, 1)
  assert.equal(summaryAfterCreate.dueWithin3Days, 1)

  const ownerVisible = await waitUiItem(
    owner.token,
    owner,
    ownerIdentity,
    ownerSpaceId,
    created.id,
    'owner 库存页可见',
  )
  assert.equal(ownerVisible.name, itemName)
  const memberVisible = await waitUiItem(
    member.token,
    sharedMemberSession,
    memberIdentity,
    ownerSpaceId,
    created.id,
    'member 库存页可见',
  )
  assert.equal(memberVisible.name, itemName)
  console.log('PASS HTTP owner/member 双账号读取同一库存')

  await setApiSession(owner.token, owner, ownerIdentity)
  const editPage = await open(`/pages/item-form/index?id=${encodeURIComponent(created.id)}`)
  const editData = await waitFor(async () => {
    const data = await editPage.data()
    return data.version === 1 ? data : false
  }, '编辑页加载版本 1')
  await editPage.setData({
    form: { ...editData.form, name: updatedItemName },
  })
  await editPage.callMethod('onSave')
  const updated = await waitApiItem(
    owner.token,
    ownerSpaceId,
    created.id,
    (item) => item.name === updatedItemName && item.version === 2,
    '前端更新版本递增',
  )
  assert.equal(updated.version, 2)
  console.log('PASS HTTP 前端更新成功且版本递增')

  const stalePage = await open(`/pages/item-form/index?id=${encodeURIComponent(created.id)}`)
  const staleData = await waitFor(async () => {
    const data = await stalePage.data()
    return data.version === 2 ? data : false
  }, '编辑页加载版本 2')
  await stalePage.setData({
    version: 1,
    form: { ...staleData.form, name: `${itemName}冲突覆盖` },
  })
  await stalePage.callMethod('onSave')
  await wait(500)
  const afterConflict = await apiOk(
    `/spaces/${encodeURIComponent(ownerSpaceId)}/inventory/items/${encodeURIComponent(created.id)}`,
    { token: owner.token },
  )
  assert.equal(afterConflict.name, updatedItemName)
  assert.equal(afterConflict.version, 2)
  console.log('PASS HTTP 旧版本更新返回冲突且未覆盖数据')

  let current = await changeStatusViaUi(owner.token, owner, ownerIdentity, ownerSpaceId, created.id, 'consumed', 2)
  current = await changeStatusViaUi(owner.token, owner, ownerIdentity, ownerSpaceId, created.id, 'active', current.version)
  current = await changeStatusViaUi(owner.token, owner, ownerIdentity, ownerSpaceId, created.id, 'discarded', current.version)
  current = await changeStatusViaUi(owner.token, owner, ownerIdentity, ownerSpaceId, created.id, 'active', current.version)
  current = await changeStatusViaUi(owner.token, owner, ownerIdentity, ownerSpaceId, created.id, 'archived', current.version)
  current = await changeStatusViaUi(owner.token, owner, ownerIdentity, ownerSpaceId, created.id, 'active', current.version)
  assert.equal(current.status, 'active')
  console.log('PASS HTTP 用完/丢弃/归档/恢复状态链路')

  const deleteVersion = current.version
  const deleteResult = await apiRaw(
    `/spaces/${encodeURIComponent(ownerSpaceId)}/inventory/items/${encodeURIComponent(created.id)}`,
    {
      method: 'DELETE',
      token: owner.token,
      headers: {
        'If-Match': `"${deleteVersion}"`,
        'Idempotency-Key': `inventory_delete_${suffix}`,
      },
    },
  )
  assert.equal(deleteResult.status, 204)
  const deleted = await apiOk(
    `/spaces/${encodeURIComponent(ownerSpaceId)}/inventory/items/${encodeURIComponent(created.id)}?includeDeleted=true`,
    { token: owner.token },
  )
  assert.ok(deleted.deletedAt)
  assert.equal(deleted.version, deleteVersion + 1)
  const hidden = await apiRaw(
    `/spaces/${encodeURIComponent(ownerSpaceId)}/inventory/items/${encodeURIComponent(created.id)}`,
    { token: owner.token },
  )
  assert.equal(hidden.status, 404)
  const emptySummary = await apiOk(`/spaces/${encodeURIComponent(ownerSpaceId)}/inventory/summary`, {
    token: owner.token,
  })
  assert.equal(emptySummary.total, 0)

  const restored = await apiOk(
    `/spaces/${encodeURIComponent(ownerSpaceId)}/inventory/items/${encodeURIComponent(created.id)}/restore`,
    {
      method: 'POST',
      token: owner.token,
      headers: {
        'If-Match': `"${deleted.version}"`,
        'Idempotency-Key': `inventory_restore_${suffix}`,
      },
    },
  )
  assert.equal(restored.status, 'active')
  assert.equal(restored.deletedAt, null)
  assert.equal(restored.version, deleted.version + 1)
  const restoredSummary = await apiOk(`/spaces/${encodeURIComponent(ownerSpaceId)}/inventory/summary`, {
    token: owner.token,
  })
  assert.equal(restoredSummary.total, 1)
  await waitUiItem(owner.token, owner, ownerIdentity, ownerSpaceId, created.id, '恢复后库存页可见')
  console.log('PASS HTTP 软删除、普通读取隐藏、摘要更新与恢复')

  assert.deepEqual(runtimeErrors, [])
  console.log('B3 HTTP RUNTIME VERIFICATION PASSED')
  console.log(JSON.stringify({
    ownerSpaceId,
    itemId: created.id,
    finalVersion: restored.version,
    ownerIdentity,
    memberIdentity,
  }))
} finally {
  await miniProgram.disconnect()
}
