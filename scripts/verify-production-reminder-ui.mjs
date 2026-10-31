// 生产提醒订阅安全态验收。
// 前提：开发者工具已打开生产配置并启动 automation：cli auto --auto-port 9420。
// 只读取真实微信会话，不打印 Token；未配置模板时不会触发真实订阅或发送消息。
import assert from 'node:assert/strict'
import automator from 'miniprogram-automator'

const wsEndpoint = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const apiBaseUrl = (process.env.API_BASE_URL ?? 'https://popcorn-api.simiway.cc').replace(/\/+$/, '')
const expectConfigured = process.env.EXPECT_SUBSCRIPTION_CONFIGURED === '1'
const tokenKey = 'popcorn_api_auth_token_v1'
const sessionKey = 'popcorn_api_auth_session_v1'
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const miniProgram = await automator.connect({ wsEndpoint })
const runtimeErrors = []

miniProgram.on('console', (message) => {
  if (message.type === 'error') {
    runtimeErrors.push(`console: ${message.args?.join(' ')}`)
  }
})
miniProgram.on('exception', (error) => {
  runtimeErrors.push(`exception: ${error.message ?? String(error)}`)
})

async function api(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      Authorization: `Bearer ${options.token}`,
      ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers ?? {}),
    },
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

const token = await miniProgram.callWxMethod('getStorageSync', tokenKey)
const session = await miniProgram.callWxMethod('getStorageSync', sessionKey)
assert.equal(typeof token, 'string')
assert.ok(token)
assert.equal(typeof session, 'object')
assert.ok(session?.activeSpaceId)

const settingsPath = `/spaces/${encodeURIComponent(session.activeSpaceId)}/reminder-settings`
const subscriptionPath = `/spaces/${encodeURIComponent(session.activeSpaceId)}/reminder-subscription`
const settingsResponse = await api(settingsPath, { token })
const subscriptionResponse = await api(subscriptionPath, { token })
assert.equal(settingsResponse.status, 200)
assert.equal(subscriptionResponse.status, 200)
assert.equal(typeof subscriptionResponse.data?.configured, 'boolean')
assert.equal(subscriptionResponse.data.configured, expectConfigured)

if (!expectConfigured) {
  const writeResponse = await api(subscriptionPath, {
    method: 'PUT',
    token,
    headers: { 'Idempotency-Key': `prod-reminder-verify-${Date.now()}` },
    body: { status: 'accept' },
  })
  assert.equal(writeResponse.status, 503)
  assert.equal(writeResponse.data?.code, 'SUBSCRIPTION_NOT_CONFIGURED')
}

const page = await miniProgram.reLaunch('/pages/reminder-settings/index')
await wait(500)
assert.ok(page)
const data = await waitFor(async () => {
  const current = await page.data()
  return current?.loading === false ? current : null
}, '提醒设置页面加载')

assert.equal(data.syncState, 'synced')
assert.equal(data.errorText, '')
assert.equal(data.subscriptionErrorText, '')
assert.equal(data.subscription.configured, expectConfigured)
if (expectConfigured) {
  assert.notEqual(data.subscriptionLabel, '模板未配置')
  assert.notEqual(data.subscriptionActionText, '暂不可授权')
} else {
  assert.equal(data.subscriptionLabel, '模板未配置')
  assert.equal(data.subscriptionActionText, '暂不可授权')
}

const systemInfo = await miniProgram.systemInfo()
const size = await page.size()
assert.ok(Number(size.width) <= Number(systemInfo.windowWidth) + 1, `页面横向溢出：${size.width} > ${systemInfo.windowWidth}`)
assert.deepEqual(runtimeErrors, [])

await miniProgram.pageScrollTo(0)
await wait(350)
const screenshot = `shots/production-reminder-ui-${expectConfigured ? 'configured' : 'unconfigured'}.png`
await miniProgram.screenshot({ path: screenshot })
console.log(JSON.stringify({
  status: 'PRODUCTION REMINDER UI VERIFICATION PASSED',
  apiBaseUrl,
  configured: data.subscription.configured,
  subscriptionLabel: data.subscriptionLabel,
  subscriptionStatus: data.subscription.status,
  availableCount: data.subscription.availableCount,
  screenshot,
}))
await miniProgram.disconnect()
