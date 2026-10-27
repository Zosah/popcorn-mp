// 用微信开发者工具的自动化端口抓取页面截图，便于本地比对视觉改动。
// 使用前：cli auto --project <项目> --auto-port 9420
import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const prefix = process.argv[2] ?? 'current'
const miniProgram = await automator.connect({ wsEndpoint })

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function open(url) {
  const page = await miniProgram.reLaunch(url)
  await wait(700)
  if (!page) throw new Error(`页面打开失败：${url}`)
  return page
}

// 截图使用固定的 Demo 种子数据，避免本地操作记录污染视觉验收。
const profile = await open('/pages/profile/index')
await miniProgram.mockWxMethod('showModal', { confirm: true, cancel: false })
await profile.callMethod('onResetDemo')
await wait(800)
await miniProgram.restoreWxMethod('showModal')
await miniProgram.callWxMethod(
  'removeStorageSync',
  'popcorn_demo_auth_account_v1',
)
await miniProgram.callWxMethod(
  'removeStorageSync',
  'popcorn_demo_auth_session_v1',
)

const capture = async (name) => {
  await wait(1800)
  await miniProgram.screenshot({ path: `shots/${prefix}-${name}.png` })
  console.log('captured', name)
}

const tabTargets = [
  ['home', '/pages/home/index'],
  ['inventory', '/pages/inventory/index'],
  ['journal', '/pages/journal/index'],
  ['profile', '/pages/profile/index'],
]

for (const [name, url] of tabTargets) {
  await miniProgram.switchTab(url)
  await miniProgram.pageScrollTo(0)
  await capture(name)
}

const journal = await miniProgram.switchTab('/pages/journal/index')
await journal.callMethod('onSwitchView', {
  currentTarget: { dataset: { value: 'notes' } },
})
await miniProgram.pageScrollTo(0)
await capture('journal-notes')

const inventory = await miniProgram.callWxMethod(
  'getStorageSync',
  'popcorn_demo_inventory_v1',
)
const petStore = await miniProgram.callWxMethod(
  'getStorageSync',
  'popcorn_demo_pets_v2',
)
const itemId = Array.isArray(inventory) ? inventory[0]?.id : ''
const activePet =
  petStore?.pets?.find((item) => item.profile.id === petStore.activePetId) ??
  petStore?.pets?.[0]
const eventId = activePet?.events?.[0]?.id ?? ''

const pageTargets = [
  ['item-form', '/pages/item-form/index'],
  ['item-detail', itemId ? `/pages/item-detail/index?id=${itemId}` : ''],
  ['pets', '/pages/pets/index'],
  ['pet-event-form', '/pages/pet-event-form/index'],
  ['pet-event-detail', eventId ? `/pages/pet-event-detail/index?id=${eventId}` : ''],
  ['pet-calendar', '/pages/pet-calendar/index'],
  ['menu', '/pages/menu/index'],
  ['menu-detail', '/pages/menu-detail/index?id=demo-menu-tomato-beef'],
  ['menu-form', '/pages/menu-form/index'],
  ['menu-edit', '/pages/menu-form/index?id=demo-menu-tomato-beef'],
  ['journal-form', '/pages/journal-form/index'],
  ['journal-detail', '/pages/journal-detail/index?id=demo-journal-flowers'],
  ['journal-edit', '/pages/journal-form/index?id=demo-journal-flowers'],
  ['journal-note-form', '/pages/journal-form/index?kind=note'],
  ['journal-note-detail', '/pages/journal-detail/index?id=demo-note-home'],
  ['journal-note-edit', '/pages/journal-form/index?id=demo-note-home'],
  ['todo', '/pages/todo/index'],
  ['todo-form', '/pages/todo-form/index?kind=travel'],
  ['auth-login', '/pages/auth/index'],
  ['auth-register', '/pages/auth/index?mode=register'],
  ['reminder-settings', '/pages/reminder-settings/index'],
  ['space', '/pages/space/index'],
  ['invite', '/pages/invite/index'],
]

for (const [name, url] of pageTargets) {
  if (!url) {
    console.log('skipped', name)
    continue
  }
  await open('/pages/home/index')
  await miniProgram.navigateTo(url)
  await wait(600)
  await miniProgram.pageScrollTo(0)
  await capture(name)
}

await miniProgram.disconnect()
