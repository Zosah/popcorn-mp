// 连接已开启自动化端口的微信开发者工具，验证生活记录真实 HTTP 链路。
// 前提：env.ts 已切换为 local + HTTP，且本地 API 可访问。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const suffix = Date.now().toString().slice(-10)
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const identityKey = 'popcorn_api_mock_identity_v1'
const ownerIdentity = `jno${suffix}`
const memberIdentity = `jnm${suffix}`
const title = `B5生活记录${suffix.slice(-4)}`
const privateTitle = `B5私密记录${suffix.slice(-4)}`

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
    body: { identity, deviceLabel: 'B5 HTTP 验收' },
  })
  const token = login.token
  const session = login.onboardingRequired
    ? await apiOk('/me', {
        method: 'PUT',
        token,
        body: { nickname, avatarTone },
      })
    : login
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
  await wait(400)
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

async function listJournals(token, spaceId, kind) {
  const search = new URLSearchParams({ kind, limit: '100' })
  const page = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/journals?${search}`, { token })
  return page.items
}

try {
  const owner = await login(ownerIdentity, `B5房主${suffix.slice(-4)}`, 'mint')
  const member = await login(memberIdentity, `B5成员${suffix.slice(-4)}`, 'peach')
  const spaceId = owner.activeSpaceId
  const invite = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/invites`, {
    method: 'POST',
    token: owner.token,
  })
  await apiOk(`/invites/${encodeURIComponent(invite.code)}/accept`, {
    method: 'POST',
    token: member.token,
  })
  const memberSession = await apiOk('/session', { token: member.token })
  const sharedMemberSession = { ...memberSession, activeSpaceId: spaceId }
  console.log('PASS HTTP 两个 mock 用户进入同一空间')

  await setApiSession(owner.token, owner, ownerIdentity)
  const form = await open('/pages/journal-form/index?kind=note')
  await waitFor(async () => (await form.data()).loading === false, '生活记录表单')
  await form.setData({
    form: { title, content: '由微信开发者工具创建的共享记录。' },
    category: 'other',
    categoryIndex: 3,
    visibility: 'space',
  })
  await form.callMethod('onSave')

  const created = await waitFor(async () => {
    const entries = await listJournals(owner.token, spaceId, 'note')
    return entries.find((entry) => entry.title === title) ?? false
  }, '前端创建生活记录')
  assert.equal(created.version, 1)
  assert.equal(created.visibility, 'space')
  console.log('PASS HTTP 前端创建共享生活记录')

  await setApiSession(member.token, sharedMemberSession, memberIdentity)
  const memberDetail = await open(`/pages/journal-detail/index?id=${encodeURIComponent(created.id)}`)
  const memberEntry = await waitFor(async () => {
    const data = await memberDetail.data()
    return data.loading ? false : data.entry
  }, '成员读取共享生活记录')
  assert.equal(memberEntry.title, title)
  console.log('PASS HTTP 空间成员读取同一条公开记录')

  const privateEntry = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/journals`, {
    method: 'POST',
    token: owner.token,
    headers: { 'Idempotency-Key': `b5_private_${suffix}` },
    body: {
      kind: 'note',
      title: privateTitle,
      content: '只给创建者看。',
      category: 'other',
      visibility: 'private',
    },
  })
  const memberVisible = await listJournals(member.token, spaceId, 'note')
  assert.equal(memberVisible.some((entry) => entry.id === privateEntry.id), false)
  const privateDetail = await apiRaw(
    `/spaces/${encodeURIComponent(spaceId)}/journals/${encodeURIComponent(privateEntry.id)}`,
    { token: member.token },
  )
  assert.equal(privateDetail.status, 404)
  console.log('PASS HTTP 私密记录对空间成员不可见')

  const serverUpdated = await apiOk(
    `/spaces/${encodeURIComponent(spaceId)}/journals/${encodeURIComponent(created.id)}`,
    {
      method: 'PUT',
      token: owner.token,
      headers: {
        'If-Match': `"${created.version}"`,
        'Idempotency-Key': `b5_update_${suffix}`,
      },
      body: {
        kind: 'note',
        title: `${title}·服务端更新`,
        content: '另一处已经更新。',
        category: 'other',
        visibility: 'space',
      },
    },
  )
  assert.equal(serverUpdated.version, 2)

  await setApiSession(owner.token, owner, ownerIdentity)
  const editPage = await open(`/pages/journal-form/index?id=${encodeURIComponent(created.id)}`)
  await waitFor(async () => {
    const data = await editPage.data()
    return !data.loading && data.version === 2
  }, '编辑页加载最新版本')
  await editPage.setData({
    version: 1,
    form: { title: `${title}·旧页面`, content: '基于旧版本保存。' },
  })
  await editPage.callMethod('onSave')
  await waitFor(async () => {
    const data = await editPage.data()
    return !data.saving && data.version === 2 && data.form.title === `${title}·服务端更新`
  }, '409 后恢复最新版本')
  console.log('PASS HTTP 版本冲突后自动加载最新记录')

  const detail = await open(`/pages/journal-detail/index?id=${encodeURIComponent(created.id)}`)
  await waitFor(async () => {
    const data = await detail.data()
    return !data.loading && data.entry?.version === 2
  }, '详情加载删除前版本')
  await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
  await detail.callMethod('onDelete')
  await waitFor(async () => {
    const result = await apiRaw(
      `/spaces/${encodeURIComponent(spaceId)}/journals/${encodeURIComponent(created.id)}`,
      { token: owner.token },
    )
    return result.status === 404
  }, '软删除后接口不可见')
  await miniProgram.restoreWxMethod('showModal')
  console.log('PASS HTTP 前端软删除生活记录')
} finally {
  await miniProgram.restoreWxMethod('showModal').catch(() => undefined)
  await miniProgram.disconnect().catch(() => undefined)
}
