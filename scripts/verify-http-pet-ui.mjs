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
const petsWxml = await readFile(new URL('../src/pages/pets/index.wxml', import.meta.url), 'utf8')
assert.match(petsWxml, /\{\{item\.hearts\}\} \{\{item\.label\}\}/)
assert.ok(petsWxml.includes('catchtap="onChangeSupplyStatus"'))
assert.ok(!petsWxml.includes('onRemoveAvatar'))
assert.ok(!petsWxml.includes('今天已记录'))
assert.ok(!petsWxml.includes('基础档案'))
assert.ok(!petsWxml.includes('只记发生过的事'))
assert.ok(petsWxml.indexOf('data-value="daily"') < petsWxml.indexOf('data-value="supplies"'))
assert.ok(petsWxml.indexOf('data-value="supplies"') < petsWxml.indexOf('data-value="care"'))
assert.ok(petsWxml.indexOf('data-value="care"') < petsWxml.indexOf('data-value="profile"'))
const supplyRowTag = petsWxml.match(/<view wx:for="\{\{supplies\}\}"[^>]*>/)?.[0]
assert.ok(supplyRowTag, '用品行结构不存在')
assert.ok(!supplyRowTag.includes('onChangeSupplyStatus'), '用品整行不应直接触发偏好修改')
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function mockWxSuccess(method, result) {
  await miniProgram.evaluate((methodName, methodResult) => {
    wx[methodName] = (options = {}) => {
      if (typeof options.success === 'function') options.success(methodResult)
    }
  }, method, result)
}

async function callPageMethod(method, ...args) {
  await miniProgram.evaluate((methodName, methodArgs) => {
    const pages = getCurrentPages()
    const page = pages[pages.length - 1]
    if (!page || typeof page[methodName] !== 'function') {
      throw new Error(`当前页面没有方法 ${methodName}`)
    }
    return page[methodName](...methodArgs)
  }, method, args)
}

// 裁切面板是系统 UI，自动化验收用同路径回写模拟“用户完成了 1:1 裁切”。
await miniProgram.evaluate(() => {
  wx.cropImage = (options) => options.success({ tempFilePath: options.src })
  wx.showToast = () => {}
})

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

async function screenshot(name, scrollTop = 0) {
  await miniProgram.pageScrollTo(scrollTop)
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
  await callPageMethod('onOpenAvatarPreview')
  const previewData = await page.data()
  assert.equal(previewData.avatarPreviewOpen, true)
  assert.equal(previewData.uploadingAvatar, false)
  assert.equal(previewData.profile.avatarMediaId, '')
  await screenshot('avatar-preview')
  await callPageMethod('onCloseAvatarPreview')
  console.log('PASS 头像只做放大预览，不触发上传；更换入口保持明确')

  const tempImage = await writeTempImage(image)
  assert.ok(tempImage.size > 1000)
  await mockWxSuccess('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: tempImage.size }],
  })
  await callPageMethod('onChooseAvatar')
  const avatarData = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingAvatar && data.profile?.avatarUrl ? data : false
  }, '宠物头像上传')
  assert.match(avatarData.profile.avatarUrl, /^https:\/\//)
  assert.ok(avatarData.profile.avatarMediaId)
  await screenshot('profile-avatar')
  const firstAvatarMediaId = avatarData.profile.avatarMediaId
  const firstAvatarUrl = avatarData.profile.avatarUrl
  console.log('PASS 前端上传头像到私有 COS、更新档案并回读签名地址')

  await mockWxSuccess('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: tempImage.size }],
  })
  await callPageMethod('onChooseAvatar')
  const replacedAvatarData = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingAvatar
      && data.profile?.avatarMediaId
      && data.profile.avatarMediaId !== firstAvatarMediaId
      && data.profile?.avatarUrl
      ? data
      : false
  }, '宠物头像替换')
  const replacementMediaId = replacedAvatarData.profile.avatarMediaId
  const latestAfterReplacement = (await listPets(owner.token, owner.activeSpaceId)).items
    .find((item) => item.id === pet.id)
  assert.equal(latestAfterReplacement?.avatarMediaId, replacementMediaId)
  assert.equal((await fetch(firstAvatarUrl)).status, 200)
  await screenshot('profile-avatar-replaced')
  console.log('PASS 宠物头像替换生成新媒体，旧文件按既定策略保留')

  await mockWxSuccess('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: 11 * 1024 * 1024 }],
  })
  await callPageMethod('onChooseAvatar')
  const failedUploadData = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingAvatar && data.errorText ? data : false
  }, '宠物头像上传失败回退')
  assert.equal(failedUploadData.profile.avatarMediaId, replacementMediaId)
  assert.equal(failedUploadData.profile.avatarUrl, replacedAvatarData.profile.avatarUrl)
  assert.match(failedUploadData.errorText, /10 MiB/)
  await screenshot('profile-avatar-upload-error')
  console.log('PASS 宠物头像上传失败时保留原头像并展示错误')

  await callPageMethod('onOpenAvatarPreview')
  const finalPreviewData = await page.data()
  assert.equal(finalPreviewData.avatarPreviewOpen, true)
  assert.equal(finalPreviewData.profile.avatarMediaId, replacementMediaId)
  await callPageMethod('onCloseAvatarPreview')

  await callPageMethod('onOpenBackgroundPicker')
  assert.equal((await page.data()).backgroundPickerOpen, true)
  await screenshot('background-picker')
  await callPageMethod('onSelectBackgroundTheme', {
    currentTarget: { dataset: { key: 'mist' } },
  })
  const themed = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingBackground && data.profile.backgroundKey === 'mist' ? data : false
  }, '切换系统背景')
  assert.equal(themed.profile.backgroundMediaId, '')
  await mockWxSuccess('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: tempImage.size }],
  })
  await callPageMethod('onOpenBackgroundPicker')
  await callPageMethod('onChooseBackground')
  const customBackground = await waitFor(async () => {
    const data = await page.data()
    return !data.uploadingBackground && data.profile.backgroundMediaId ? data : false
  }, '上传自定义背景')
  assert.match(customBackground.profile.backgroundUrl, /^https:\/\//)
  await screenshot('background-custom')
  console.log('PASS 三套系统背景可切换，自定义背景上传到私有 COS 并回读')

  await mockWxSuccess('showModal', {
    confirm: true,
    cancel: false,
    content: '4.1',
  })
  await callPageMethod('onRecordWeight')
  const weightData = await waitFor(async () => {
    const data = await page.data()
    return !data.syncing && data.latestWeight === '4.1' ? data : false
  }, '记录体重')
  assert.equal(weightData.petState.weights.length, 1)

  async function saveDailyLog(type, choice, detail, expectedCount) {
    await callPageMethod('onAddDailyLog', {
      currentTarget: { dataset: { type } },
    })
    const editor = await page.data()
    assert.equal(editor.dailyEditorOpen, true)
    assert.equal(editor.dailyEditor.type, type)
    if (choice) {
      await callPageMethod('onDailyChoiceSelect', {
        currentTarget: { dataset: { value: choice } },
      })
    }
    if (detail) {
      await callPageMethod('onDailyDetailInput', {
        detail: { value: detail },
      })
    }
    await callPageMethod('onSaveDailyLog')
    return waitFor(async () => {
      const data = await page.data()
      return !data.syncing
        && !data.dailyEditorOpen
        && data.petState.dailyLogs.filter((item) => item.type === type).length === expectedCount
        ? data
        : false
    }, `记录${type}`)
  }

  await saveDailyLog('meal', '罐头', '半罐', 1)
  await callPageMethod('onAddDailyLog', {
    currentTarget: { dataset: { type: 'urine' } },
  })
  await callPageMethod('onDailyChoiceSelect', {
    currentTarget: { dataset: { value: '偏少' } },
  })
  await callPageMethod('onDailyDetailInput', {
    detail: { value: '2 个尿团' },
  })
  assert.equal((await page.data()).dailyEditorOpen, true)
  await screenshot('daily-editor')
  await callPageMethod('onSaveDailyLog')
  await waitFor(async () => {
    const data = await page.data()
    return !data.syncing && !data.dailyEditorOpen ? data : false
  }, '记录尿尿')
  await saveDailyLog('urine', '正常', '1 个尿团', 2)
  await saveDailyLog('litter-change', '局部清理', '2 个猫砂盆', 1)
  await saveDailyLog('water-change', '换水', '2 处', 1)

  await callPageMethod('onSwitchSection', {
    currentTarget: { dataset: { value: 'daily' } },
  })
  const dailyData = await waitFor(async () => {
    const data = await page.data()
    const urine = data.dailySummary?.find((item) => item.type === 'urine')
    const water = data.dailySummary?.find((item) => item.type === 'water-change')
    return urine?.count === 2 && water?.count === 1 ? data : false
  }, '日常重复记录摘要')
  assert.equal(dailyData.dailySummary.length, 6)
  assert.equal(dailyData.dailyTodayCount, 5)
  assert.match(
    dailyData.recentDailyLogs.find((item) => item.summary === '换了 2 处的水')?.summary ?? '',
    /2 处/,
  )
  await screenshot('daily')
  console.log('PASS 日常记录可细化并可重复追加，尿尿记录两次后展示今天 2 次')

  const careOccurredOn = todayShanghai()
  const plannedNextOn = addDays(careOccurredOn, 45)
  const form = await open('/pages/pet-event-form/index?type=external-deworm')
  const formData = await waitFor(async () => {
    const data = await form.data()
    return !data.loading ? data : false
  }, '宠物护理表单')
  assert.equal(formData.hasNextDate, false)
  assert.equal(formData.form.nextOn, '')
  assert.equal('isCareEvent' in formData, false)
  await form.setData({
    form: {
      ...formData.form,
      type: 'external-deworm',
      occurredOn: careOccurredOn,
      title: '年度体外驱虫',
      note: '滴剂使用后观察正常',
      provider: '社区宠物医院',
      cost: '180',
      nextOn: plannedNextOn,
    },
    hasNextDate: true,
  })
  await screenshot('event-form-schedule')
  await callPageMethod('onSave')
  const event = await waitFor(async () => {
    const collection = await listPets(owner.token, owner.activeSpaceId)
    const latest = collection.items.find((item) => item.id === pet.id)
    return latest?.events.find((item) => item.title === '年度体外驱虫') ?? false
  }, '护理事件保存')
  assert.equal(event.recurrenceDays, 0)
  assert.equal(event.nextOn, plannedNextOn)
  console.log('PASS 护理不再自动推算周期，仅在用户明确选择计划日期时保存 nextOn', event.id)

  const detail = await open(`/pages/pet-event-detail/index?id=${encodeURIComponent(event.id)}`)
  const detailData = await waitFor(async () => {
    const data = await detail.data()
    return !data.loading && data.event?.id === event.id ? data : false
  }, '事件详情')
  assert.equal(detailData.event.version, 1)
  assert.equal(detailData.event.recurrenceDays, 0)
  assert.equal(detailData.event.nextOn, plannedNextOn)
  assert.equal(detailData.petName, petName)
  await assertNoHorizontalOverflow(detail, '事件详情')
  await screenshot('event-detail-schedule')

  const edit = await open(`/pages/pet-event-form/index?id=${encodeURIComponent(event.id)}`)
  const editData = await waitFor(async () => {
    const data = await edit.data()
    return !data.loading && data.editingEventId === event.id ? data : false
  }, '护理编辑页')
  assert.equal(editData.hasNextDate, true)
  assert.equal(editData.form.nextOn, plannedNextOn)
  assert.equal('isCareEvent' in editData, false)
  const editedNextOn = addDays(careOccurredOn, 60)
  await edit.setData({ 'form.nextOn': editedNextOn })
  await callPageMethod('onSave')
  const editedEvent = await waitFor(async () => {
    const collection = await listPets(owner.token, owner.activeSpaceId)
    const latest = collection.items.find((item) => item.id === pet.id)
    return latest?.events.find((item) => item.id === event.id && item.version === 2) ?? false
  }, '护理计划日期编辑保存')
  assert.equal(editedEvent.recurrenceDays, 0)
  assert.equal(editedEvent.nextOn, editedNextOn)
  console.log('PASS 编辑护理只修改明确的计划日期，不引入周期字段')

  for (let index = 0; index < 5; index += 1) {
    await apiOk(`/spaces/${encodeURIComponent(owner.activeSpaceId)}/pets/${encodeURIComponent(pet.id)}/events`, {
      method: 'POST',
      token: owner.token,
      headers: { 'Idempotency-Key': `pet_ui_extra_${suffix}_${index}` },
      body: {
        type: ['grooming', 'internal-deworm', 'external-deworm'][index % 3],
        occurredOn: addDays(careOccurredOn, -(index + 1)),
        title: `护理补记 ${index + 1}`,
        note: '时间线折叠验收',
        provider: '',
        cost: '',
        nextOn: null,
        recurrenceDays: 0,
      },
    })
  }

  page = await open('/pages/pets/index?section=profile')
  const profileTimelineData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.timeline.length > 5 ? data : false
  }, '档案时间线折叠')
  assert.equal(profileTimelineData.timelineVisible.length, 5)
  assert.match(profileTimelineData.timeline[0].yearLabel, /^\d{4}$/)
  assert.match(profileTimelineData.timeline[0].dateLabel, /月.+日/)
  await callPageMethod('onToggleTimeline')
  const expandedTimeline = await page.data()
  assert.equal(expandedTimeline.timelineExpanded, true)
  assert.equal(expandedTimeline.timelineVisible.length, expandedTimeline.timeline.length)
  await screenshot('timeline-expanded', 720)

  page = await open('/pages/pets/index?section=care')
  const carePageData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.careTimeline.length > 5 ? data : false
  }, '护理时间线折叠')
  assert.equal(carePageData.careTimelineVisible.length, 5)
  const externalDewormCard = carePageData.careCards.find((item) => item.type === 'external-deworm')
  assert.ok(externalDewormCard)
  assert.equal(externalDewormCard.nextOn, editedNextOn)
  assert.equal('intervalDays' in externalDewormCard, false)
  await callPageMethod('onToggleCareTimeline')
  assert.equal((await page.data()).careTimelineVisible.length, carePageData.careTimeline.length)
  await screenshot('care', 660)
  await callPageMethod('onRecordCare', {
    currentTarget: { dataset: { type: 'external-deworm' } },
  })
  const careForm = await waitFor(async () => {
    const current = await miniProgram.currentPage()
    return current?.path === 'pages/pet-event-form/index' ? current : false
  }, '护理记一下跳转')
  const careFormData = await careForm.data()
  assert.equal(careFormData.requestedType, 'external-deworm')
  assert.equal(careFormData.hasNextDate, false)
  await screenshot('care-record-entry')
  console.log('PASS 时间线超过 5 条可折叠，护理按钮弱化为进入记录表单')

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
      categoryLabel: '主粮',
      name: '鸡肉冻干粮',
      brand: '鲜朗',
      preference: 'neutral',
      note: '过渡粮',
      recordedOn: '2026-10-31',
    },
  })
  const supplyId = supply.supplies[0]?.id
  if (!supplyId) throw new Error('宠物用品没有创建成功')
  page = await open('/pages/pets/index?section=supplies')
  const supplyPageData = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.supplies.some((item) => item.id === supplyId) ? data : false
  }, '用品列表')
  assert.deepEqual(
    supplyPageData.supplyPreferenceOptions.map(({ label, hearts }) => ({ label, hearts })),
    [
      { label: '超爱', hearts: '♥♥♥' },
      { label: '还行', hearts: '♥♥' },
      { label: '不爱', hearts: '♥' },
    ],
  )
  await mockWxSuccess('showActionSheet', { tapIndex: 0, cancel: false })
  await callPageMethod('onChangeSupplyStatus', {
    currentTarget: { dataset: { id: supplyId } },
  })
  const changedSupply = await waitFor(async () => {
    const collection = await listPets(owner.token, owner.activeSpaceId)
    const latest = collection.items.find((item) => item.id === pet.id)
    return latest?.supplies.find((item) => item.id === supplyId && item.preference === 'loved')
  }, '用品状态更新')
  assert.equal(changedSupply.version, 2)
  assert.equal(changedSupply.preference, 'loved')
  await callPageMethod('onOpenSupplyEditor')
  await page.setData({
    supplyDraft: {
      category: 'custom',
      categoryLabel: '玩具',
      name: '薄荷鱼逗猫棒',
      brand: 'PIDAN',
      preference: 'loved',
      note: '耐咬，薄荷味很淡',
      mediaId: '',
      mediaUrl: '',
    },
  })
  await mockWxSuccess('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: tempImage.size }],
  })
  await callPageMethod('onChooseSupplyImage')
  await waitFor(async () => {
    const data = await page.data()
    return !data.supplySaving && data.supplyDraft.mediaUrl ? data : false
  }, '上传用品图片')
  await screenshot('supply-editor')
  await callPageMethod('onSaveSupply')
  const customSupply = await waitFor(async () => {
    const data = await page.data()
    return !data.supplySaving
      && data.supplies.find((item) => item.name === '薄荷鱼逗猫棒')
      ? data
      : false
  }, '保存自定义用品')
  const savedCustom = customSupply.supplies.find((item) => item.name === '薄荷鱼逗猫棒')
  assert.equal(savedCustom.category, 'custom')
  assert.equal(savedCustom.categoryLabel, '玩具')
  assert.equal(savedCustom.brand, 'PIDAN')
  assert.equal(savedCustom.preference, 'loved')
  assert.match(savedCustom.mediaUrl, /^https:\/\//)
  await callPageMethod('onCloseSupplyEditor')
  await screenshot('supplies')
  console.log('PASS 用品爱心标签调整偏好，整行不直接响应；自定义类型/品牌/图片完整写回服务端')

  const home = await open('/pages/home/index')
  const homeData = await waitFor(async () => {
    const data = await home.data()
    return data.hasLoadedPets && data.petSnapshot?.name === petName ? data : false
  }, '首页宠物摘要')
  assert.ok(homeData.petActivities.length >= 1)
  await screenshot('home-summary')
  console.log('PASS 首页读取真实宠物摘要与动态')
} finally {


  await miniProgram.disconnect().catch(() => undefined)
}
