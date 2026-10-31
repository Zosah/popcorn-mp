// 菜单真实 HTTP UI 验收：在微信开发者工具中走完页面、图片上传、持久化与异常态。
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
const title = `番茄牛腩${suffix.slice(-3)}`
const updatedTitle = `${title}·更新`
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
    body: { identity, deviceLabel: '菜单 UI 验收' },
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
  await wait(500)
  const path = `shots/menu-http-${name}.png`
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

async function listRecipes(token, spaceId) {
  return apiOk(`/spaces/${encodeURIComponent(spaceId)}/menu-recipes?limit=100`, { token })
}

async function writeTempImage(bytes) {
  return miniProgram.evaluate((base64) => new Promise((resolve, reject) => {
    const filePath = `${wx.env.USER_DATA_PATH}/menu-ui-${Date.now()}.jpg`
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

let owner
let created
try {
  owner = await login(`menu-ui-${suffix}`, `菜单UI${suffix.slice(-3)}`)
  await setApiSession(owner.token, owner, `menu-ui-${suffix}`)
  console.log('PASS 已进入独立测试空间', owner.activeSpaceId)

  const homeEmpty = await open('/pages/home/index')
  await waitFor(async () => (await homeEmpty.data()).hasLoadedMenu, '首页菜单摘要')
  await screenshot('home-empty')

  const list = await open('/pages/menu/index')
  const listData = await waitFor(async () => {
    const data = await list.data()
    return !data.loading && { data }
  }, '空菜单列表')
  assert.equal(listData.data.recipes.length, 0)
  await assertNoHorizontalOverflow(list, '菜单列表')
  await screenshot('list-empty')
  console.log('PASS 菜单列表无图状态')

  const form = await open('/pages/menu-form/index')
  await waitFor(async () => (await form.data()).loading === false, '新增菜单表单')
  await assertNoHorizontalOverflow(form, '新增菜单')
  await screenshot('form-empty')

  const tempImage = await writeTempImage(image)
  assert.ok(tempImage.size > 1000)
  await form.setData({
    form: {
      title,
      description: '炖到软烂的番茄牛腩，周末慢慢吃。',
      servings: '3',
      cookingMinutes: '75',
      ingredientsText: '牛腩 | 500g | 冰箱冷冻\n番茄 | 4 个 | 冰箱冷藏\n洋葱 | 1 个 | 菜篮',
      stepsText: '焯水 | 牛腩冷水下锅，煮开后洗净浮沫。\n炒香 | 番茄和洋葱炒出汁。\n慢炖 | 加热水和牛腩，小火炖 60 分钟。',
    },
  })
  await form.callMethod('uploadImage', tempImage.filePath, tempImage.size)
  const uploaded = await waitFor(async () => {
    const data = await form.data()
    return !data.imageUploading && data.imageMediaId
      ? data
      : false
  }, '菜品图片上传')
  assert.ok(uploaded.image?.src)
  assert.match(uploaded.image.src, /^https:\/\//)
  await screenshot('form-uploaded')
  console.log('PASS 前端上传图片到私有 COS 并拿到签名地址')

  await form.callMethod('onSave')
  created = await waitFor(async () => {
    const page = await listRecipes(owner.token, owner.activeSpaceId)
    return page.items.find((item) => item.title === title) ?? false
  }, '前端保存菜单')
  assert.equal(created.imageMediaId, uploaded.imageMediaId)
  console.log('PASS 前端保存菜单与图片关联')

  const menuPage = await open('/pages/menu/index')
  const menuData = await waitFor(async () => {
    const data = await menuPage.data()
    return !data.loading && data.recipes.some((item) => item.id === created.id)
      ? data
      : false
  }, '菜单列表刷新')
  assert.ok(menuData.recommended?.image?.src)
  await assertNoHorizontalOverflow(menuPage, '菜单列表有图')
  await screenshot('list-loaded')
  console.log('PASS 菜单列表展示图片与推荐')

  await menuPage.callMethod('onSelectFast')
  const fastFiltered = await waitFor(async () => {
    const data = await menuPage.data()
    return !data.listLoading && data.recipeFilter === 'fast' ? data : false
  }, '30 分钟筛选')
  assert.equal(fastFiltered.recipes.some((item) => item.id === created.id), false)
  await screenshot('list-fast-filter')

  await menuPage.callMethod('onOpenRecipeBook')
  await waitFor(async () => {
    const data = await menuPage.data()
    return data.recipeFilter === 'all' && data.recipes.some((item) => item.id === created.id)
      ? data
      : false
  }, '返回全部菜谱')

  await menuPage.callMethod('onSearchInput', { detail: { value: title } })
  const searched = await waitFor(async () => {
    const data = await menuPage.data()
    return !data.listLoading && data.searchQuery === title && data.recipes.length === 1
      ? data
      : false
  }, '菜谱搜索')
  assert.equal(searched.recipes[0].id, created.id)
  await screenshot('list-search')
  console.log('PASS 菜谱搜索与 30 分钟筛选走真实菜单查询')

  const detail = await open(`/pages/menu-detail/index?id=${encodeURIComponent(created.id)}`)
  const detailData = await waitFor(async () => {
    const data = await detail.data()
    return !data.loading && data.recipe?.id === created.id ? data : false
  }, '菜单详情')
  assert.equal(detailData.recipe.ingredients.length, 3)
  assert.equal(detailData.recipe.steps.length, 3)
  assert.ok(detailData.recipe.image?.src)
  await assertNoHorizontalOverflow(detail, '菜单详情')
  await screenshot('detail')

  await detail.callMethod('onChangeServings', { currentTarget: { dataset: { delta: '1' } } })
  const served = await waitFor(async () => {
    const data = await detail.data()
    return !data.mutating && data.recipe?.servings === 4 ? data : false
  }, '调整人份')
  const ingredientId = served.recipe.ingredients[0].id
  await detail.callMethod('onToggleIngredient', {
    currentTarget: { dataset: { id: ingredientId } },
  })
  const ready = await waitFor(async () => {
    const data = await detail.data()
    return !data.mutating && data.recipe?.ingredients[0]?.ready ? data : false
  }, '食材备齐')
  assert.equal(ready.recipe.version, 3)
  await screenshot('detail-ready')
  console.log('PASS 详情页人份与食材状态写回服务端')

  const home = await open('/pages/home/index')
  const homeData = await waitFor(async () => {
    const data = await home.data()
    return data.hasLoadedMenu && data.menuCount >= 1 ? data : false
  }, '首页展示菜单摘要')
  assert.match(homeData.menuSummary, new RegExp(title))
  await screenshot('home-loaded')
  console.log('PASS 首页菜单摘要读取真实接口')

  // 自动化端口无法可靠转发 wx.request 的 fail 回调，因此这里验证错误态渲染，
  // 网络错误到 GatewayError 的映射由 tests/services/http-menu.test.ts 覆盖。
  const failedList = await open('/pages/menu/index')
  await waitFor(async () => {
    const data = await failedList.data()
    return !data.loading && data.recipes.length > 0
  }, '菜单加载完成')
  await failedList.setData({
    loading: false,
    loadError: '网络不太稳定，请稍后再试',
  })
  await screenshot('list-network-error')
  await failedList.callMethod('onRetryLoad')
  await waitFor(async () => {
    const data = await failedList.data()
    return !data.loading && !data.loadError && data.recipes.length > 0
  }, '菜单错误提示重试恢复')
  console.log('PASS 错误提示渲染与重试恢复')

  const serverUpdated = await apiOk(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(created.id)}`,
    {
      method: 'PUT',
      token: owner.token,
      headers: {
        'If-Match': `"${ready.recipe.version}"`,
        'Idempotency-Key': `menu_ui_conflict_${suffix}`,
      },
      body: {
        title: updatedTitle,
        description: '另一台设备刚刚更新了这道菜。',
        servings: 4,
        cookingMinutes: 75,
        imageMediaId: created.imageMediaId,
        ingredients: ready.recipe.ingredients.map((item) => ({
          id: item.id,
          name: item.name,
          amount: item.amount,
          source: item.source,
        })),
        steps: ready.recipe.steps.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
        })),
      },
    },
  )
  assert.equal(serverUpdated.version, 4)

  const edit = await open(`/pages/menu-form/index?id=${encodeURIComponent(created.id)}`)
  await waitFor(async () => {
    const data = await edit.data()
    return !data.loading && data.version === 4
  }, '编辑页加载')
  await screenshot('form-edit')
  await edit.setData({ version: 3, 'form.title': `${title}·旧版本` })
  await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
  await edit.callMethod('onSave')
  const recovered = await waitFor(async () => {
    const data = await edit.data()
    return !data.saving && data.version === 4 && data.form.title === updatedTitle
      ? data
      : false
  }, '版本冲突后重载')
  assert.equal(recovered.version, 4)
  await miniProgram.restoreWxMethod('showModal')
  await screenshot('form-conflict-reloaded')
  console.log('PASS 版本冲突不覆盖并重新载入最新内容')

  const cleanup = await apiRaw(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(created.id)}`,
    {
      method: 'DELETE',
      token: owner.token,
      headers: {
        'If-Match': `"${recovered.version}"`,
        'Idempotency-Key': `menu_ui_cleanup_${suffix}`,
      },
    },
  )
  assert.equal(cleanup.status, 204)
  created = null
  console.log('PASS 验收菜单已软删除清理')
} finally {
  await miniProgram.restoreWxMethod('showModal').catch(() => undefined)
  if (created && owner) {
    const latest = await apiRaw(
      `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(created.id)}`,
      { token: owner.token },
    )
    if (latest.status === 200) {
      await apiRaw(
        `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(created.id)}`,
        {
          method: 'DELETE',
          token: owner.token,
          headers: {
            'If-Match': `"${latest.data.version}"`,
            'Idempotency-Key': `menu_ui_cleanup_final_${suffix}`,
          },
        },
      ).catch(() => undefined)
    }
  }
  await miniProgram.disconnect().catch(() => undefined)
}
