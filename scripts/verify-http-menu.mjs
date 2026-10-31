// 菜单 HTTP 全链路验收：登录、空间隔离、COS 图片、CRUD、幂等、乐观锁与软删除。
import assert from 'node:assert/strict'

const apiBaseUrl = (process.env.API_BASE_URL ?? 'http://127.0.0.1:8080').replace(/\/+$/, '')
const suffix = Date.now().toString(36).slice(-8)
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
  'base64',
)

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

async function login(identity, nickname) {
  const loginResult = await apiOk('/auth/mock', {
    method: 'POST',
    body: { identity, deviceLabel: '菜单 HTTP 验收' },
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

async function uploadMenuImage(token, spaceId) {
  const form = new FormData()
  form.append('purpose', 'menu')
  form.append('file', new Blob([png], { type: 'image/png' }), 'menu-smoke.png')
  const response = await fetch(
    `${apiBaseUrl}/spaces/${encodeURIComponent(spaceId)}/media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    },
  )
  const data = await response.json()
  if (response.status !== 201) {
    throw new Error(`上传菜单图片 -> ${response.status}: ${JSON.stringify(data)}`)
  }
  assert.equal(data.purpose, 'menu')
  assert.equal(data.spaceId, spaceId)
  assert.ok(data.display?.url)
  assert.ok(data.thumb?.url)
  return data
}

function menuInput(imageMediaId, title) {
  return {
    title,
    description: '菜单 HTTP 全链路验收',
    servings: 2,
    cookingMinutes: 30,
    imageMediaId,
    ingredients: [
      { name: '番茄', amount: '2 个', source: '冰箱' },
      { name: '鸡蛋', amount: '3 个', source: '冰箱' },
    ],
    steps: [
      { title: '切番茄', description: '切成小块。' },
      { title: '炒蛋', description: '炒熟后盛出。' },
      { title: '合炒', description: '番茄出汁后放回鸡蛋。' },
    ],
  }
}

let owner
let outsider
let ownerImage
let outsiderImage
let recipe

try {
  owner = await login(`menu-owner-${suffix}`, `菜单房主${suffix.slice(-3)}`)
  outsider = await login(`menu-outsider-${suffix}`, `菜单访客${suffix.slice(-3)}`)
  assert.notEqual(owner.activeSpaceId, outsider.activeSpaceId)
  console.log('PASS 两个 mock 用户拥有独立空间')

  ownerImage = await uploadMenuImage(owner.token, owner.activeSpaceId)
  const imageResponse = await fetch(ownerImage.display.url)
  assert.equal(imageResponse.status, 200)
  assert.match(imageResponse.headers.get('content-type') ?? '', /^image\/jpeg/)
  console.log('PASS COS 私有桶上传与签名读取')

  const createKey = `menu_smoke_create_${suffix}`
  const body = menuInput(ownerImage.id, `番茄炒蛋${suffix.slice(-3)}`)
  recipe = await apiOk(`/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes`, {
    method: 'POST',
    token: owner.token,
    headers: { 'Idempotency-Key': createKey },
    body,
  })
  const replay = await apiOk(`/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes`, {
    method: 'POST',
    token: owner.token,
    headers: { 'Idempotency-Key': createKey },
    body,
  })
  assert.equal(replay.id, recipe.id)
  assert.equal(recipe.imageMediaId, ownerImage.id)
  assert.equal(recipe.version, 1)
  console.log('PASS 菜单创建、图片关联与幂等重放')

  const list = await apiOk(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes?query=${encodeURIComponent('番茄')}&limit=100`,
    { token: owner.token },
  )
  assert.ok(list.items.some((item) => item.id === recipe.id))
  const detail = await apiOk(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(recipe.id)}`,
    { token: owner.token },
  )
  assert.equal(detail.ingredients.length, 2)
  assert.equal(detail.steps.length, 3)
  console.log('PASS 列表搜索与详情读取')

  const servings = await apiOk(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(recipe.id)}/servings`,
    {
      method: 'PUT',
      token: owner.token,
      headers: {
        'If-Match': `"${recipe.version}"`,
        'Idempotency-Key': `menu_smoke_servings_${suffix}`,
      },
      body: { servings: 3 },
    },
  )
  assert.equal(servings.servings, 3)
  assert.equal(servings.version, 2)

  const ingredientId = servings.ingredients[0].id
  const ready = await apiOk(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(recipe.id)}/ingredients/${encodeURIComponent(ingredientId)}/ready`,
    {
      method: 'POST',
      token: owner.token,
      headers: {
        'If-Match': `"${servings.version}"`,
        'Idempotency-Key': `menu_smoke_ready_${suffix}`,
      },
    },
  )
  assert.equal(ready.ingredients[0].ready, true)
  assert.equal(ready.version, 3)
  console.log('PASS 人份调整与食材备齐状态')

  const updated = await apiOk(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(recipe.id)}`,
    {
      method: 'PUT',
      token: owner.token,
      headers: {
        'If-Match': `"${ready.version}"`,
        'Idempotency-Key': `menu_smoke_update_${suffix}`,
      },
      body: {
        ...menuInput(ownerImage.id, body.title),
        description: '服务端更新后的菜单',
        servings: 3,
        ingredients: ready.ingredients.map((item) => ({
          id: item.id,
          name: item.name,
          amount: item.amount,
          source: item.source,
        })),
        steps: ready.steps.map((item) => ({
          id: item.id,
          title: item.title,
          description: item.description,
        })),
      },
    },
  )
  assert.equal(updated.version, 4)
  assert.equal(updated.description, '服务端更新后的菜单')
  assert.equal(updated.ingredients[0].ready, true)
  console.log('PASS 编辑复用食材/步骤 ID 并保留备齐状态')

  const conflict = await apiRaw(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(recipe.id)}`,
    {
      method: 'PUT',
      token: owner.token,
      headers: {
        'If-Match': '"1"',
        'Idempotency-Key': `menu_smoke_conflict_${suffix}`,
      },
      body: menuInput(ownerImage.id, body.title),
    },
  )
  assert.equal(conflict.status, 409)
  assert.equal(conflict.data.code, 'VERSION_CONFLICT')
  console.log('PASS 旧版本写入被乐观锁拦截')

  const crossSpace = await apiRaw(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(recipe.id)}`,
    { token: outsider.token },
  )
  assert.equal(crossSpace.status, 404)
  console.log('PASS 非空间成员无法读取菜单')

  outsiderImage = await uploadMenuImage(outsider.token, outsider.activeSpaceId)
  const foreignImage = await apiRaw(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes`,
    {
      method: 'POST',
      token: owner.token,
      headers: { 'Idempotency-Key': `menu_smoke_foreign_image_${suffix}` },
      body: menuInput(outsiderImage.id, `跨空间图片${suffix.slice(-3)}`),
    },
  )
  assert.equal(foreignImage.status, 422)
  assert.equal(foreignImage.data.code, 'MEDIA_NOT_FOUND')
  console.log('PASS 跨空间图片不能挂到菜单')

  await apiOk(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(recipe.id)}`,
    {
      method: 'DELETE',
      token: owner.token,
      headers: {
        'If-Match': `"${updated.version}"`,
        'Idempotency-Key': `menu_smoke_delete_${suffix}`,
      },
    },
  )
  const deleted = await apiRaw(
    `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(recipe.id)}`,
    { token: owner.token },
  )
  assert.equal(deleted.status, 404)
  console.log('PASS 菜单软删除后不可见')
} finally {
  if (recipe && owner && !String(recipe.id).startsWith('deleted')) {
    await apiRaw(
      `/spaces/${encodeURIComponent(owner.activeSpaceId)}/menu-recipes/${encodeURIComponent(recipe.id)}`,
      {
        method: 'DELETE',
        token: owner.token,
        headers: {
          'If-Match': `"${recipe.version}"`,
          'Idempotency-Key': `menu_smoke_cleanup_${suffix}`,
        },
      },
    ).catch(() => undefined)
  }
}
