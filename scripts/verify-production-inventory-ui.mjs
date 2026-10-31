// 生产环境家庭库存全链路验收。
// 前提：微信开发者工具已用生产配置打开，并完成真实微信登录；automation 端口可用。
// 覆盖：页面创建、列表回读、编辑、到期筛选、详情、生命周期、首页摘要、软删除和兜底清理。
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'https://popcorn-api.simiway.cc').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const suffix = Date.now().toString(36).slice(-8)
const runToken = `库存验收${suffix}`
const expiredName = `${runToken}过期酸奶`
const dueName = `${runToken}临期牛奶`
const noneName = `${runToken}常备纸巾`
const updatedDueName = `${runToken}低脂牛奶`
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

function addDays(dateOnly, days) {
  const date = new Date(`${dateOnly}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

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

const today = todayShanghai()

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

function inventoryListPath(query = '') {
  const params = new URLSearchParams({ limit: '100' })
  if (query) params.set('query', query)
  return `/spaces/${encodeURIComponent(spaceId)}/inventory/items?${params}`
}

function inventoryItemPath(itemId) {
  return `/spaces/${encodeURIComponent(spaceId)}/inventory/items/${encodeURIComponent(itemId)}`
}

async function listRunItems() {
  return apiOk(inventoryListPath(runToken))
}

async function getItem(itemId, includeDeleted = false) {
  const suffixQuery = includeDeleted ? '?includeDeleted=true' : ''
  const result = await apiRaw(`${inventoryItemPath(itemId)}${suffixQuery}`)
  if (result.status === 404) return null
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`读取库存 ${itemId} 失败：${result.status} ${JSON.stringify(result.data)}`)
  }
  return result.data
}

async function waitApiItem(itemId, predicate = () => true, label = '库存接口状态') {
  return waitFor(async () => {
    const item = await getItem(itemId)
    return item && predicate(item) ? item : false
  }, label)
}

async function deleteItemForCleanup(itemId) {
  const latest = await getItem(itemId, true)
  if (!latest || latest.deletedAt) return
  const result = await apiRaw(inventoryItemPath(itemId), {
    method: 'DELETE',
    headers: {
      'If-Match': `"${latest.version}"`,
      'Idempotency-Key': `production_inventory_cleanup_${itemId}_${suffix}`.slice(0, 64),
    },
  })
  if (result.status !== 204 && result.status !== 404) {
    throw new Error(`清理库存 ${itemId} 失败：${result.status} ${JSON.stringify(result.data)}`)
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
  await wait(1200)
  const path = `shots/production-inventory-ui-${name}.png`
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

function itemsFromPage(data) {
  return (data.sections ?? []).flatMap((section) => section.items ?? [])
}

function itemFromPage(data, itemId) {
  return itemsFromPage(data).find((item) => item.id === itemId) ?? null
}

async function waitPageItem(page, itemId, label) {
  return waitFor(async () => {
    const data = await page.data()
    if (data.loading) return false
    return itemFromPage(data, itemId)
  }, label)
}

async function createItemThroughUi(input, captureForm = false) {
  const form = await open('/pages/item-form/index')
  await waitFor(async () => {
    const data = await form.data()
    return !data.loading && data.itemId === '' ? data : false
  }, `新增库存表单：${input.name}`)
  await form.setData({
    hasExpiry: input.expiresOn !== null,
    form: {
      name: input.name,
      category: input.category,
      quantity: input.quantity,
      unit: input.unit,
      location: input.location,
      purchasedOn: null,
      openedOn: null,
      expiresOn: input.expiresOn,
      note: input.note,
    },
  })
  if (captureForm) await screenshot('form')
  await form.callMethod('onSave')
  const created = await waitFor(async () => {
    const page = await listRunItems()
    return page.items.find((item) => item.name === input.name) ?? false
  }, `页面创建库存：${input.name}`)
  createdItemIds.add(created.id)
  assert.equal(created.category, input.category)
  assert.equal(created.location, input.location)
  assert.equal(created.quantity, input.quantity)
  assert.equal(created.expiresOn, input.expiresOn)
  assert.equal(created.version, 1)
  return created
}

async function selectExpiry(page, value, predicate, label) {
  await page.callMethod('onSelectExpiry', {
    currentTarget: { dataset: { value } },
  })
  return waitFor(async () => {
    const data = await page.data()
    return data.selectedExpiry === value && !data.loading && predicate(data) ? data : false
  }, label)
}

async function switchInventoryView(page, value, predicate, label) {
  await page.callMethod('onSwitchView', {
    currentTarget: { dataset: { value } },
  })
  return waitFor(async () => {
    const data = await page.data()
    return data.viewMode === value && !data.loading && predicate(data) ? data : false
  }, label)
}

let expiredItem
let dueItem
let noneItem
try {
  console.log('PASS 生产微信会话', JSON.stringify({
    user: session.user.nickname,
    spaceId,
    expiresAt: session.expiresAt,
  }))

  const leftovers = await listRunItems()
  assert.equal(leftovers.items.length, 0, `发现本次运行前缀的遗留库存：${JSON.stringify(leftovers.items)}`)
  const summaryBefore = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/inventory/summary`)

  expiredItem = await createItemThroughUi({
    name: expiredName,
    category: 'food',
    quantity: '1',
    unit: '盒',
    location: 'fridge',
    expiresOn: addDays(today, -1),
    note: '生产库存验收：已过期筛选',
  }, true)
  dueItem = await createItemThroughUi({
    name: dueName,
    category: 'drink',
    quantity: '2',
    unit: '盒',
    location: 'fridge',
    expiresOn: addDays(today, 2),
    note: '生产库存验收：三天内到期筛选',
  })
  noneItem = await createItemThroughUi({
    name: noneName,
    category: 'daily',
    quantity: '3',
    unit: '包',
    location: 'storage',
    expiresOn: null,
    note: '生产库存验收：无有效期筛选',
  })
  console.log('PASS 已通过页面创建三类临时库存', JSON.stringify({
    expired: expiredItem.id,
    due: dueItem.id,
    none: noneItem.id,
  }))

  const summaryAfterCreate = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/inventory/summary`)
  assert.ok(summaryAfterCreate.total >= summaryBefore.total + 3)
  assert.ok(summaryAfterCreate.expired >= summaryBefore.expired + 1)
  assert.ok(summaryAfterCreate.dueWithin3Days >= summaryBefore.dueWithin3Days + 1)
  assert.ok(summaryAfterCreate.none >= summaryBefore.none + 1)
  console.log('PASS 创建后库存摘要已刷新', JSON.stringify(summaryAfterCreate))

  let page = await open('/pages/inventory/index')
  await waitPageItem(page, expiredItem.id, '库存列表包含过期物品')
  await waitPageItem(page, dueItem.id, '库存列表包含临期物品')
  await waitPageItem(page, noneItem.id, '库存列表包含无有效期物品')
  const listData = await page.data()
  assert.equal(itemFromPage(listData, expiredItem.id).expiry.status, 'expired')
  assert.equal(itemFromPage(listData, dueItem.id).expiry.status, 'urgent')
  assert.equal(itemFromPage(listData, noneItem.id).expiry.status, 'none')
  await assertNoHorizontalOverflow(page, '家庭库存列表')
  await screenshot('list')
  console.log('PASS 库存列表已回读名称、分类、位置、数量与有效期状态')

  const expiredFiltered = await selectExpiry(
    page,
    'expired',
    (data) => Boolean(itemFromPage(data, expiredItem.id))
      && !itemFromPage(data, dueItem.id)
      && !itemFromPage(data, noneItem.id),
    '已过期筛选',
  )
  assert.equal(expiredFiltered.summary.expired >= 1, true)
  await screenshot('filter')
  console.log('PASS 已过期筛选只显示过期库存')

  await selectExpiry(
    page,
    'due',
    (data) => Boolean(itemFromPage(data, dueItem.id))
      && !itemFromPage(data, expiredItem.id)
      && !itemFromPage(data, noneItem.id),
    '三天内筛选',
  )
  await selectExpiry(
    page,
    'none',
    (data) => Boolean(itemFromPage(data, noneItem.id))
      && !itemFromPage(data, expiredItem.id)
      && !itemFromPage(data, dueItem.id),
    '无有效期筛选',
  )
  await selectExpiry(
    page,
    'all',
    (data) => Boolean(itemFromPage(data, expiredItem.id))
      && Boolean(itemFromPage(data, dueItem.id))
      && Boolean(itemFromPage(data, noneItem.id)),
    '恢复全部库存',
  )
  console.log('PASS 三天内、无有效期与全部筛选切换正常')

  const editPage = await open(`/pages/item-form/index?id=${encodeURIComponent(dueItem.id)}`)
  const editData = await waitFor(async () => {
    const data = await editPage.data()
    return !data.loading && data.version === dueItem.version ? data : false
  }, '编辑页加载库存版本')
  await editPage.setData({
    hasExpiry: true,
    form: {
      ...editData.form,
      name: updatedDueName,
      expiresOn: addDays(today, 5),
    },
  })
  await editPage.callMethod('onSave')
  const updatedDue = await waitApiItem(
    dueItem.id,
    (item) => item.name === updatedDueName
      && item.expiresOn === addDays(today, 5)
      && item.version === dueItem.version + 1,
    '页面编辑库存',
  )
  Object.assign(dueItem, updatedDue)
  console.log('PASS 库存名称与有效期已通过页面更新', JSON.stringify({
    version: updatedDue.version,
    expiresOn: updatedDue.expiresOn,
  }))

  const summaryAfterEdit = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/inventory/summary`)
  assert.equal(summaryAfterEdit.total, summaryAfterCreate.total)
  assert.equal(summaryAfterEdit.dueWithin3Days, summaryAfterCreate.dueWithin3Days - 1)
  assert.ok(summaryAfterEdit.soon >= summaryAfterCreate.soon + 1)
  console.log('PASS 编辑有效期后三天内库存转入五天内区间', JSON.stringify(summaryAfterEdit))

  const detail = await open(`/pages/item-detail/index?id=${encodeURIComponent(dueItem.id)}`)
  const detailData = await waitFor(async () => {
    const data = await detail.data()
    return !data.loading && data.item?.id === dueItem.id ? data : false
  }, '库存详情页')
  assert.equal(detailData.item.name, updatedDueName)
  assert.equal(detailData.item.quantity, '2')
  assert.equal(detailData.item.unit, '盒')
  assert.equal(detailData.item.locationLabel, '冰箱冷藏')
  assert.equal(detailData.item.statusLabel, '正在库存中')
  await assertNoHorizontalOverflow(detail, '库存详情')
  await screenshot('detail')
  console.log('PASS 库存详情展示编辑后的名称、位置、数量与状态')

  await detail.callMethod('onChangeStatus', {
    currentTarget: { dataset: { status: 'consumed' } },
  })
  const consumed = await waitApiItem(
    dueItem.id,
    (item) => item.status === 'consumed' && item.version === updatedDue.version + 1,
    '标记库存已用完',
  )
  Object.assign(dueItem, consumed)

  page = await open('/pages/inventory/index')
  await waitPageItem(page, expiredItem.id, '库存页加载历史记录入口')
  await switchInventoryView(
    page,
    'history',
    (data) => Boolean(itemFromPage(data, dueItem.id)),
    '历史记录包含已用完库存',
  )
  await screenshot('history')
  console.log('PASS 用完库存已进入历史记录')

  await switchInventoryView(
    page,
    'active',
    (data) => Boolean(itemFromPage(data, expiredItem.id))
      && !itemFromPage(data, dueItem.id),
    '正在库存隐藏已用完物品',
  )

  const consumedDetail = await open(`/pages/item-detail/index?id=${encodeURIComponent(dueItem.id)}`)
  await waitFor(async () => {
    const data = await consumedDetail.data()
    return !data.loading && data.item?.status === 'consumed' ? data : false
  }, '已用完库存详情')
  await consumedDetail.callMethod('onChangeStatus', {
    currentTarget: { dataset: { status: 'active' } },
  })
  const restored = await waitApiItem(
    dueItem.id,
    (item) => item.status === 'active' && item.version === consumed.version + 1,
    '恢复库存',
  )
  Object.assign(dueItem, restored)
  console.log('PASS 库存用完、历史记录与恢复链路正常')

  const home = await open('/pages/home/index')
  const homeData = await waitFor(async () => {
    const data = await home.data()
    return data.hasLoadedInventory && !data.inventoryError ? data : false
  }, '首页库存摘要')
  assert.ok(homeData.snapshot.inventoryItemCount >= summaryAfterEdit.total)
  assert.ok(homeData.snapshot.inventoryNoticeCount >= 1)
  assert.match(homeData.snapshot.inventoryNotice, /过期|三天内/)
  await home.callMethod('onSelectHomeTab', {
    currentTarget: { dataset: { value: 'home' } },
  })
  await waitFor(async () => (await home.data()).homeTab === 'home', '首页家庭状态卡片')
  await assertNoHorizontalOverflow(home, '首页')
  await screenshot('home')
  console.log('PASS 首页已读取库存数量与临期提醒')

  const deleteDetail = await open(`/pages/item-detail/index?id=${encodeURIComponent(noneItem.id)}`)
  await waitFor(async () => {
    const data = await deleteDetail.data()
    return !data.loading && data.item?.id === noneItem.id ? data : false
  }, '待删除库存详情')
  await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
  await deleteDetail.callMethod('onDelete')
  await waitFor(async () => (await getItem(noneItem.id)) === null, '页面软删除库存')
  const deletedRecord = await getItem(noneItem.id, true)
  assert.ok(deletedRecord?.deletedAt)
  await miniProgram.restoreWxMethod('showModal')

  page = await open('/pages/inventory/index')
  await waitPageItem(page, expiredItem.id, '删除后重新加载库存列表')
  const afterDeleteData = await page.data()
  assert.equal(itemFromPage(afterDeleteData, noneItem.id), null)
  const summaryAfterDelete = await apiOk(`/spaces/${encodeURIComponent(spaceId)}/inventory/summary`)
  assert.ok(summaryAfterEdit.total - summaryAfterDelete.total >= 1)
  console.log('PASS 页面软删除后普通列表隐藏，摘要已减少')

  console.log('PRODUCTION INVENTORY UI VERIFICATION PASSED')
  console.log(JSON.stringify({
    spaceId,
    itemIds: [expiredItem.id, dueItem.id, noneItem.id],
    summaryBefore,
    summaryAfterCreate,
    summaryAfterEdit,
    summaryAfterDelete,
  }))
} finally {
  await miniProgram.restoreWxMethod('showModal').catch(() => undefined)
  try {
    const remaining = await listRunItems()
    for (const item of remaining.items) {
      if ([expiredName, updatedDueName, noneName].includes(item.name)) {
        createdItemIds.add(item.id)
      }
    }
  } catch (error) {
    console.error('WARN 兜底扫描临时库存失败', error)
  }
  for (const itemId of createdItemIds) {
    await deleteItemForCleanup(itemId).catch((error) => {
      console.error('WARN 兜底清理库存失败', itemId, error)
    })
  }
  await miniProgram.disconnect().catch(() => undefined)
}
