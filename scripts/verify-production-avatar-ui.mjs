// 生产环境用户真实头像全链路验收。
// 前提：微信开发者工具使用生产配置打开，并已完成真实微信登录。
// 覆盖：页面选图上传、私有 COS 签名展示、资料保存、会话回读、首页/空间/邀请头像、
// 替换、移除、页面重载、无头像降级，以及 finally 恢复验收前头像。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'https://popcorn-api.simiway.cc').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const image = await readFile(new URL('../src/images/demo-menu-still-life.jpg', import.meta.url))
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const runtimeErrors = []

miniProgram.on('console', (message) => {
  if (message.type === 'error') runtimeErrors.push(`console: ${message.args?.join(' ')}`)
})
miniProgram.on('exception', (error) => {
  runtimeErrors.push(`exception: ${error.message ?? String(error)}`)
})

const token = await miniProgram.callWxMethod('getStorageSync', tokenKey)
const storedSession = await miniProgram.callWxMethod('getStorageSync', sessionKey)
assert.equal(typeof token, 'string')
assert.ok(token, '生产微信会话不存在，请先在开发者工具完成微信登录')
assert.ok(storedSession?.activeSpaceId, '生产会话没有活动空间')
assert.ok(storedSession?.user?.id, '生产会话没有用户信息')
const spaceId = storedSession.activeSpaceId
const userId = storedSession.user.id

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

async function readSession() {
  return apiOk('/session')
}

async function listMembers() {
  return apiOk(`/spaces/${encodeURIComponent(spaceId)}/members`)
}

async function restoreAvatar(profile) {
  const session = await apiOk('/me', {
    method: 'PUT',
    body: {
      nickname: profile.nickname,
      avatarTone: profile.avatarTone,
      avatarMediaId: profile.avatarMediaId ?? '',
    },
  })
  assert.equal(session.user.nickname, profile.nickname)
  assert.equal(session.user.avatarTone, profile.avatarTone)
  assert.equal(session.user.avatarMediaId ?? '', profile.avatarMediaId ?? '')
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
    try {
      lastValue = await check()
    } catch (error) {
      if (!String(error).includes('page destroyed')) throw error
      lastValue = null
    }
    if (lastValue) return lastValue
    await wait(250)
  }
  throw new Error(`等待超时：${label}，最后状态：${JSON.stringify(lastValue)}`)
}

async function currentPageData() {
  try {
    const page = await miniProgram.currentPage()
    return page ? { page, data: await page.data() } : null
  } catch (error) {
    if (String(error).includes('page destroyed')) return null
    throw error
  }
}

async function waitForPage(check, label, timeoutMs = 30000) {
  return waitFor(async () => {
    const current = await currentPageData()
    return current && check(current.data) ? current : null
  }, label, timeoutMs)
}

async function screenshot(name) {
  await miniProgram.callWxMethod('hideToast').catch(() => undefined)
  await wait(350)
  await miniProgram.pageScrollTo(0)
  const path = `shots/production-avatar-ui-${name}.png`
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

async function writeTempImage(bytes, suffix = '') {
  return miniProgram.evaluate((base64, suffix) => new Promise((resolve, reject) => {
    const filePath = `${wx.env.USER_DATA_PATH}/production-avatar-${suffix}-${Date.now()}.jpg`
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
  }), bytes.toString('base64'), suffix)
}

async function chooseAvatar(page, tempImage, label) {
  await miniProgram.mockWxMethod('chooseMedia', {
    tempFiles: [{ tempFilePath: tempImage.filePath, size: tempImage.size }],
  })
  await page.callMethod('onChooseAvatar')
  const result = await waitForPage(
    (data) => !data.avatarUploading && data.avatarMediaId && data.avatarPreviewUrl ? data : null,
    label,
  )
  await miniProgram.restoreWxMethod('chooseMedia')
  return result.data
}

async function assertSignedImage(url, label) {
  const parsed = new URL(url)
  assert.equal(parsed.hostname, 'popcorn-1302154647.cos.ap-guangzhou.myqcloud.com')
  assert.ok(
    decodeURIComponent(parsed.pathname).startsWith(`/popcorn/prod/media/spaces/${spaceId}/`),
    `${label} 未进入空间媒体路径：${parsed.pathname}`,
  )
  const response = await fetch(url)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /^image\//)
  return response.headers.get('content-type')
}

async function openAccountEditor() {
  const page = await open('/pages/auth/index')
  const account = await waitForPage(
    (data) => data.mode === 'account' && data.accountNickname ? data : null,
    '账号资料页',
  )
  await account.page.callMethod('onEditAccount')
  return waitForPage(
    (data) => data.mode === 'register' && data.isEditing ? data : null,
    '资料编辑页',
  )
}

let originalProfile = null
let uploadedMediaId = ''
let replacementMediaId = ''
let cleared = false

try {
  const beforeSession = await readSession()
  originalProfile = {
    nickname: beforeSession.user.nickname,
    avatarTone: beforeSession.user.avatarTone,
    avatarMediaId: beforeSession.user.avatarMediaId ?? '',
  }
  assert.equal(beforeSession.user.id, userId)
  assert.equal(typeof (beforeSession.user.avatarMediaId ?? ''), 'string')
  console.log('PASS 生产会话已兼容 avatarMediaId', JSON.stringify({
    user: beforeSession.user.nickname,
    spaceId,
    avatarMediaId: beforeSession.user.avatarMediaId ?? '',
  }))

  let editor = await openAccountEditor()
  const firstImage = await writeTempImage(image, 'first')
  assert.ok(firstImage.size > 1000)
  let editData = await chooseAvatar(editor.page, firstImage, '生产头像上传')
  uploadedMediaId = editData.avatarMediaId
  assert.match(uploadedMediaId, /^m_[0-9a-z]{10}$/)
  assert.notEqual(uploadedMediaId, originalProfile.avatarMediaId)
  await assertNoHorizontalOverflow(editor.page, '资料编辑页')
  await screenshot('auth-uploaded')

  const thumbContentType = await assertSignedImage(editData.avatarPreviewUrl, '头像缩略图')
  console.log('PASS 头像已上传生产私有 COS', JSON.stringify({
    mediaId: uploadedMediaId,
    contentType: thumbContentType,
  }))

  await editor.page.callMethod('onSubmitProfile')
  let account = await waitForPage(
    (data) => data.mode === 'account' && data.accountAvatarMediaId === uploadedMediaId ? data : null,
    '头像保存后账号页',
  )
  account = await waitForPage(
    (data) => data.mode === 'account' && data.accountAvatarUrl ? data : null,
    '账号页头像签名展示',
  )
  await assertNoHorizontalOverflow(account.page, '账号资料页')
  await screenshot('account')
  console.log('PASS 账号资料页已展示真实头像')

  let session = await readSession()
  assert.equal(session.user.avatarMediaId, uploadedMediaId)
  const members = await listMembers()
  const selfMember = members.items.find((item) => item.userId === userId)
  assert.equal(selfMember?.avatarMediaId, uploadedMediaId)
  console.log('PASS /session 与空间成员均返回同一头像媒体 ID')

  let profile = await open('/pages/profile/index')
  let profileData = (await waitForPage(
    (data) => data.isLoggedIn && data.avatarMediaId === uploadedMediaId && data.avatarUrl ? data : null,
    '个人中心头像展示',
  )).data
  await assertNoHorizontalOverflow(profile, '个人中心')
  await screenshot('profile')
  await assertSignedImage(profileData.avatarUrl, '个人中心头像')

  let home = await open('/pages/home/index')
  let homeData = (await waitForPage(
    (data) => data.spaceMembers?.some((member) => member.userId === userId && member.avatarUrl) ? data : null,
    '首页空间成员头像展示',
  )).data
  await assertNoHorizontalOverflow(home, '首页')
  await screenshot('home-members')
  const homeMember = homeData.spaceMembers.find((member) => member.userId === userId)
  await assertSignedImage(homeMember.avatarUrl, '首页成员头像')

  let space = await open('/pages/space/index')
  let spaceData = (await waitForPage(
    (data) => data.members?.some((member) => member.userId === userId && member.avatarUrl) ? data : null,
    '空间成员头像展示',
  )).data
  await assertNoHorizontalOverflow(space, '空间页')
  await screenshot('space-members')
  const spaceMember = spaceData.members.find((member) => member.userId === userId)
  await assertSignedImage(spaceMember.avatarUrl, '空间成员头像')

  await space.callMethod('onRefreshInvite')
  const inviteData = (await waitForPage(
    (data) => data.inviteCode?.length === 10 ? data : null,
    '创建头像邀请预览',
  )).data
  const invitePage = await open(`/pages/invite/index?code=${encodeURIComponent(inviteData.inviteCode)}`)
  const preview = (await waitForPage(
    (data) => data.status === 'available' && data.inviterName === originalProfile.nickname && data.inviterAvatarUrl ? data : null,
    '邀请页创建者头像展示',
  )).data
  await assertNoHorizontalOverflow(invitePage, '邀请页')
  await screenshot('invite')
  await assertSignedImage(preview.inviterAvatarUrl, '邀请页创建者头像')

  editor = await openAccountEditor()
  const secondImage = await writeTempImage(image, 'second')
  editData = await chooseAvatar(editor.page, secondImage, '替换头像上传')
  replacementMediaId = editData.avatarMediaId
  assert.notEqual(replacementMediaId, uploadedMediaId)
  await editor.page.callMethod('onSubmitProfile')
  await waitForPage(
    (data) => data.mode === 'account' && data.accountAvatarMediaId === replacementMediaId ? data : null,
    '替换头像保存',
  )
  session = await readSession()
  assert.equal(session.user.avatarMediaId, replacementMediaId)
  console.log('PASS 头像替换生成新媒体并回写会话', JSON.stringify({
    previous: uploadedMediaId,
    current: replacementMediaId,
  }))

  editor = await openAccountEditor()
  await editor.page.callMethod('onRemoveAvatar')
  await editor.page.callMethod('onSubmitProfile')
  account = await waitForPage(
    (data) => data.mode === 'account' && data.accountAvatarMediaId === '' ? data : null,
    '移除头像保存',
  )
  cleared = true
  session = await readSession()
  assert.equal(session.user.avatarMediaId, '')
  await assertNoHorizontalOverflow(account.page, '移除头像后的账号页')
  await screenshot('account-cleared')
  console.log('PASS 头像移除已清空账号头像并回退昵称首字')

  profile = await open('/pages/profile/index')
  await waitForPage(
    (data) => data.isLoggedIn && data.avatarMediaId === '' && data.avatarUrl === '' && data.avatarText ? data : null,
    '个人中心无头像降级',
  )
  await screenshot('profile-fallback')
  console.log('PASS 页面重载后无头像稳定回退昵称首字')

  const invalidReference = await apiRaw('/me', {
    method: 'PUT',
    body: {
      nickname: originalProfile.nickname,
      avatarTone: originalProfile.avatarTone,
      avatarMediaId: 'm_0000000000',
    },
  })
  assert.equal(invalidReference.status, 422)
  assert.equal(invalidReference.data?.code, 'VALIDATION_FAILED')
  console.log('PASS 服务端拒绝不属于当前账号的头像媒体 ID')

  assert.deepEqual(runtimeErrors, [], `页面运行出现错误：${runtimeErrors.join('\n')}`)
} finally {
  await miniProgram.restoreWxMethod('chooseMedia').catch(() => undefined)
  try {
    await restoreAvatar(originalProfile)
    const restoredSession = await readSession()
    await miniProgram.callWxMethod('setStorageSync', sessionKey, restoredSession)
    cleared = false
    console.log('PASS 已恢复验收前头像资料', JSON.stringify({
      nickname: originalProfile.nickname,
      avatarMediaId: originalProfile.avatarMediaId,
    }))
  } catch (error) {
    console.error('WARN 恢复验收前头像失败', error)
  }
  if (cleared) console.error('WARN 头像仍处于清空状态，请人工检查')
  await miniProgram.disconnect().catch(() => undefined)
}
