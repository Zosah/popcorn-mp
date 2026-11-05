import automator from 'miniprogram-automator'
const mp = await automator.connect({ wsEndpoint: 'ws://127.0.0.1:9420' })
await new Promise((r) => setTimeout(r, 4000))
await mp.reLaunch('/pages/item-form/index')
await new Promise((r) => setTimeout(r, 3000))
const q = await mp.evaluate(() => new Promise((resolve) => {
  wx.createSelectorQuery().select('.form-hero__title').boundingClientRect().selectAll('.chip').boundingClientRect().exec((r) => resolve({ title: r[0], chips: (r[1] || []).length }))
}))
console.log(JSON.stringify(q))
await mp.screenshot({ path: '/tmp/form-v2-top.png' })
await mp.disconnect()
