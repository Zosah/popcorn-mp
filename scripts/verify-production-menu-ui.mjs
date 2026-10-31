// 生产环境菜单图片全链路验收。
// 前提：微信开发者工具已用生产配置打开，并完成真实微信登录；automation 端口可用。
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'https://popcorn-api.simiway.cc').replace(/\/+$/, '')
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const suffix = Date.now().toString(36).slice(-8)
const title = `生产图片验收${suffix.slice(-4)}`
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

async function readCurrentPage() {
  try {
    return await miniProgram.currentPage()
  } catch {
    return null
  }
}

async function waitForPage(path, check, label, timeoutMs = 30000) {
  const startedAt = Date.now()
  let lastValue
  while (Date.now() - startedAt < timeoutMs) {
    const page = await readCurrentPage()
    if (page?.path === path) {
      const data = await page.data()
      lastValue = { data }
      if (check(data)) return { page, data }
    }
    await wait(250)
  }
  throw new Error(`等待超时：${label}，最后状态：${JSON.stringify(lastValue)}`)
}

async function callMethodIgnoringDestroyed(page, method, ...args) {
  try {
    await page.callMethod(method, ...args)
  } catch (error) {
    if (!String(error).includes('page destroyed')) throw error
  }
}

async function screenshot(name) {
  await miniProgram.pageScrollTo(0)
  await wait(400)
  const path = `shots/production-menu-ui-${name}.png`
  await miniProgram.screenshot({ path })
  console.log('CAPTURE', path)
}

async function listRecipes() {
  return apiOk(`/spaces/${encodeURIComponent(spaceId)}/menu-recipes?limit=100`)
}

async function writeTempImage(bytes) {
  return miniProgram.evaluate((base64) => new Promise((resolve, reject) => {
    const filePath = `${wx.env.USER_DATA_PATH}/production-menu-${Date.now()}.jpg`
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

  const form = await open('/pages/menu-form/index')
  await waitFor(async () => (await form.data()).loading === false, '生产新增菜单表单')
  await screenshot('form-empty')

  const tempImage = await writeTempImage(image)
  assert.ok(tempImage.size > 1000)
  await form.setData({
    form: {
      title,
      description: '生产环境图片上传验收，完成后会自动清理。',
      servings: '2',
      cookingMinutes: '25',
      ingredientsText: '番茄 | 2 个 | 冰箱\n鸡蛋 | 2 个 | 冰箱',
      stepsText: '准备 | 番茄切块，鸡蛋打散。\n烹饪 | 炒熟后混合调味。',
    },
  })
  await form.callMethod('uploadImage', tempImage.filePath, tempImage.size)
  const uploaded = await waitFor(async () => {
    const data = await form.data()
    return !data.imageUploading && data.imageMediaId ? data : false
  }, '生产私有 COS 图片上传')
  assert.ok(uploaded.image?.src)
  assert.match(uploaded.image.src, /^https:\/\//)
  await screenshot('form-uploaded')
  console.log('PASS 前端已上传图片到生产私有 COS')

  await form.callMethod('onSave')
  created = await waitFor(async () => {
    const page = await listRecipes()
    return page.items.find((item) => item.title === title) ?? false
  }, '生产菜单保存与回读')
  assert.equal(created.imageMediaId, uploaded.imageMediaId)
  console.log('PASS 菜单已保存并关联图片媒体')

  const list = await open('/pages/menu/index')
  const listData = await waitFor(async () => {
    const data = await list.data()
    return !data.loading && data.recipes.some((item) => item.id === created.id)
      ? data
      : false
  }, '生产菜单列表展示')
  const listItem = listData.recipes.find((item) => item.id === created.id)
  assert.ok(listItem?.image?.src)
  await screenshot('list-loaded')
  console.log('PASS 生产菜单列表展示签名图片')

  await list.callMethod('onOpenRecipeBook')
  await waitFor(async () => {
    const data = await list.data()
    return data.activeTab === 'all' && data.recipeFilter === 'all' ? data : false
  }, '生产菜谱本')
  await screenshot('list-recipe-book')

  await list.callMethod('onSelectFast')
  const fastFiltered = await waitFor(async () => {
    const data = await list.data()
    return !data.listLoading && data.recipeFilter === 'fast' && data.recipes.length >= 1
      ? data
      : false
  }, '生产 30 分钟筛选')
  assert.ok(fastFiltered.recipes.some((item) => item.id === created.id))
  await screenshot('list-fast-filter')

  await list.callMethod('onSearchInput', { detail: { value: title } })
  const searched = await waitFor(async () => {
    const data = await list.data()
    return !data.listLoading && data.searchQuery === title && data.recipes.some((item) => item.id === created.id)
      ? data
      : false
  }, '生产菜谱搜索')
  assert.ok(searched.recipes.some((item) => item.id === created.id))
  await screenshot('list-search')
  console.log('PASS 生产搜索、菜谱本与 30 分钟筛选')

  const detail = await open(`/pages/menu-detail/index?id=${encodeURIComponent(created.id)}`)
  const detailData = await waitFor(async () => {
    const data = await detail.data()
    return !data.loading && data.recipe?.id === created.id ? data : false
  }, '生产菜单详情展示')
  assert.ok(detailData.recipe.image?.src)
  await screenshot('detail-loaded')

  const imageResponse = await fetch(detailData.recipe.image.src)
  assert.equal(imageResponse.status, 200)
  assert.match(imageResponse.headers.get('content-type') ?? '', /^image\//)
  console.log('PASS 签名图片地址可直接读取', JSON.stringify({
    status: imageResponse.status,
    contentType: imageResponse.headers.get('content-type'),
  }))

  await callMethodIgnoringDestroyed(detail, 'onStartCooking')
  let cook = await waitForPage(
    'pages/menu-cook/index',
    (data) => data.id === created.id && !data.loading && data.recipe?.id === created.id,
    '从详情页进入做饭模式',
  )
  assert.equal(cook.data.stage, 'prep')
  assert.ok(cook.data.recipe?.image?.src)
  assert.ok(cook.data.recipe?.steps?.length >= 2)
  await screenshot('cook-prep')
  console.log('PASS 做饭模式从菜单详情进入并展示私有 COS 图片')

  for (const ingredient of [...cook.data.recipe.ingredients]) {
    if (ingredient.ready) continue
    await cook.page.callMethod('onToggleIngredient', {
      currentTarget: { dataset: { id: ingredient.id } },
    })
    cook.data = await waitFor(async () => {
      const data = await cook.page.data()
      const current = data.recipe?.ingredients?.find((item) => item.id === ingredient.id)
      return !data.mutating && current?.ready ? data : false
    }, `备菜勾选 ${ingredient.name}`)
  }
  assert.equal(cook.data.missingIngredients.length, 0)
  console.log('PASS 备菜清单已逐项写回后端')

  await cook.page.callMethod('onBeginCooking')
  cook.data = await waitFor(async () => {
    const data = await cook.page.data()
    return data.stage === 'cooking' && data.session?.startedAt ? data : false
  }, '开始做饭计时')
  await wait(1500)
  cook.data = await cook.page.data()
  assert.notEqual(cook.data.elapsedLabel, '00:00')
  await screenshot('cook-step')
  console.log('PASS 做饭计时开始并可展示当前步骤')

  const firstStepId = cook.data.currentStep?.id
  const firstCompletedCount = cook.data.completedCount
  await cook.page.callMethod('onPrimaryStepAction')
  cook.data = await waitFor(async () => {
    const data = await cook.page.data()
    return data.completedCount > firstCompletedCount ? data : false
  }, '完成第一步')
  assert.ok(cook.data.session.completedStepIds.includes(firstStepId))
  await screenshot('cook-first-step-done')

  const resumed = await open(`/pages/menu-cook/index?id=${encodeURIComponent(created.id)}`)
  cook = {
    page: resumed,
    data: await waitFor(async () => {
      const data = await resumed.data()
      return !data.loading
        && data.stage === 'cooking'
        && data.completedCount === firstCompletedCount + 1
        ? data
        : false
    }, '重新进入后恢复做饭进度'),
  }
  assert.ok(cook.data.session.completedStepIds.includes(firstStepId))
  await screenshot('cook-resumed')
  console.log('PASS 离开并重新进入后恢复步骤进度与计时')

  for (let guard = 0; cook.data.stage !== 'done' && guard < 10; guard += 1) {
    const beforeCount = cook.data.completedCount
    await cook.page.callMethod('onPrimaryStepAction')
    cook.data = await waitFor(async () => {
      const data = await cook.page.data()
      return data.stage === 'done' || data.completedCount > beforeCount ? data : false
    }, '继续完成做饭步骤')
  }
  assert.equal(cook.data.stage, 'done')
  assert.equal(cook.data.completedCount, cook.data.recipe.steps.length)
  assert.equal(cook.data.progressPercent, 100)
  await wait(1600)
  await screenshot('cook-done')
  console.log('PASS 全部步骤完成并进入完成态')

  await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
  await callMethodIgnoringDestroyed(cook.page, 'onFinishCooking')
  await waitFor(async () => {
    const page = await readCurrentPage()
    return page?.path === 'pages/menu/index' ? page : false
  }, '结束做饭返回菜单')
  await miniProgram.restoreWxMethod('showModal')

  const resetCook = await open(`/pages/menu-cook/index?id=${encodeURIComponent(created.id)}`)
  const resetData = await waitFor(async () => {
    const data = await resetCook.data()
    return !data.loading && data.stage === 'prep' ? data : false
  }, '结束做饭后清理本机会话')
  assert.equal(resetData.completedCount, 0)
  console.log('PASS 结束做饭后本机会话已清理')

  const latest = await apiOk(
    `/spaces/${encodeURIComponent(spaceId)}/menu-recipes/${encodeURIComponent(created.id)}`,
  )
  const cleanup = await apiRaw(
    `/spaces/${encodeURIComponent(spaceId)}/menu-recipes/${encodeURIComponent(created.id)}`,
    {
      method: 'DELETE',
      headers: {
        'If-Match': `"${latest.version}"`,
        'Idempotency-Key': `production_menu_cleanup_${suffix}`,
      },
    },
  )
  assert.equal(cleanup.status, 204)
  created = null
  console.log('PASS 生产验收菜单已软删除清理')
} finally {
  if (created) {
    const latest = await apiRaw(
      `/spaces/${encodeURIComponent(spaceId)}/menu-recipes/${encodeURIComponent(created.id)}`,
    )
    if (latest.status === 200) {
      await apiRaw(
        `/spaces/${encodeURIComponent(spaceId)}/menu-recipes/${encodeURIComponent(created.id)}`,
        {
          method: 'DELETE',
          headers: {
            'If-Match': `"${latest.data.version}"`,
            'Idempotency-Key': `production_menu_cleanup_final_${suffix}`,
          },
        },
      ).catch(() => undefined)
    }
  }
  await miniProgram.disconnect().catch(() => undefined)
}
