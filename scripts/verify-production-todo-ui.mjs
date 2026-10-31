// 生产环境待办与小计划全链路验收。
// 前提：微信开发者工具已用生产配置打开，并完成真实微信登录；automation 端口可用。
// 覆盖：五类页面创建、列表回读、分类筛选、编辑、完成/重开、准备项、版本冲突、账单规则、摘要与兜底清理。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'https://popcorn-api.simiway.cc').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const suffix = Date.now().toString(36).slice(-8)
const runToken = `待办验收${suffix}`
const travelTitle = `${runToken}旅行准备`
const travelTitleUpdated = `${runToken}旅行准备已更新`
const travelTitleConflict = `${runToken}旅行准备协作更新`
const planTitle = `${runToken}小计划`
const fitnessTitle = `${runToken}健身计划`
const mealTitle = `${runToken}今天吃什么`
const expenseTitle = `${runToken}共同账单`
let miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const token = await miniProgram.callWxMethod('getStorageSync', tokenKey)
const session = await miniProgram.callWxMethod('getStorageSync', sessionKey)
assert.equal(typeof token, 'string')
assert.ok(token, '生产微信会话不存在，请先在开发者工具完成微信登录')
assert.ok(session?.activeSpaceId, '生产会话没有活动空间')
assert.ok(session?.user?.id, '生产会话没有用户信息')
const spaceId = session.activeSpaceId
const createdItemIds = new Set()

function todayShanghai() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

const today = todayShanghai()
const travelDate = addDays(today, 6)
const travelDateUpdated = addDays(today, 8)

async function apiRaw(path, options = {}) {
  const headers = { ...(options.headers ?? {}) }
  if (token) headers.Authorization = `Bearer ${token}`
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
  return { status: response.status, data }
}

async function apiOk(path, options = {}) {
  const result = await apiRaw(path, options)
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${result.status}: ${JSON.stringify(result.data)}`)
  }
  return result.data
}

function todoListPath(query = '') {
  const params = new URLSearchParams({ limit: '100' })
  if (query) params.set('query', query)
  return `/spaces/${encodeURIComponent(spaceId)}/todos?${params}`
}

function todoItemPath(itemId) {
  return `/spaces/${encodeURIComponent(spaceId)}/todos/${encodeURIComponent(itemId)}`
}

async function listRunItems() {
  return apiOk(todoListPath(runToken))
}

async function getItem(itemId) {
  const result = await apiRaw(todoItemPath(itemId))
  if (result.status === 404) return null
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`读取待办 ${itemId} 失败：${result.status} ${JSON.stringify(result.data)}`)
  }
  return result.data
}

async function waitApiItem(itemId, predicate = () => true, label = '待办接口状态') {
  return waitFor(async () => {
    const item = await getItem(itemId)
    return item && predicate(item) ? item : false
  }, label)
}

async function updateItemForConflict(item, title) {
  const result = await apiRaw(todoItemPath(item.id), {
    method: 'PUT',
    headers: {
      'If-Match': `"${item.version}"`,
      'Idempotency-Key': `production_todo_conflict_${suffix}`.slice(0, 64),
    },
    body: {
      kind: item.kind,
      title,
      note: item.note,
      dueDate: item.dueDate,
      destination: item.destination,
      checklist: item.checklist.map((entry) => ({
        id: entry.id,
        text: entry.text,
        done: entry.done,
      })),
      exercise: item.exercise,
      durationMinutes: item.durationMinutes,
      calories: item.calories,
      mealType: item.mealType,
      amount: item.amount,
      merchant: item.merchant,
    },
  })
  if (result.status !== 200) {
    throw new Error(`制造待办版本冲突失败：${result.status} ${JSON.stringify(result.data)}`)
  }
  return result.data
}

async function deleteItemForCleanup(itemId) {
  const latest = await getItem(itemId)
  if (!latest) return
  const result = await apiRaw(todoItemPath(itemId), {
    method: 'DELETE',
    headers: {
      'If-Match': `"${latest.version}"`,
      'Idempotency-Key': `production_todo_cleanup_${itemId}_${suffix}`.slice(0, 64),
    },
  })
  if (result.status !== 204 && result.status !== 404) {
    throw new Error(`清理待办 ${itemId} 失败：${result.status} ${JSON.stringify(result.data)}`)
  }
}

async function open(url) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const page = await miniProgram.reLaunch(url)
      await wait(500)
      if (!page) throw new Error(`页面打开失败：${url}`)
      return page
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === 0 && /timeout|Connection closed/i.test(message)) {
        console.warn(`WARN 页面打开超时，重连自动化后重试：${url}`)
        await miniProgram.disconnect().catch(() => undefined)
        await wait(1200)
        miniProgram = await automator.connect({ wsEndpoint })
        continue
      }
      throw error
    }
  }
  throw lastError
}

async function waitFor(check, label, timeoutMs = 30000) {
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
  await miniProgram.callWxMethod('hideToast').catch(() => undefined)
  await wait(350)
  await miniProgram.pageScrollTo(0)
  await wait(1000)
  const path = `shots/production-todo-ui-${name}.png`
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

function todoForm(kind, title, overrides = {}) {
  return {
    kind,
    title,
    note: `${runToken} 临时验收备注`,
    dueDate: today,
    destination: '',
    checklistText: '',
    exercise: '',
    durationMinutes: '',
    calories: '',
    mealType: 'dinner',
    amount: '',
    merchant: '',
    ...overrides,
  }
}

function itemFromPage(data, itemId) {
  return (data.allItems ?? []).find((item) => item.id === itemId) ?? null
}

function itemViewFromPage(data, itemId) {
  return (data.items ?? []).find((item) => item.id === itemId) ?? null
}

async function waitPageItem(page, itemId, label) {
  return waitFor(async () => {
    const data = await page.data()
    if (data.loading) return false
    return itemFromPage(data, itemId)
  }, label)
}

async function createTodoThroughUi({ kind, title, overrides = {}, capture }) {
  const form = await open(`/pages/todo-form/index?kind=${kind}`)
  await waitFor(async () => {
    const data = await form.data()
    return !data.loading && data.itemId === '' ? data : false
  }, `新增待办表单：${kind}`)
  const formValue = todoForm(kind, title, overrides)
  await form.setData({ form: formValue })
  await form.callMethod('onDateChange', {
    detail: { value: formValue.dueDate },
  })
  if (kind === 'fitness') {
    await form.callMethod('onEstimateCalories')
    await waitFor(async () => {
      const data = await form.data()
      return data.form?.calories ? data : false
    }, '健身热量粗算')
  }
  if (capture) await screenshot(capture)
  await form.callMethod('onSave')
  const item = await waitFor(async () => {
    const page = await listRunItems()
    return page.items.find((entry) => entry.title === title) ?? false
  }, `页面创建待办：${title}`)
  createdItemIds.add(item.id)
  return item
}

try {
  console.log('PASS 生产微信会话', JSON.stringify({
    user: session.user.nickname,
    spaceId,
    expiresAt: session.expiresAt,
  }))

  const summaryBefore = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/todos/summary`)

  const travel = await createTodoThroughUi({
    kind: 'travel',
    title: travelTitle,
    overrides: {
      destination: '大理',
      checklistText: '身份证\n充电器\n常用药',
      dueDate: travelDate,
    },
    capture: 'travel-form',
  })
  assert.equal(travel.destination, '大理')
  assert.equal(travel.checklist.length, 3)
  assert.equal(travel.dueDate, travelDate)
  assert.equal(travel.done, false)

  const plan = await createTodoThroughUi({
    kind: 'plan',
    title: planTitle,
    overrides: { dueDate: today, note: `${runToken} 周末整理换季衣物` },
  })
  assert.equal(plan.done, false)

  const fitness = await createTodoThroughUi({
    kind: 'fitness',
    title: fitnessTitle,
    overrides: { exercise: '快走', durationMinutes: '30', calories: '150' },
    capture: 'fitness-form',
  })
  assert.equal(fitness.exercise, '快走')
  assert.equal(fitness.durationMinutes, 30)
  assert.ok(fitness.calories > 0)

  const meal = await createTodoThroughUi({
    kind: 'meal',
    title: mealTitle,
    overrides: { mealType: 'dinner', note: `${runToken} 番茄牛腩配米饭` },
    capture: 'meal-form',
  })
  assert.equal(meal.mealType, 'dinner')

  const expense = await createTodoThroughUi({
    kind: 'expense',
    title: expenseTitle,
    overrides: { amount: '66.80', merchant: '社区小店', dueDate: today },
    capture: 'expense-form',
  })
  assert.equal(expense.amount, '66.80')
  assert.equal(expense.merchant, '社区小店')
  assert.equal(expense.done, true)

  const runItemsAfterCreate = await listRunItems()
  assert.equal(runItemsAfterCreate.items.length, 5)
  assert.equal(runItemsAfterCreate.items.filter((item) => item.done).length, 1)
  console.log('PASS 五类待办已通过生产页面创建并回读字段', JSON.stringify({
    travel: travel.id,
    plan: plan.id,
    fitness: fitness.id,
    meal: meal.id,
    expense: expense.id,
  }))

  const summaryAfterCreate = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/todos/summary`)
  assert.ok(summaryAfterCreate.total >= summaryBefore.total + 5)
  assert.ok(summaryAfterCreate.pending >= summaryBefore.pending + 4)
  assert.ok(summaryAfterCreate.completed >= summaryBefore.completed + 1)
  assert.ok(summaryAfterCreate.pendingByKind.travel >= summaryBefore.pendingByKind.travel + 1)
  assert.ok(summaryAfterCreate.pendingByKind.plan >= summaryBefore.pendingByKind.plan + 1)
  assert.ok(summaryAfterCreate.pendingByKind.fitness >= summaryBefore.pendingByKind.fitness + 1)
  assert.ok(summaryAfterCreate.pendingByKind.meal >= summaryBefore.pendingByKind.meal + 1)
  assert.equal(summaryAfterCreate.pendingByKind.expense, 0)
  console.log('PASS 待办摘要已同步五类数量，账单不占未完成', JSON.stringify(summaryAfterCreate))

  let page = await open('/pages/todo/index')
  await waitPageItem(page, travel.id, '待办列表包含旅行准备')
  await waitPageItem(page, plan.id, '待办列表包含小计划')
  await waitPageItem(page, fitness.id, '待办列表包含健身计划')
  await waitPageItem(page, meal.id, '待办列表包含今天吃什么')
  await waitPageItem(page, expense.id, '待办列表包含账单')

  const listData = await page.data()
  assert.equal(itemViewFromPage(listData, travel.id).checklistText, '0/3 已准备')
  assert.match(itemViewFromPage(listData, fitness.id).meta, /快走 · 30 分钟 · \d+ kcal/)
  assert.match(itemViewFromPage(listData, expense.id).meta, /¥66\.80/)
  await assertNoHorizontalOverflow(page, '待办列表')
  await screenshot('list')
  console.log('PASS 待办列表已回读分类、准备进度、健身与账单字段')

  async function selectKind(kind, predicate, label) {
    await page.callMethod('onSelectFilter', {
      currentTarget: { dataset: { kind } },
    })
    return waitFor(async () => {
      const data = await page.data()
      if (data.activeKind !== kind || !predicate(data)) return false
      return data
    }, label)
  }

  await selectKind(
    'travel',
    (data) => Boolean(itemViewFromPage(data, travel.id))
      && data.items.every((item) => item.kind === 'travel'),
    '旅行准备分类筛选',
  )
  await screenshot('filter')
  await selectKind(
    'fitness',
    (data) => Boolean(itemViewFromPage(data, fitness.id))
      && data.items.every((item) => item.kind === 'fitness'),
    '健身分类筛选',
  )
  await selectKind(
    'meal',
    (data) => Boolean(itemViewFromPage(data, meal.id))
      && data.items.every((item) => item.kind === 'meal'),
    '吃什么分类筛选',
  )
  await selectKind(
    'expense',
    (data) => Boolean(itemViewFromPage(data, expense.id))
      && data.items.every((item) => item.kind === 'expense'),
    '账单分类筛选',
  )
  await selectKind('all', (data) => Boolean(itemViewFromPage(data, travel.id)), '恢复全部待办')
  console.log('PASS 旅行、健身、吃什么、账单分类筛选正常')

  const editPage = await open(`/pages/todo-form/index?id=${encodeURIComponent(travel.id)}`)
  const editData = await waitFor(async () => {
    const data = await editPage.data()
    return !data.loading && data.version === travel.version ? data : false
  }, '编辑页加载旅行准备版本')
  await editPage.setData({
    form: {
      ...editData.form,
      title: travelTitleUpdated,
      dueDate: travelDateUpdated,
    },
  })
  await editPage.callMethod('onDateChange', {
    detail: { value: travelDateUpdated },
  })
  await editPage.callMethod('onSave')
  const travelUpdated = await waitApiItem(
    travel.id,
    (item) => item.title === travelTitleUpdated
      && item.dueDate === travelDateUpdated
      && item.version === travel.version + 1,
    '页面编辑旅行准备',
  )
  Object.assign(travel, travelUpdated)
  console.log('PASS 旅行准备标题与日期已通过页面更新', JSON.stringify({
    version: travelUpdated.version,
    dueDate: travelUpdated.dueDate,
  }))

  page = await open('/pages/todo/index')
  const pageTravel = await waitPageItem(page, travel.id, '列表加载编辑后的旅行准备')
  const firstChecklist = pageTravel.checklist[0]
  assert.ok(firstChecklist?.id)
  await page.callMethod('onToggleChecklist', {
    currentTarget: {
      dataset: {
        parentId: travel.id,
        checklistId: firstChecklist.id,
      },
    },
  })
  const travelChecked = await waitApiItem(
    travel.id,
    (item) => item.checklist[0]?.done === true && item.version === travel.version + 1,
    '勾选旅行准备项',
  )
  Object.assign(travel, travelChecked)
  const checklistView = await waitFor(async () => {
    const data = await page.data()
    const item = itemViewFromPage(data, travel.id)
    return item?.checklistText === '1/3 已准备' ? item : false
  }, '页面刷新准备进度')
  assert.equal(checklistView.checklistDone, 1)
  await screenshot('checklist')
  console.log('PASS 旅行准备项已勾选，父待办版本与进度同步递增')

  await page.callMethod('onToggleItem', {
    currentTarget: { dataset: { id: plan.id } },
  })
  const planDone = await waitApiItem(
    plan.id,
    (item) => item.done === true && item.version === plan.version + 1,
    '完成小计划',
  )
  Object.assign(plan, planDone)
  await page.callMethod('onToggleItem', {
    currentTarget: { dataset: { id: plan.id } },
  })
  const planReopened = await waitApiItem(
    plan.id,
    (item) => item.done === false && item.version === planDone.version + 1,
    '重开小计划',
  )
  Object.assign(plan, planReopened)
  console.log('PASS 普通待办完成与重新打开版本流转正常')

  const expenseBeforeToggle = await getItem(expense.id)
  await page.callMethod('onToggleItem', {
    currentTarget: { dataset: { id: expense.id } },
  })
  await wait(800)
  const expenseAfterToggle = await getItem(expense.id)
  assert.equal(expenseAfterToggle.done, true)
  assert.equal(expenseAfterToggle.version, expenseBeforeToggle.version)
  console.log('PASS 账单保持已完成，不会被误重开')

  page = await open('/pages/todo/index')
  const conflictBase = await waitPageItem(page, travel.id, '冲突前加载旅行准备旧版本')
  assert.equal(conflictBase.version, travel.version)
  const conflictUpdated = await updateItemForConflict(travel, travelTitleConflict)
  assert.equal(conflictUpdated.version, travel.version + 1)
  await page.callMethod('onToggleItem', {
    currentTarget: { dataset: { id: travel.id } },
  })
  const refreshedAfterConflict = await waitFor(async () => {
    const data = await page.data()
    const item = itemFromPage(data, travel.id)
    return item?.title === travelTitleConflict && item.version === conflictUpdated.version
      ? item
      : false
  }, '版本冲突后自动刷新')
  assert.equal(refreshedAfterConflict.done, false)
  const afterConflict = await getItem(travel.id)
  assert.equal(afterConflict.title, travelTitleConflict)
  assert.equal(afterConflict.done, false)
  assert.equal(afterConflict.version, conflictUpdated.version)
  Object.assign(travel, afterConflict)
  await screenshot('conflict-recovered')
  console.log('PASS 旧版本写入冲突后自动刷新，未覆盖协作更新')

  const deletePage = await open(`/pages/todo-form/index?id=${encodeURIComponent(plan.id)}`)
  await waitFor(async () => {
    const data = await deletePage.data()
    return !data.loading && data.version === plan.version ? data : false
  }, '删除前加载小计划版本')
  await deletePage.callMethod('deleteItem')
  await waitFor(async () => (await getItem(plan.id)) === null, '页面软删除小计划')
  const remainingAfterDelete = await listRunItems()
  assert.equal(remainingAfterDelete.items.some((item) => item.id === plan.id), false)
  const summaryAfterDelete = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/todos/summary`)
  assert.equal(summaryAfterCreate.total - summaryAfterDelete.total, 1)
  assert.ok(summaryAfterDelete.pending >= summaryBefore.pending + 3)
  console.log('PASS 待办页面软删除后列表与摘要同步减少')

  for (const itemId of [travel.id, fitness.id, meal.id, expense.id]) {
    await deleteItemForCleanup(itemId)
  }
  const finalItems = await listRunItems()
  assert.deepEqual(finalItems.items, [])
  console.log('PRODUCTION TODO UI VERIFICATION PASSED')
  console.log(JSON.stringify({
    spaceId,
    summaryBefore,
    summaryAfterCreate,
    summaryAfterDelete,
    itemIds: [...createdItemIds],
    finalTravelVersion: travel.version,
  }))
} finally {
  try {
    const remaining = await listRunItems()
    for (const item of remaining.items) {
      createdItemIds.add(item.id)
    }
  } catch (error) {
    console.error('WARN 兜底扫描临时待办失败', error)
  }
  for (const itemId of createdItemIds) {
    await deleteItemForCleanup(itemId).catch((error) => {
      console.error('WARN 兜底清理待办失败', itemId, error)
    })
  }
  let finalLeftovers = []
  try {
    finalLeftovers = (await listRunItems()).items.map((item) => ({
      id: item.id,
      title: item.title,
    }))
  } catch (error) {
    console.error('WARN 最终扫描临时待办失败', error)
  }
  console.log('FINAL_LEFTOVERS', JSON.stringify(finalLeftovers))
  await miniProgram.disconnect().catch(() => undefined)
}
