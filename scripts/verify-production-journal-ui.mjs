// 生产环境生活记录图片全链路验收。
// 前提：微信开发者工具已用生产配置打开，并完成真实微信登录；automation 端口可用。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'https://popcorn-api.simiway.cc').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const suffix = Date.now().toString(36).slice(-8)
const title = `生产生活记录${suffix.slice(-4)}`
const image = await readFile(new URL('../src/images/demo-flowers.jpg', import.meta.url))
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const token = await miniProgram.callWxMethod('getStorageSync', tokenKey)
const session = await miniProgram.callWxMethod('getStorageSync', sessionKey)
assert.equal(typeof token, 'string')
assert.ok(token, '生产微信会话不存在，请先在开发者工具完成微信登录')
assert.ok(session?.activeSpaceId, '生产会话没有活动空间')
assert.ok(session?.user?.id, '生产会话没有用户信息')
const spaceId = session.activeSpaceId

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
  await miniProgram.pageScrollTo(0)
  await wait(400)
  const path = `shots/production-journal-ui-${name}.png`
  await miniProgram.screenshot({ path })
  console.log('CAPTURE', path)
}

async function listNotes() {
  return apiOk(`/spaces/${encodeURIComponent(spaceId)}/journals?kind=note&limit=100`)
}

async function getNote(id) {
  return apiOk(`/spaces/${encodeURIComponent(spaceId)}/journals/${encodeURIComponent(id)}`)
}

async function writeTempImage(bytes) {
  return miniProgram.evaluate((base64) => new Promise((resolve, reject) => {
    const filePath = `${wx.env.USER_DATA_PATH}/production-journal-${Date.now()}.jpg`
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

let created = null
try {
  console.log('PASS 生产微信会话', JSON.stringify({
    user: session.user.nickname,
    spaceId,
    expiresAt: session.expiresAt,
  }))

  const form = await open('/pages/journal-form/index?kind=note')
  await waitFor(async () => (await form.data()).loading === false, '生产生活记录表单')
  await screenshot('form-empty')
  await form.setData({
    form: {
      title,
      content: '生产环境生活记录图片上传验收，完成后会自动清理。',
    },
    category: 'other',
    categoryIndex: 3,
    visibility: 'private',
  })

  const tempImage = await writeTempImage(image)
  assert.ok(tempImage.size > 1000)

  await miniProgram.evaluate(() => {
    getApp().__journalGoalModal = null
  })
  await miniProgram.mockWxMethod('showModal', function (options) {
    getApp().__journalGoalModal = options
  })
  await miniProgram.mockWxMethod('uploadFile', {
    statusCode: 503,
    data: JSON.stringify({ code: 'NETWORK_ERROR', message: '网络不稳定' }),
    header: { 'content-type': 'application/json' },
  })
  try {
    await form.callMethod('uploadImage', tempImage.filePath, tempImage.size)
    const failedUpload = await waitFor(async () => {
      const data = await form.data()
      return !data.imageUploading && !data.image ? data : false
    }, '生产生活记录图片上传失败回退')
    const failedModal = await miniProgram.evaluate(() => getApp().__journalGoalModal)
    assert.equal(failedModal?.title, '图片上传失败')
    assert.match(failedModal?.content ?? '', /检查网络/)
    await screenshot('form-upload-failed')
    console.log('PASS 图片上传失败后保留可编辑状态并提示检查网络')
  } finally {
    await miniProgram.restoreWxMethod('uploadFile').catch(() => undefined)
    await miniProgram.restoreWxMethod('showModal').catch(() => undefined)
  }

  await form.callMethod('uploadImage', tempImage.filePath, tempImage.size)
  const uploaded = await waitFor(async () => {
    const data = await form.data()
    return !data.imageUploading && data.image?.mediaId ? data : false
  }, '生产生活记录图片上传')
  assert.match(uploaded.image.src, /^https:\/\//)
  await form.setData({ 'image.caption': '生产图片验收说明' })
  await screenshot('form-uploaded')
  console.log('PASS 生活记录图片已上传到生产私有 COS')

  await form.callMethod('onSave')
  created = await waitFor(async () => {
    const page = await listNotes()
    return page.items.find((item) => item.title === title) ?? false
  }, '生产生活记录保存与回读')
  assert.equal(created.imageMediaId, uploaded.image.mediaId)
  assert.equal(created.visibility, 'private')
  console.log('PASS 私密生活记录已保存并关联图片媒体')

  const list = await open('/pages/journal/index')
  await list.callMethod('onSelectSection', {
    currentTarget: { dataset: { value: 'notes' } },
  })
  const listData = await waitFor(async () => {
    const data = await list.data()
    const ids = data.noteGroups.flatMap((group) => group.entries.map((entry) => entry.id))
    return !data.loading && ids.includes(created.id) ? data : false
  }, '生产生活记录列表展示')
  const entry = listData.noteGroups
    .flatMap((group) => group.entries)
    .find((item) => item.id === created.id)
  assert.ok(entry?.image?.thumbSrc || entry?.image?.src)
  await screenshot('list-loaded')
  console.log('PASS 生产生活记录列表展示图片缩略图')

  const detail = await open(`/pages/journal-detail/index?id=${encodeURIComponent(created.id)}`)
  const detailData = await waitFor(async () => {
    const data = await detail.data()
    return !data.loading && data.entry?.id === created.id ? data : false
  }, '生产生活记录详情展示')
  assert.equal(detailData.entry.image?.caption, '生产图片验收说明')
  assert.ok(detailData.entry.image?.src)
  await screenshot('detail-loaded')

  const imageResponse = await fetch(detailData.entry.image.src)
  assert.equal(imageResponse.status, 200)
  assert.match(imageResponse.headers.get('content-type') ?? '', /^image\//)
  console.log('PASS 生活记录签名图片可直接读取', JSON.stringify({
    status: imageResponse.status,
    contentType: imageResponse.headers.get('content-type'),
  }))

  await miniProgram.mockWxMethod('request', {
    statusCode: 503,
    data: { code: 'NETWORK_ERROR', message: '网络不稳定' },
    header: { 'content-type': 'application/json' },
  })
  let replaceForm
  try {
    replaceForm = await open(`/pages/journal-form/index?id=${encodeURIComponent(created.id)}`)
    const failedLoad = await waitFor(async () => {
      const data = await replaceForm.data()
      return !data.loading && data.loadError ? data : false
    }, '图片替换编辑页弱网失败')
    assert.match(failedLoad.loadError, /网络|稍后|没有加载/)
    await screenshot('form-load-error')
    console.log('PASS 编辑页弱网加载失败展示可重试错误态')
  } finally {
    await miniProgram.restoreWxMethod('request').catch(() => undefined)
  }
  await replaceForm.callMethod('onRetryLoad')
  await waitFor(async () => {
    const data = await replaceForm.data()
    return !data.loading && !data.loadError && data.version === created.version ? data : false
  }, '图片替换编辑页重试恢复')
  console.log('PASS 编辑页加载失败后手动重试恢复')
  const replacementImage = await writeTempImage(image)
  await replaceForm.callMethod('uploadImage', replacementImage.filePath, replacementImage.size)
  const replacementReady = await waitFor(async () => {
    const data = await replaceForm.data()
    return !data.imageUploading && data.image?.mediaId ? data : false
  }, '生产生活记录图片替换上传')
  assert.notEqual(replacementReady.image.mediaId, created.imageMediaId)
  await screenshot('form-replaced')
  await replaceForm.callMethod('onSave')
  const replaced = await waitFor(async () => {
    const note = await getNote(created.id)
    return note.version > created.version && note.imageMediaId === replacementReady.image.mediaId
      ? note
      : false
  }, '生产生活记录图片替换保存')
  created = replaced
  console.log('PASS 生活记录图片替换后写入新媒体', replaced.imageMediaId)

  const removeForm = await open(`/pages/journal-form/index?id=${encodeURIComponent(created.id)}`)
  await waitFor(async () => {
    const data = await removeForm.data()
    return !data.loading && data.version === created.version && data.image?.mediaId
      ? data
      : false
  }, '图片移除编辑页加载')
  await removeForm.callMethod('onRemoveImage')
  assert.equal((await removeForm.data()).image, null)
  await screenshot('form-image-removed')
  await removeForm.callMethod('onSave')
  const withoutImage = await waitFor(async () => {
    const note = await getNote(created.id)
    return note.version > created.version && !note.imageMediaId ? note : false
  }, '生产生活记录移除图片保存')
  created = withoutImage

  const removedDetail = await open(`/pages/journal-detail/index?id=${encodeURIComponent(created.id)}`)
  const removedDetailData = await waitFor(async () => {
    const data = await removedDetail.data()
    return !data.loading && data.entry?.id === created.id ? data : false
  }, '图片移除后详情加载')
  assert.ok(!removedDetailData.entry.image)
  await screenshot('detail-image-removed')
  console.log('PASS 生活记录图片可移除且详情不再展示')

  const latest = await apiOk(
    `/spaces/${encodeURIComponent(spaceId)}/journals/${encodeURIComponent(created.id)}`,
  )
  const cleanup = await apiRaw(
    `/spaces/${encodeURIComponent(spaceId)}/journals/${encodeURIComponent(created.id)}`,
    {
      method: 'DELETE',
      headers: {
        'If-Match': `"${latest.version}"`,
        'Idempotency-Key': `production_journal_cleanup_${suffix}`,
      },
    },
  )
  assert.equal(cleanup.status, 204)
  created = null
  console.log('PASS 生产验收生活记录已软删除清理')
} finally {
  if (created) {
    const latest = await apiRaw(
      `/spaces/${encodeURIComponent(spaceId)}/journals/${encodeURIComponent(created.id)}`,
    )
    if (latest.status === 200) {
      await apiRaw(
        `/spaces/${encodeURIComponent(spaceId)}/journals/${encodeURIComponent(created.id)}`,
        {
          method: 'DELETE',
          headers: {
            'If-Match': `"${latest.data.version}"`,
            'Idempotency-Key': `production_journal_cleanup_final_${suffix}`,
          },
        },
      ).catch(() => undefined)
    }
  }
  await miniProgram.disconnect().catch(() => undefined)
}
