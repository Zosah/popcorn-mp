// 宠物真实 HTTP UI 验收：页面、私有 COS 头像、照护记录和乐观锁全部走本地真实后端。
// 前提：env.ts 为 local + HTTP，本地 API、SSH 隧道与开发者工具自动化端口均已启动。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const identityKey = 'popcorn_api_mock_identity_v1'
const suffix = Date.now().toString(36).slice(-8)
const petName = `团子${suffix.slice(-3)}`
const image = await readFile(new URL('../src/images/demo-menu-still-life.jpg', import.meta.url))
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

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
  return { status: response.status, data }
}

async function apiOk(path, options = {}) {
  const result = await apiRaw(path, options)
  if (result.status < 200 || result.status >= 300) {
    throw new Error(`${options.method ?? 'GET'} ${path} -> ${result.status}: ${JSON.stringify(result.data)}`)
  }
  return result.data
}

async function login(identity, nickname) {
  const loginResult = await apiOk('/auth/mock', {
    method: 'POST',
    body: { identity, deviceLabel: '宠物 UI 验收' },
  })
  const session = loginResult.onboardingRequired
    ? await apiOk('/me', {
        method: 'PUT',
        token: loginResult.token,
        body: { nickname, avatarTone: 'mint' },
      })
    : loginResult
  return { ...session, token: loginResult.token }
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
  await wait(500)
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
  await wait(450)
  const path = `shots/pets-http-${name}.png`
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
    const filePath = `${wx.env.USER_DATA_PATH}/pet-ui-${Date.now()}.jpg`
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

async function listPets(token, spaceId) {
  return apiOk(`/spaces/${encodeURIComponent(spaceId)}/pets`, { token })
}

let owner
let pet
try {
  owner = await login(`pet-ui-${suffix}`, `宠物UI${suffix.slice(-3)}`)
  await setApiSession(owner.token, owner, `pet-ui-${suffix}`)
  console.log('PASS 已进入独立测试空间', owner.activeSpaceId)

  pet = await apiOk(`/spaces/${encodeURIComponent(owner.activeSpaceId)}/pets`, {
    method: 'POST',
    token: owner.token,
    headers: { 'Idempotency-Key': `pet_ui_create_${suffix}` },
    body: {
      name: petName,
      species: 'cat',
      breed: '英短',
      sex: 'female',
      birthday: '2025-04-01',
      homeOn: '2025-06-01',
      neuteredOn: '',
      status: '今天也很精神',
      avatarMediaId: '',
    },
  })

  let page = await open('/pages/pets/index')
  await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.petState?.profile?.id === pet.id ? data : false
  }, '宠物档案加载')
  await assertNoHorizontalOverflow(page, '宠物档案')
  await screenshot('profile-empty-avatar')
  console.log('PASS 宠物档案读取真实接口并回退插画头像')

  const tempImage = await writeTempImage(image)
  assert.ok(tempImage.size > 1000)
  await miniProgram.mockWxMethod('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: tempImage.size }],
  })
  await page.callMethod('onChooseAvatar')
  const avatarData = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingAvatar && data.profile?.avatarUrl ? data : false
  }, '宠物头像上传')
  assert.match(avatarData.profile.avatarUrl, /^https:\/\//)
  assert.ok(avatarData.profile.avatarMediaId)
  await miniProgram.restoreWxMethod('chooseMedia')
  await screenshot('profile-avatar')
  console.log('PASS 前端上传头像到私有 COS、更新档案并回读签名地址')

  await miniProgram.mockWxMethod('showModal', {
    confirm: true,
    cancel: false,
    content: '4.1',
  })
  await page.callMethod('onRecordWeight')
  const weightData = await waitFor(async () => {
    const data = await page.data()
    return !data.syncing && data.latestWeight === '4.1' ? data : false
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
  await page.callMethod('onSwitchSection', {
    currentTarget: { dataset: { value: 'daily' } },
  })
  await screenshot('daily')
  console.log('PASS 体重与今日吃喝写入服务端并刷新页面')

  const form = await open('/pages/pet-event-form/index?type=vaccine')
  await waitFor(async () => (await form.data()).loading === false, '宠物事件表单')
  await form.setData({
    form: {
      type: 'vaccine',
      occurredOn: '2026-10-31',
      title: '年度疫苗',
      note: '接种后观察正常',
      provider: '社区宠物医院',
      cost: '180',
      nextOn: '2027-10-31',
    },
    hasNextDate: true,
  })
  await screenshot('event-form')
  await form.callMethod('onSave')
  const event = await waitFor(async () => {
    const collection = await listPets(owner.token, owner.activeSpaceId)
    const latest = collection.items.find((item) => item.id === pet.id)
    return latest?.events.find((item) => item.title === '年度疫苗') ?? false
  }, '事件保存')
  console.log('PASS 事件表单写入服务端', event.id)

  const detail = await open(`/pages/pet-event-detail/index?id=${encodeURIComponent(event.id)}`)
  const detailData = await waitFor(async () => {
    const data = await detail.data()
    return !data.loading && data.event?.id === event.id ? data : false
  }, '事件详情')
  assert.equal(detailData.event.version, 1)
  assert.equal(detailData.petName, petName)
  await assertNoHorizontalOverflow(detail, '事件详情')
  await screenshot('event-detail')

  const calendar = await open('/pages/pet-calendar/index')
  await waitFor(async () => {
    const data = await calendar.data()
    return !data.loading && data.petName === petName ? data : false
  }, '宠物月历')
  await screenshot('calendar')
  console.log('PASS 事件详情与月历读取真实数据')

  const supply = await apiOk(`/spaces/${encodeURIComponent(owner.activeSpaceId)}/pets/${encodeURIComponent(pet.id)}/supplies`, {
    method: 'POST',
    token: owner.token,
    headers: { 'Idempotency-Key': `pet_ui_supply_${suffix}` },
    body: {
      category: 'kibble',
      name: '鸡肉冻干粮',
      status: 'current',
      note: '过渡粮',
      recordedOn: '2026-10-31',
    },
  })
  const supplyId = supply.supplies[0]?.id
  if (!supplyId) throw new Error('宠物用品没有创建成功')
  page = await open('/pages/pets/index?section=supplies')
  await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.supplies.some((item) => item.id === supplyId) ? data : false
  }, '用品列表')
  await miniProgram.mockWxMethod('showActionSheet', { tapIndex: 1, cancel: false })
  await page.callMethod('onChangeSupplyStatus', {
    currentTarget: { dataset: { id: supplyId } },
  })
  const changedSupply = await waitFor(async () => {
    const collection = await listPets(owner.token, owner.activeSpaceId)
    const latest = collection.items.find((item) => item.id === pet.id)
    return latest?.supplies.find((item) => item.id === supplyId && item.status === 'loved')
  }, '用品状态更新')
  assert.equal(changedSupply.version, 2)
  await miniProgram.restoreWxMethod('showActionSheet')
  await screenshot('supplies')
  console.log('PASS 用品状态携带自身版本写回服务端')

  const home = await open('/pages/home/index')
  const homeData = await waitFor(async () => {
    const data = await home.data()
    return data.hasLoadedPets && data.petSnapshot?.name === petName ? data : false
  }, '首页宠物摘要')
  assert.ok(homeData.petActivities.length >= 1)
  await screenshot('home-summary')
  console.log('PASS 首页读取真实宠物摘要与动态')
} finally {
  await miniProgram.restoreWxMethod('chooseMedia').catch(() => undefined)
  await miniProgram.restoreWxMethod('showModal').catch(() => undefined)
  await miniProgram.restoreWxMethod('showActionSheet').catch(() => undefined)
  await miniProgram.disconnect().catch(() => undefined)
}
