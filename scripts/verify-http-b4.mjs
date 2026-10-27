// 连接已开启自动化端口的微信开发者工具，验证 B4 待办真实 HTTP 链路。
// 前提：env.ts 已切换为 local + HTTP + mock 登录，且本地 API 可访问。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const runtimeErrors = []
const suffix = Date.now().toString().slice(-10)
const ownerIdentity = `tdo${suffix}`
const memberIdentity = `tdm${suffix}`
const ownerNickname = `B4房主${suffix.slice(-4)}`
const memberNickname = `B4成员${suffix.slice(-4)}`
const travelTitle = `B4旅行${suffix.slice(-4)}`
const travelTitleUpdated = `${travelTitle}已协作更新`
const expenseTitle = `B4账单${suffix.slice(-4)}`
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
    body: { identity, deviceLabel: 'B4 HTTP 验收' },
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

async function listApiTodos(token, spaceId, query = '') {
  const search = new URLSearchParams({ limit: '100' })
  if (query) search.set('query', query)
  const page = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/todos?${search}`, { token })
  return page.items
}

async function waitApiTodo(token, spaceId, id, predicate = () => true, label = '待办接口状态') {
  return waitFor(async () => {
    const result = await apiRaw(`/spaces/${encodeURIComponent(spaceId)}/todos/${encodeURIComponent(id)}`, { token })
    return result.status === 200 && predicate(result.data) ? result.data : false
  }, label)
}

async function waitUiItem(token, session, identity, id, predicate = () => true, label = '待办页可见') {
  await setApiSession(token, session, identity)
  const page = await open('/pages/todo/index')
  return waitFor(async () => {
    const data = await page.data()
    if (data.loading) return false
    const item = (data.items ?? []).find((entry) => entry.id === id)
    return item && predicate(item) ? item : false
  }, label)
}

try {
  const owner = await login(ownerIdentity, ownerNickname, 'mint')
  const spaceId = owner.activeSpaceId
  assert.ok(spaceId, 'owner 应拥有默认空间')
  const member = await login(memberIdentity, memberNickname, 'peach')
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
  const travelForm = await open('/pages/todo-form/index?kind=travel')
  await waitFor(async () => (await travelForm.data()).loading === false, '旅行待办表单')
  await travelForm.setData({
    form: {
      kind: 'travel',
      title: travelTitle,
      note: 'B4 HTTP 验收旅行',
      dueDate: '2026-11-08',
      destination: '大理',
      checklistText: '身份证\n充电器\n防晒\n身份证',
      exercise: '',
      durationMinutes: '',
      calories: '',
      mealType: 'dinner',
      amount: '',
      merchant: '',
    },
  })
  await travelForm.callMethod('onSave')

  const travel = await waitFor(async () => {
    const items = await listApiTodos(owner.token, spaceId, travelTitle)
    return items.find((item) => item.title === travelTitle) ?? false
  }, '前端创建旅行待办')
  assert.equal(travel.version, 1)
  assert.deepEqual(travel.checklist.map((item) => item.text), ['身份证', '充电器', '防晒'])
  console.log('PASS HTTP 前端创建旅行待办并去重准备项')

  const ownerVisible = await waitUiItem(
    owner.token,
    owner,
    ownerIdentity,
    travel.id,
    (item) => item.title === travelTitle,
    'owner 待办页可见',
  )
  assert.equal(ownerVisible.checklist.length, 3)
  const memberVisible = await waitUiItem(
    member.token,
    sharedMemberSession,
    memberIdentity,
    travel.id,
    (item) => item.title === travelTitle,
    'member 待办页可见',
  )
  assert.equal(memberVisible.version, 1)
  console.log('PASS HTTP owner/member 双账号读取同一待办')

  const memberPage = await open('/pages/todo/index')
  const memberItem = await waitFor(async () => {
    const data = await memberPage.data()
    if (data.loading) return false
    return (data.items ?? []).find((item) => item.id === travel.id) ?? false
  }, '会员待办页加载完成')
  await memberPage.callMethod('onToggleChecklist', {
    currentTarget: {
      dataset: {
        parentId: travel.id,
        checklistId: memberItem.checklist[0].id,
      },
    },
  })
  const checklistDone = await waitApiTodo(
    member.token,
    spaceId,
    travel.id,
    (item) => item.version === 2 && item.checklist[0]?.done === true,
    '准备项勾选版本递增',
  )
  assert.equal(checklistDone.done, false)
  console.log('PASS HTTP 准备项勾选后父待办版本递增')

  const pageAfterChecklist = await waitFor(async () => {
    const data = await memberPage.data()
    const item = (data.items ?? []).find((entry) => entry.id === travel.id)
    return item?.version === 2 ? item : false
  }, '页面接收准备项完整响应')
  await memberPage.callMethod('onToggleItem', {
    currentTarget: { dataset: { id: pageAfterChecklist.id } },
  })
  const completed = await waitApiTodo(
    member.token,
    spaceId,
    travel.id,
    (item) => item.done === true && item.version === 3,
    '待办完成',
  )
  assert.equal(completed.version, 3)

  const pageAfterComplete = await waitFor(async () => {
    const data = await memberPage.data()
    const item = (data.items ?? []).find((entry) => entry.id === travel.id)
    return item?.version === 3 ? item : false
  }, '页面接收完成响应')
  await memberPage.callMethod('onToggleItem', {
    currentTarget: { dataset: { id: pageAfterComplete.id } },
  })
  const reopened = await waitApiTodo(
    member.token,
    spaceId,
    travel.id,
    (item) => item.done === false && item.version === 4,
    '待办重开',
  )
  assert.equal(reopened.version, 4)
  console.log('PASS HTTP 待办完成与重新打开')

  await setApiSession(member.token, sharedMemberSession, memberIdentity)
  const expenseForm = await open('/pages/todo-form/index?kind=expense')
  await waitFor(async () => (await expenseForm.data()).loading === false, '账单单表单')
  await expenseForm.setData({
    form: {
      kind: 'expense',
      title: expenseTitle,
      note: '两个人的晚饭',
      dueDate: '2026-10-27',
      destination: '',
      checklistText: '',
      exercise: '',
      durationMinutes: '',
      calories: '',
      mealType: 'dinner',
      amount: '66.80',
      merchant: '小店',
    },
  })
  await expenseForm.callMethod('onSave')
  const expense = await waitFor(async () => {
    const items = await listApiTodos(member.token, spaceId, expenseTitle)
    return items.find((item) => item.title === expenseTitle) ?? false
  }, '前端创建账单')
  assert.equal(expense.done, true)
  assert.equal(expense.amount, '66.80')
  assert.equal(expense.version, 1)
  console.log('PASS HTTP 账单创建后自动完成')

  await setApiSession(owner.token, owner, ownerIdentity)
  const stalePage = await open('/pages/todo/index')
  await waitFor(async () => {
    const data = await stalePage.data()
    if (data.loading) return false
    const item = (data.items ?? []).find((entry) => entry.id === travel.id)
    return item?.version === 4 ? item : false
  }, 'owner 加载版本 4')

  const memberFresh = await apiOk(
    `/spaces/${encodeURIComponent(spaceId)}/todos/${encodeURIComponent(travel.id)}`,
    { token: member.token },
  )
  const memberUpdate = await apiRaw(
    `/spaces/${encodeURIComponent(spaceId)}/todos/${encodeURIComponent(travel.id)}`,
    {
      method: 'PUT',
      token: member.token,
      headers: {
        'If-Match': `"${memberFresh.version}"`,
        'Idempotency-Key': `todo_conflict_${suffix}`,
      },
      body: {
        kind: 'travel',
        title: travelTitleUpdated,
        note: memberFresh.note,
        dueDate: memberFresh.dueDate,
        destination: memberFresh.destination,
        checklist: memberFresh.checklist.map((item) => ({
          id: item.id,
          text: item.text,
          done: item.done,
        })),
      },
    },
  )
  assert.equal(memberUpdate.status, 200)
  assert.equal(memberUpdate.data.version, 5)

  await stalePage.callMethod('onToggleItem', {
    currentTarget: { dataset: { id: travel.id } },
  })
  const refreshedAfterConflict = await waitFor(async () => {
    const data = await stalePage.data()
    if (data.loading) return false
    const item = (data.items ?? []).find((entry) => entry.id === travel.id)
    return item?.title === travelTitleUpdated && item.version === 5 ? item : false
  }, '版本冲突后自动刷新')
  assert.equal(refreshedAfterConflict.done, false)
  const afterConflict = await apiOk(
    `/spaces/${encodeURIComponent(spaceId)}/todos/${encodeURIComponent(travel.id)}`,
    { token: owner.token },
  )
  assert.equal(afterConflict.title, travelTitleUpdated)
  assert.equal(afterConflict.version, 5)
  console.log('PASS HTTP 旧版本写入冲突后自动刷新且未覆盖数据')

  const deleteForm = await open(`/pages/todo-form/index?id=${encodeURIComponent(travel.id)}`)
  await waitFor(async () => (await deleteForm.data()).version === 5, '删除前加载版本 5')
  await deleteForm.callMethod('deleteItem')
  await waitFor(async () => {
    const result = await apiRaw(
      `/spaces/${encodeURIComponent(spaceId)}/todos/${encodeURIComponent(travel.id)}`,
      { token: owner.token },
    )
    return result.status === 404
  }, '删除后详情返回 404')
  const remaining = await listApiTodos(owner.token, spaceId, travelTitleUpdated)
  assert.equal(remaining.some((item) => item.id === travel.id), false)
  console.log('PASS HTTP 待办软删除')

  const summary = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/todos/summary`, {
    token: owner.token,
  })
  assert.equal(summary.total, 1)
  assert.equal(summary.completed, 1)
  assert.equal(summary.pendingByKind.expense, 0)
  console.log('PASS HTTP 待办摘要同步')

  assert.deepEqual(runtimeErrors, [])
  console.log('B4 HTTP RUNTIME VERIFICATION PASSED')
  console.log(JSON.stringify({
    spaceId,
    travelTodoId: travel.id,
    expenseTodoId: expense.id,
    finalTravelVersion: 6,
    ownerIdentity,
    memberIdentity,
  }))
} finally {
  await miniProgram.disconnect()
}
