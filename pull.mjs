import automator from 'miniprogram-automator'
const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
await wait(3500)
for (let i = 0; i < 4; i++) {
  await mp.reLaunch('/pages/home/index')
  await wait(2000)
  const p = await mp.currentPage()
  if (p.path === 'pages/home/index') break
}
await mp.evaluate(() => { wx.startPullDownRefresh({}) })
await wait(300)
await mp.screenshot({ path: '/tmp/pull-1.png' })
const d = await (await mp.currentPage()).data()
console.log('pullRefreshing=', d.pullRefreshing)
await wait(2500)
await mp.screenshot({ path: '/tmp/pull-2.png' })
await mp.disconnect()
