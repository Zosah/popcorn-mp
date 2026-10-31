// 连接已开启自动化端口的微信开发者工具，验证前端 MVP 的主要本地闭环。
// 使用前：cli auto --project <项目> --auto-port 9420
import assert from 'node:assert/strict'

import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const miniProgram = await automator.connect({ wsEndpoint })
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const runtimeErrors = []

miniProgram.on('console', (message) => {
  if (message.type === 'error') {
    runtimeErrors.push(`console: ${message.args?.join(' ')}`)
  }
})
miniProgram.on('exception', (error) => {
  runtimeErrors.push(`exception: ${error.message ?? String(error)}`)
})

async function open(url) {
  const page = await miniProgram.reLaunch(url)
  await wait(700)
  if (!page) throw new Error(`页面打开失败：${url}`)
  return page
}

async function go(url) {
  const page = await miniProgram.navigateTo(url)
  await wait(700)
  if (!page) throw new Error(`页面跳转失败：${url}`)
  return page
}

async function confirmModal() {
  await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
}

async function restoreModal() {
  await miniProgram.restoreWxMethod('showModal')
}

async function waitFor(check, label, timeoutMs = 12000) {
  const startedAt = Date.now()
  let lastValue
  while (Date.now() - startedAt < timeoutMs) {
    lastValue = await check()
    if (lastValue) return lastValue
    await wait(250)
  }
  throw new Error(`等待超时：${label}，最后状态：${JSON.stringify(lastValue)}`)
}

async function waitForPage(path, check, label, timeoutMs = 12000) {
  return waitFor(async () => {
    const current = await miniProgram.currentPage().catch(() => null)
    if (current?.path !== path) return false
    const data = await current.data()
    return check(data) ? { page: current, data } : false
  }, label, timeoutMs)
}

async function resetDemo() {
  const page = await open('/pages/profile/index')
  await confirmModal()
  await page.callMethod('onResetDemo')
  await wait(1000)
  await restoreModal()
}

try {
  await resetDemo()

  // 登录注册：本地建号 → 退出 → 再次登录
  await miniProgram.callWxMethod(
    'removeStorageSync',
    'popcorn_demo_auth_account_v1',
  )
  await miniProgram.callWxMethod(
    'removeStorageSync',
    'popcorn_demo_auth_session_v1',
  )
  await open('/pages/profile/index')
  let page = await go('/pages/auth/index')
  await page.setData({
    nicknameInput: 'MVP 验收员',
    nicknamePreview: 'M',
    selectedTone: 'mint',
  })
  await page.callMethod('onSubmitProfile')
  await wait(900)

  let authAccount = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_auth_account_v1',
  )
  let authSession = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_auth_session_v1',
  )
  assert.equal(authAccount.nickname, 'MVP 验收员')
  assert.equal(authSession.userId, authAccount.id)
  console.log('PASS 本机账号注册与登录态')

  page = await go('/pages/auth/index')
  await confirmModal()
  await page.callMethod('onLogout')
  await wait(400)
  await restoreModal()
  authSession = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_auth_session_v1',
  )
  assert.equal(authSession, '')
  await page.callMethod('onWechatLogin')
  await wait(700)
  authSession = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_auth_session_v1',
  )
  assert.equal(authSession.userId, authAccount.id)
  console.log('PASS 退出与再次登录')

  // 重要记录：新增 → 编辑 → 删除
  await open('/pages/journal/index')
  page = await go('/pages/journal-form/index?kind=note')
  await page.setData({
    form: { title: 'MVP 验收 · 重要记录', content: '新增内容' },
    category: 'other',
    categoryIndex: 3,
    visibility: 'space',
  })
  await page.callMethod('onSave')
  await wait(1000)

  let entries = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_journal_v1',
  )
  let note = entries.find((entry) => entry.title === 'MVP 验收 · 重要记录')
  assert.ok(note, '重要记录新增后应写入本地存储')
  console.log('PASS 重要记录新增')

  page = await open(`/pages/journal-detail/index?id=${note.id}`)
  await page.callMethod('onEdit')
  await wait(700)
  page = await miniProgram.currentPage()
  assert.equal(page?.path, 'pages/journal-form/index')
  await page.setData({
    form: { title: 'MVP 验收 · 已编辑', content: '编辑后的内容' },
  })
  await page.callMethod('onSave')
  await wait(1000)
  entries = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_journal_v1',
  )
  note = entries.find((entry) => entry.id === note.id)
  assert.equal(note.title, 'MVP 验收 · 已编辑')
  console.log('PASS 重要记录编辑')

  page = await open(`/pages/journal-detail/index?id=${note.id}`)
  await confirmModal()
  await page.callMethod('onDelete')
  await wait(1000)
  await restoreModal()
  entries = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_journal_v1',
  )
  assert.equal(entries.some((entry) => entry.id === note.id), false)
  console.log('PASS 重要记录删除')

  // 菜单：新增 → 改人份 → 勾选食材 → 重新打开 → 编辑 → 删除
  await open('/pages/menu/index')
  page = await go('/pages/menu-form/index')
  await page.setData({
    form: {
      title: 'MVP 验收炒饭',
      description: '运行时验收',
      servings: '2',
      cookingMinutes: '12',
      ingredientsText: '米饭 | 1 碗 | 冰箱\n鸡蛋 | 2 个 | 冰箱',
      stepsText: '备料 | 米饭打散，鸡蛋搅匀。\n翻炒 | 炒匀即可',
    },
  })
  await page.callMethod('onSave')
  await wait(1000)

  let recipes = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_menu_v1',
  )
  let recipe = recipes.find((item) => item.title === 'MVP 验收炒饭')
  assert.ok(recipe, '菜单新增后应写入本地存储')
  console.log('PASS 菜单新增')

  page = await open(`/pages/menu-detail/index?id=${recipe.id}`)
  await page.callMethod('onChangeServings', {
    currentTarget: { dataset: { delta: '1' } },
  })
  await wait(300)
  let detail = await page.data()
  const ingredientId = detail.recipe.ingredients[0].id
  await page.callMethod('onToggleIngredient', {
    currentTarget: { dataset: { id: ingredientId } },
  })
  await wait(300)
  detail = await page.data()
  assert.equal(detail.recipe.servings, 3)
  assert.equal(detail.recipe.ingredients[0].ready, true)
  console.log('PASS 菜单人份与备料状态更新')

  page = await open(`/pages/menu-detail/index?id=${recipe.id}`)
  detail = await page.data()
  assert.equal(detail.recipe.servings, 3)
  assert.equal(detail.recipe.ingredients[0].ready, true)
  console.log('PASS 菜单重新打开后数据仍在')

  // 做饭模式：备菜 → 开始计时 → 分步完成 → 离开恢复 → 完成 → 清理
  await page.callMethod('onStartCooking')
  let cook = await waitForPage(
    'pages/menu-cook/index',
    (data) => data.id === recipe.id && !data.loading && data.recipe?.id === recipe.id,
    '进入 Demo 做饭模式',
  )
  page = cook.page
  assert.equal(cook.data.stage, 'prep')
  assert.equal(cook.data.recipe.steps.length, 2)

  for (const ingredient of [...cook.data.recipe.ingredients]) {
    if (ingredient.ready) continue
    await page.callMethod('onToggleIngredient', {
      currentTarget: { dataset: { id: ingredient.id } },
    })
    cook.data = await waitFor(async () => {
      const data = await page.data()
      const current = data.recipe?.ingredients?.find((item) => item.id === ingredient.id)
      return !data.mutating && current?.ready ? data : false
    }, `Demo 备菜勾选 ${ingredient.name}`)
  }
  assert.equal(cook.data.missingIngredients.length, 0)

  await page.callMethod('onBeginCooking')
  cook.data = await waitFor(async () => {
    const data = await page.data()
    return data.stage === 'cooking' && data.session?.startedAt ? data : false
  }, 'Demo 开始做饭计时')
  await wait(1200)
  cook.data = await page.data()
  assert.notEqual(cook.data.elapsedLabel, '00:00')

  const firstStepId = cook.data.currentStep?.id
  await page.callMethod('onPrimaryStepAction')
  cook.data = await waitFor(async () => {
    const data = await page.data()
    return data.completedCount === 1 ? data : false
  }, 'Demo 完成做饭第一步')
  assert.ok(cook.data.session.completedStepIds.includes(firstStepId))

  page = await open(`/pages/menu-cook/index?id=${recipe.id}`)
  cook.data = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.stage === 'cooking' && data.completedCount === 1
      ? data
      : false
  }, 'Demo 重进恢复做饭进度')
  assert.ok(cook.data.session.completedStepIds.includes(firstStepId))

  for (let guard = 0; cook.data.stage !== 'done' && guard < 5; guard += 1) {
    const beforeCount = cook.data.completedCount
    await page.callMethod('onPrimaryStepAction')
    cook.data = await waitFor(async () => {
      const data = await page.data()
      return data.stage === 'done' || data.completedCount > beforeCount ? data : false
    }, 'Demo 继续完成做饭步骤')
  }
  assert.equal(cook.data.stage, 'done')
  assert.equal(cook.data.progressPercent, 100)

  await confirmModal()
  await page.callMethod('onFinishCooking')
  await waitForPage(
    'pages/menu/index',
    () => true,
    'Demo 结束做饭返回菜单',
  )
  await restoreModal()
  const cookingSession = await miniProgram.callWxMethod(
    'getStorageSync',
    `popcorn_menu_cooking_session_v1:${recipe.id}`,
  )
  assert.equal(cookingSession, '')
  console.log('PASS Demo 做饭模式、计时、恢复、完成与清理')

  page = await open(`/pages/menu-cook/index?id=${recipe.id}`)
  cook.data = await waitFor(async () => {
    const data = await page.data()
    return !data.loading && data.stage === 'prep' ? data : false
  }, 'Demo 清理后可重新开始做饭')
  assert.equal(cook.data.completedCount, 0)

  page = await open(`/pages/menu-detail/index?id=${recipe.id}`)
  await page.callMethod('onEdit')
  await wait(700)
  page = await miniProgram.currentPage()
  const editData = await page.data()
  await page.setData({
    form: { ...editData.form, title: 'MVP 验收炒饭 · 已编辑' },
  })
  await page.callMethod('onSave')
  await wait(1000)
  recipes = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_menu_v1',
  )
  recipe = recipes.find((item) => item.id === recipe.id)
  assert.equal(recipe.title, 'MVP 验收炒饭 · 已编辑')
  assert.equal(recipe.servings, 3)
  assert.equal(recipe.ingredients[0].ready, true)
  console.log('PASS 菜单编辑保留人份与备料状态')

  page = await open(`/pages/menu-detail/index?id=${recipe.id}`)
  await confirmModal()
  await page.callMethod('onDelete')
  await wait(1000)
  await restoreModal()
  recipes = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_menu_v1',
  )
  assert.equal(recipes.some((item) => item.id === recipe.id), false)
  console.log('PASS 菜单删除')

  // 待办：旅行清单 → 账单 → 完成 → 删除
  await open('/pages/todo/index')
  page = await go('/pages/todo-form/index?kind=travel')
  await page.setData({
    form: {
      kind: 'travel',
      title: 'MVP 验收 · 去海边',
      note: '记得看天气',
      dueDate: '2026-11-08',
      destination: '海边',
      checklistText: '身份证\n充电器\n防晒',
      exercise: '',
      durationMinutes: '',
      calories: '',
      mealType: 'dinner',
      amount: '',
      merchant: '',
    },
  })
  await page.callMethod('onSave')
  await wait(1000)

  let todos = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_todo_v1',
  )
  const travelTodo = todos.find((item) => item.title === 'MVP 验收 · 去海边')
  assert.ok(travelTodo, '旅行待办新增后应写入本地存储')
  assert.equal(travelTodo.checklist.length, 3)
  console.log('PASS 旅行待办新增')

  page = await open('/pages/todo/index')
  await page.callMethod('onToggleChecklist', {
    currentTarget: {
      dataset: {
        parentId: travelTodo.id,
        checklistId: travelTodo.checklist[0].id,
      },
    },
  })
  await wait(300)
  todos = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_todo_v1',
  )
  assert.equal(
    todos.find((item) => item.id === travelTodo.id)?.checklist[0].done,
    true,
  )
  console.log('PASS 旅行准备清单勾选')

  page = await go('/pages/todo-form/index?kind=expense')
  await page.setData({
    form: {
      kind: 'expense',
      title: 'MVP 验收 · 晚餐',
      note: '两个人的晚饭',
      dueDate: '2026-10-24',
      destination: '',
      checklistText: '',
      exercise: '',
      durationMinutes: '',
      calories: '',
      mealType: 'dinner',
      amount: '88.50',
      merchant: '小店',
    },
  })
  await page.callMethod('onSave')
  await wait(1000)
  todos = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_todo_v1',
  )
  const expenseTodo = todos.find((item) => item.title === 'MVP 验收 · 晚餐')
  assert.equal(expenseTodo?.done, true)
  assert.equal(expenseTodo?.amount, 88.5)
  console.log('PASS 账单记录')

  page = await open('/pages/todo/index')
  const planTodo = todos.find((item) => item.kind === 'plan' && !item.done)
  assert.ok(planTodo, '示例小计划应存在')
  await page.callMethod('onToggleItem', {
    currentTarget: { dataset: { id: planTodo.id } },
  })
  await wait(300)
  todos = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_todo_v1',
  )
  assert.equal(todos.find((item) => item.id === planTodo.id)?.done, true)
  console.log('PASS 待办完成状态')

  page = await open(`/pages/todo-form/index?id=${travelTodo.id}`)
  await confirmModal()
  await page.callMethod('onDelete')
  await wait(1000)
  await restoreModal()
  todos = await miniProgram.callWxMethod(
    'getStorageSync',
    'popcorn_demo_todo_v1',
  )
  assert.equal(todos.some((item) => item.id === travelTodo.id), false)
  console.log('PASS 待办删除')

  // 全量重置：本地记录恢复种子数据，提醒键被清除
  await resetDemo()
  const [journalAfter, menuAfter, reminders, todoAfter] = await Promise.all([
    miniProgram.callWxMethod('getStorageSync', 'popcorn_demo_journal_v1'),
    miniProgram.callWxMethod('getStorageSync', 'popcorn_demo_menu_v1'),
    miniProgram.callWxMethod('getStorageSync', 'popcorn_demo_reminders_v1'),
    miniProgram.callWxMethod('getStorageSync', 'popcorn_demo_todo_v1'),
  ])
  assert.equal(journalAfter.filter((item) => item.kind === 'moment').length, 2)
  assert.equal(journalAfter.filter((item) => item.kind === 'note').length, 3)
  assert.equal(menuAfter.length, 2)
  assert.ok(!reminders, '提醒设置重置后应清空本地键')
  assert.equal(todoAfter.length, 5)
  assert.equal(todoAfter.filter((item) => !item.done).length, 4)
  console.log('PASS 全量 Demo 重置')

  assert.deepEqual(runtimeErrors, [])
  console.log('MVP RUNTIME VERIFICATION PASSED')
} finally {
  try {
    await restoreModal()
  } catch {
    // mock 可能未启用，忽略恢复失败。
  }
  await miniProgram.disconnect()
}
