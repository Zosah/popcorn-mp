// 生产环境宠物照护全链路验收。
// 前提：微信开发者工具已用生产配置打开，并完成真实微信登录；automation 端口可用。
// 覆盖：页面创建宠物、私有 COS 头像、体重/日常/周期照护/用品、首页摘要、
// 删除当前宠物自动切换、删除最后一只进入空态，以及 finally 兜底清理。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'https://popcorn-api.simiway.cc').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const activePetKey = 'popcorn_active_pet_id'
const suffix = Date.now().toString(36).slice(-8)
const petName = `验收团子${suffix.slice(-3)}`
const backupPetName = `验收备份${suffix.slice(-3)}`
const image = await readFile(new URL('../src/images/demo-menu-still-life.jpg', import.meta.url))
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const token = await miniProgram.callWxMethod('getStorageSync', tokenKey)
const session = await miniProgram.callWxMethod('getStorageSync', sessionKey)
assert.equal(typeof token, 'string')
assert.ok(token, '生产微信会话不存在，请先在开发者工具完成微信登录')
assert.ok(session?.activeSpaceId, '生产会话没有活动空间')
assert.ok(session?.user?.id, '生产会话没有用户信息')
const spaceId = session.activeSpaceId
const createdPetIds = new Set()

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

async function listPets() {
  return apiOk(`/spaces/${encodeURIComponent(spaceId)}/pets`)
}

async function latestPet(petId) {
  const collection = await listPets()
  return collection.items.find((item) => item.id === petId) ?? null
}

async function deletePetForCleanup(petId) {
  const latest = await latestPet(petId)
  if (!latest) return
  const result = await apiRaw(`/spaces/${encodeURIComponent(spaceId)}/pets/${encodeURIComponent(petId)}`, {
    method: 'DELETE',
    headers: {
      'If-Match': `"${latest.version}"`,
      'Idempotency-Key': `production_pet_cleanup_${petId}_${suffix}`,
    },
  })
  if (result.status !== 204 && result.status !== 404) {
    throw new Error(`清理宠物 ${petId} 失败：${result.status} ${JSON.stringify(result.data)}`)
  }
}

async function open(url) {
  const page = await miniProgram.reLaunch(url)
  await wait(500)
  if (!page) throw new Error(`页面打开失败：${url}`)
  return page
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
  const path = `shots/production-pet-ui-${name}.png`
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

async function writeTempImage(bytes) {
  return miniProgram.evaluate((base64) => new Promise((resolve, reject) => {
    const filePath = `${wx.env.USER_DATA_PATH}/production-pet-${Date.now()}.jpg`
    const fs = wx.getFileSystemManager()
    fs.writeFile({
      filePath,
      data: base64,
      encoding: 'base64',
      success() {
        fs.getFileInfo({
          filePath,
          success: (result) => resolve({ filePath, size: result.size }),
          fail: reject,
        })
      },
      fail: reject,
    })
  }), bytes.toString('base64'))
}

async function createPetThroughUi(page, name) {
  await miniProgram.mockWxMethod('showActionSheet', { tapIndex: 0, cancel: false })
  await miniProgram.mockWxMethod('showModal', {
    confirm: true,
    cancel: false,
    content: name,
  })
  await page.callMethod('onAddPet')
  const data = await waitFor(async () => {
    const current = await page.data()
    return current.profile?.name === name && current.profile?.id ? current : false
  }, `页面创建宠物 ${name}`)
  await miniProgram.restoreWxMethod('showActionSheet')
  await miniProgram.restoreWxMethod('showModal')
  createdPetIds.add(data.profile.id)
  return data.profile
}

let primaryPetId = ''
let backupPetId = ''
try {
  console.log('PASS 生产微信会话', JSON.stringify({
    user: session.user.nickname,
    spaceId,
    expiresAt: session.expiresAt,
  }))

  const before = await listPets()
  assert.equal(before.items.length, 0, '生产验收空间不是空态，请先确认没有遗留宠物档案')
  await miniProgram.callWxMethod('setStorageSync', activePetKey, '')

  let page = await open('/pages/pets/index')
  await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.hasActivePet === false ? data : false
  }, '生产宠物空态')
  await assertNoHorizontalOverflow(page, '宠物空态')
  await screenshot('profile-empty')
  console.log('PASS 生产宠物空态与首只宠物入口渲染正常')

  const primary = await createPetThroughUi(page, petName)
  primaryPetId = primary.id
  await waitFor(async () => {
    const data = await page.data()
    return !data.syncing && data.hasActivePet && data.profile?.id === primaryPetId ? data : false
  }, '页面创建首只宠物')
  await assertNoHorizontalOverflow(page, '宠物档案')
  await screenshot('profile-created')
  console.log('PASS 已通过页面创建临时宠物', primaryPetId)

  const backup = await createPetThroughUi(page, backupPetName)
  backupPetId = backup.id
  await page.callMethod('refreshPetData', primaryPetId)
  await waitFor(async () => {
    const data = await page.data()
    return !data.loading && !data.syncing && data.profile?.id === primaryPetId ? data : false
  }, '切回主验收宠物')

  const tempImage = await writeTempImage(image)
  assert.ok(tempImage.size > 1000)
  await miniProgram.mockWxMethod('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: tempImage.size }],
  })
  await page.callMethod('onChooseAvatar')
  const avatarData = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingAvatar && data.profile?.avatarUrl ? data : false
  }, '生产私有 COS 宠物头像上传')
  await miniProgram.restoreWxMethod('chooseMedia')
  const avatarUrl = new URL(avatarData.profile.avatarUrl)
  assert.equal(avatarUrl.hostname, 'popcorn-1302154647.cos.ap-guangzhou.myqcloud.com')
  assert.ok(
    decodeURIComponent(avatarUrl.pathname).startsWith(`/popcorn/prod/media/spaces/${spaceId}/`),
    `头像未进入空间媒体路径：${avatarUrl.pathname}`,
  )
  const avatarResponse = await fetch(avatarData.profile.avatarUrl)
  assert.equal(avatarResponse.status, 200)
  assert.match(avatarResponse.headers.get('content-type') ?? '', /^image\//)
  await screenshot('profile-avatar')
  const firstAvatarMediaId = avatarData.profile.avatarMediaId
  const firstAvatarUrl = avatarData.profile.avatarUrl
  console.log('PASS 宠物头像已上传生产私有 COS，签名展示地址可读取', JSON.stringify({
    host: avatarUrl.hostname,
    status: avatarResponse.status,
    contentType: avatarResponse.headers.get('content-type'),
  }))

  await miniProgram.mockWxMethod('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: tempImage.size }],
  })
  await page.callMethod('onChooseAvatar')
  const replacedAvatarData = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingAvatar
      && data.profile?.avatarMediaId
      && data.profile.avatarMediaId !== firstAvatarMediaId
      && data.profile?.avatarUrl
      ? data
      : false
  }, '生产宠物头像替换')
  const replacementMediaId = replacedAvatarData.profile.avatarMediaId
  const replacementResponse = await fetch(replacedAvatarData.profile.avatarUrl)
  assert.equal(replacementResponse.status, 200)
  assert.equal((await latestPet(primaryPetId))?.avatarMediaId, replacementMediaId)
  assert.equal((await fetch(firstAvatarUrl)).status, 200)
  await screenshot('profile-avatar-replaced')
  console.log('PASS 宠物头像替换为新媒体，档案仅引用最新媒体且旧文件按策略保留', JSON.stringify({
    previous: firstAvatarMediaId,
    current: replacementMediaId,
  }))

  await miniProgram.mockWxMethod('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: 11 * 1024 * 1024 }],
  })
  await page.callMethod('onChooseAvatar')
  const failedUploadData = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingAvatar && data.errorText ? data : false
  }, '宠物头像上传失败回退')
  assert.equal(failedUploadData.profile.avatarMediaId, replacementMediaId)
  assert.equal(failedUploadData.profile.avatarUrl, replacedAvatarData.profile.avatarUrl)
  assert.match(failedUploadData.errorText, /10 MiB/)
  await screenshot('profile-avatar-upload-error')
  console.log('PASS 宠物头像上传失败时保留原头像并展示可恢复错误')

  await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
  await page.callMethod('onRemoveAvatar')
  const removedAvatarData = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingAvatar
      && data.profile?.avatarMediaId === ''
      && data.profile?.avatarUrl === ''
      ? data
      : false
  }, '生产宠物头像移除')
  await miniProgram.restoreWxMethod('showModal')
  assert.equal((await latestPet(primaryPetId))?.avatarMediaId, '')
  await screenshot('profile-avatar-removed')
  console.log('PASS 宠物头像移除后清空媒体引用并回退插画头像')

  await miniProgram.mockWxMethod('showModal', {
    confirm: true,
    cancel: false,
    content: '4.2',
  })
  await page.callMethod('onRecordWeight')
  const weightData = await waitFor(async () => {
    const data = await page.data()
    return !data.syncing && data.latestWeight === '4.2' ? data : false
  }, '记录体重')
  assert.equal(weightData.petState.weights.length, 1)
  await miniProgram.restoreWxMethod('showModal')

  await miniProgram.mockWxMethod('showModal', {
    confirm: true,
    cancel: false,
    content: '早餐吃了半罐，食欲正常',
  })
  await page.callMethod('onAddDailyLog', {
    currentTarget: { dataset: { type: 'meal' } },
  })
  await waitFor(async () => {
    const data = await page.data()
    return !data.syncing && data.petState.dailyLogs.length === 1 ? data : false
  }, '记录今日饮食')
  await miniProgram.restoreWxMethod('showModal')
  console.log('PASS 体重与今日饮食已写入生产服务并刷新页面')

  const careOccurredOn = todayShanghai()
  const form = await open('/pages/pet-event-form/index?type=external-deworm')
  const formData = await waitFor(async () => {
    const data = await form.data()
    return !data.loading ? data : false
  }, '生产周期照护表单')
  assert.equal(formData.isCareEvent, true)
  assert.equal(formData.careIntervalDays, '30')
  await form.setData({
    careIntervalDays: '45',
    nextCarePreview: addDays(careOccurredOn, 45),
    form: {
      ...formData.form,
      type: 'external-deworm',
      occurredOn: careOccurredOn,
      title: '生产验收体外驱虫',
      note: '宠物生产全链路验收记录',
      provider: '生产验收宠物医院',
      cost: '180',
      nextOn: '',
    },
    hasNextDate: false,
  })
  await form.callMethod('onSave')
  const careEvent = await waitFor(async () => {
    const latest = await latestPet(primaryPetId)
    return latest?.events.find((item) => item.title === '生产验收体外驱虫') ?? false
  }, '生产周期照护保存')
  assert.equal(careEvent.recurrenceDays, 45)
  assert.equal(careEvent.nextOn, addDays(careOccurredOn, 45))

  page = await open('/pages/pets/index?section=care')
  const carePageData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.profile?.id === primaryPetId && data.careCards.length === 4
      ? data
      : false
  }, '生产照护页')
  await assertNoHorizontalOverflow(page, '宠物照护')
  await screenshot('care')
  console.log('PASS 周期照护已保存并按 45 天自动推算下一次日期')

  await page.callMethod('onSwitchSection', {
    currentTarget: { dataset: { value: 'supplies' } },
  })
  await miniProgram.mockWxMethod('showActionSheet', { tapIndex: 0, cancel: false })
  await miniProgram.mockWxMethod('showModal', {
    confirm: true,
    cancel: false,
    content: '生产验收鸡肉冻干粮',
  })
  await page.callMethod('onAddSupply')
  const supplyData = await waitFor(async () => {
    const data = await page.data()
    return !data.syncing && data.supplies.some((item) => item.name === '生产验收鸡肉冻干粮')
      ? data
      : false
  }, '生产宠物用品创建')
  await miniProgram.restoreWxMethod('showActionSheet')
  await miniProgram.restoreWxMethod('showModal')
  assert.equal(supplyData.supplies[0]?.status, 'current')
  await screenshot('supplies')
  console.log('PASS 宠物用品已通过页面创建并展示')

  const home = await open('/pages/home/index')
  const homeData = await waitFor(async () => {
    const data = await home.data()
    return data.hasLoadedPets && data.petSnapshot?.name === petName ? data : false
  }, '首页宠物摘要')
  assert.ok(homeData.petActivities.length >= 1)
  await assertNoHorizontalOverflow(home, '首页')
  await screenshot('home')
  console.log('PASS 首页已读取生产宠物摘要与动态')

  page = await open('/pages/pets/index')
  await page.callMethod('refreshPetData', primaryPetId)
  await waitFor(async () => {
    const data = await page.data()
    return !data.loading && !data.syncing && data.profile?.id === primaryPetId ? data : false
  }, '删除前刷新主宠物')

  await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
  await page.callMethod('onDeletePet')
  const switched = await waitFor(async () => {
    const data = await page.data()
    return !data.syncing && data.profile?.id === backupPetId ? data : false
  }, '删除当前宠物后自动切换')
  await miniProgram.restoreWxMethod('showModal')
  assert.equal((await latestPet(primaryPetId)), null)
  assert.equal((await latestPet(backupPetId))?.id, backupPetId)
  createdPetIds.delete(primaryPetId)
  primaryPetId = ''
  await screenshot('profile-deleted-switched')
  console.log('PASS 删除当前宠物后自动切换到剩余宠物，关联记录一并软删除')

  await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
  await page.callMethod('onDeletePet')
  const empty = await waitFor(async () => {
    const data = await page.data()
    return !data.syncing && data.hasActivePet === false ? data : false
  }, '删除最后一只宠物后的空态')
  await miniProgram.restoreWxMethod('showModal')
  assert.equal((await latestPet(backupPetId)), null)
  createdPetIds.delete(backupPetId)
  backupPetId = ''

  page = await open('/pages/pets/index')
  const refreshedEmpty = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.hasActivePet === false ? data : false
  }, '刷新后保持宠物空态')
  assert.equal(refreshedEmpty.petStates.length, 0)
  await screenshot('profile-final-empty')
  console.log('PASS 删除最后一只宠物后保持空态，刷新不会重新生成演示数据')
} finally {
  await miniProgram.restoreWxMethod('chooseMedia').catch(() => undefined)
  await miniProgram.restoreWxMethod('showModal').catch(() => undefined)
  await miniProgram.restoreWxMethod('showActionSheet').catch(() => undefined)
  try {
    const remaining = await listPets()
    for (const item of remaining.items) {
      if (item.name === petName || item.name === backupPetName) createdPetIds.add(item.id)
    }
  } catch (error) {
    console.error('WARN 兜底扫描临时宠物失败', error)
  }
  for (const petId of createdPetIds) {
    await deletePetForCleanup(petId).catch((error) => {
      console.error('WARN 兜底清理宠物失败', petId, error)
    })
  }
  await miniProgram.disconnect().catch(() => undefined)
}
