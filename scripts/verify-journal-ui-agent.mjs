#!/usr/bin/env node
/**
 * 生活记录 UI 自测（开发者工具自动化版）。
 *
 * 前置：
 * 1. 微信开发者工具已打开本项目并登录；
 * 2. 已执行 `cli auto --project . --auto-port 9420` 开启自动化端口；
 * 3. 小程序会话可用（脚本会自动用 wx.login 换取并注入真实会话）。
 *
 * 检查项：
 * - 生活记录列表可加载、有数据；
 * - 有作者头像字段时渲染真实头像，没有字段时回退昵称首字；
 * - 详情页展示图使用 display 地址；
 * - 表单 9 张图时隐藏添加入口、显示满额提示、第 10 张被拒绝。
 *
 * 产物：
 * - shots/agent-journal-*.png
 * - .preview/journal-ui-report.json
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import automator from 'miniprogram-automator'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const WS_ENDPOINT = process.env.WS_ENDPOINT ?? 'ws://127.0.0.1:9420'
const API_BASE_URL = (process.env.API_BASE_URL ?? 'https://popcorn-api.simiway.cc').replace(/\/+$/, '')
const TOKEN_KEY = 'popcorn_api_auth_token_v1'
const SESSION_KEY = 'popcorn_api_auth_session_v1'
const SHOTS_DIR = join(ROOT, 'shots')
const REPORT_DIR = join(ROOT, '.preview')
const REPORT_PATH = join(REPORT_DIR, 'journal-ui-report.json')

const wait = (ms) => new Promise((resolveWait) => setTimeout(resolveWait, ms))
const report = {
  at: new Date().toISOString(),
  endpoint: WS_ENDPOINT,
  apiBaseUrl: API_BASE_URL,
  checks: [],
  warnings: [],
  screenshots: [],
  ok: false,
}

function record(name, passed, detail) {
  report.checks.push({ name, passed, detail: detail ?? '' })
  console.log(`${passed ? 'PASS' : 'FAIL'} ${name}${detail ? ` · ${detail}` : ''}`)
  return passed
}

function warn(message) {
  report.warnings.push(message)
  console.log(`WARN ${message}`)
}

async function ensureSession(mp) {
  const token = await mp.callWxMethod('getStorageSync', TOKEN_KEY)
  const cached = await mp.callWxMethod('getStorageSync', SESSION_KEY)
  if (typeof token === 'string' && token && cached && cached.activeSpaceId) {
    return { token, session: cached }
  }

  const login = await mp.callWxMethod('login')
  if (!login || !login.code) throw new Error('wx.login 没有返回 code')
  const response = await fetch(`${API_BASE_URL}/auth/wechat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ code: login.code, deviceLabel: '微信开发者工具 UI 自测' }),
  })
  if (!response.ok) throw new Error(`生产登录失败：HTTP ${response.status}`)
  const payload = await response.json()
  const session = {
    user: payload.user,
    spaces: payload.spaces,
    activeSpaceId: payload.activeSpaceId,
    expiresAt: payload.expiresAt,
    onboardingRequired: payload.onboardingRequired,
  }
  await mp.callWxMethod('setStorageSync', TOKEN_KEY, payload.token)
  await mp.callWxMethod('setStorageSync', SESSION_KEY, session)
  return { token: payload.token, session }
}

async function capture(mp, name) {
  const path = join(SHOTS_DIR, `agent-journal-${name}.png`)
  await mp.screenshot({ path })
  report.screenshots.push(path)
  console.log(`SHOT ${path}`)
}

async function fetchJournalApi(token, spaceId) {
  const response = await fetch(
    `${API_BASE_URL}/spaces/${encodeURIComponent(spaceId)}/journals?limit=20`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } },
  )
  if (!response.ok) throw new Error(`生活记录接口返回 HTTP ${response.status}`)
  return response.json()
}

async function checkList(mp) {
  await mp.reLaunch('/pages/journal/index')
  await wait(1800)
  const page = await mp.currentPage()
  await mp.evaluate(() => { getCurrentPages().pop().refresh(true); return true })
  await wait(2800)
  const data = await page.data()
  record('列表加载完成', !data.loading && !data.loadError, data.loadError || '')
  record('列表存在记录', (data.entries || []).length > 0, `${(data.entries || []).length} 条`)

  const entries = data.entries || []
  const allHaveInitial = entries.every((entry) => Boolean(entry.authorInitial))
  record('作者昵称首字回退可用', entries.length === 0 || allHaveInitial)

  const segments = await page.$$('.journal-segmented__item')
  record('已移除「全部」入口', segments.length === 2, `${segments.length} 个分段`)

  if ((entries[0]?.images?.length ?? 0) > 0) {
    const rects = await mp.evaluate(() => new Promise((resolve) => {
      const current = getCurrentPages().pop()
      const query = wx.createSelectorQuery().in(current)
      query.select('.journal-photo-row').boundingClientRect()
      query.select('.journal-photo-row__item').boundingClientRect()
      query.exec(([row, item]) => resolve({
        rowWidth: row && row.width,
        itemWidth: item && item.width,
      }))
    }))
    const ratio = rects && rects.rowWidth ? rects.itemWidth / rects.rowWidth : 0
    record('生活点滴图片按三分之一宽度横排', ratio > 0.28 && ratio < 0.38, ratio.toFixed(2))
  }

  await capture(mp, 'list')
  return { page, data, entries }
}

async function checkAvatar(mp, entries, apiList) {
  const firstItem = (apiList.items || [])[0] || {}
  const fieldPresent = Object.prototype.hasOwnProperty.call(firstItem, 'authorAvatarMediaId')
  if (!fieldPresent) {
    warn('生产接口尚未返回 authorAvatarMediaId，真实头像要等后端部署；本次只验证首字回退。')
    return { fieldPresent: false, rendered: 0 }
  }

  // 只统计当前列表实际展示的条目（生活点滴），避免把重要记录也算进分母。
  const entryIds = new Set(entries.map((entry) => entry.id))
  const expected = (apiList.items || []).filter(
    (item) => entryIds.has(item.id) && item.authorAvatarMediaId,
  ).length
  const rendered = entries.filter((entry) => Boolean(entry.authorAvatarUrl)).length
  record('真实头像签名地址已解析', expected === 0 || rendered > 0, `${rendered}/${expected}`)

  if (rendered > 0) {
    const avatar = entries.find((entry) => entry.authorAvatarUrl)
    record(
      '头像使用缩略图签名地址',
      Boolean(avatar && /_thumb\.jpg/.test(avatar.authorAvatarUrl)),
      avatar ? new URL(avatar.authorAvatarUrl).host : '',
    )
    const image = await (await mp.currentPage()).$('.journal-entry__avatar-image')
    record('列表头像渲染为图片节点', Boolean(image))
    await capture(mp, 'avatar-real')
  }
  return { fieldPresent: true, rendered }
}

async function checkPhotoRow(mp, entries) {
  const target = entries[0]
  if (!target) return
  await mp.evaluate(({ id }) => {
    const page = getCurrentPages().pop()
    const entry = (page.data.entries || []).find((item) => item.id === id)
    if (!entry) return false
    const images = Array.from({ length: 5 }, (_, index) => ({
      mediaId: `row-${index + 1}`,
      src: '/images/demo-flowers.jpg',
      thumbSrc: '/images/demo-flowers.jpg',
      caption: '',
    }))
    page.setData({
      'entries[0].images': images,
      'entries[0].image': images[0],
    })
    return true
  }, { id: target.id })
  await wait(700)
  const scroll = await (await mp.currentPage()).$('.journal-photo-row')
  if (scroll) {
    const scrollWidth = Number(await scroll.scrollWidth())
    const size = await scroll.size()
    record(
      '生活点滴图片行可横向滚动',
      Number.isFinite(scrollWidth) && scrollWidth > Number(size.width),
      `${scrollWidth}/${size.width}`,
    )
  }
  await capture(mp, 'photo-row')
}

async function checkNoteRow(mp) {
  await mp.evaluate(() => {
    getCurrentPages().pop().onSelectSection({ currentTarget: { dataset: { value: 'notes' } } })
    return true
  })
  await wait(900)
  const page = await mp.currentPage()
  const note = await page.$('.journal-note-row')
  const row = note ? await note.$('.journal-photo-row') : null
  record('重要记录图片也使用横排行', Boolean(row))
  await mp.evaluate(() => {
    getCurrentPages().pop().onSelectSection({ currentTarget: { dataset: { value: 'moments' } } })
    return true
  })
  await wait(500)
}

async function checkDetail(mp, entries, fieldPresent) {
  const target = entries.find((entry) => (fieldPresent ? entry.authorAvatarUrl : true))
  if (!target) {
    warn('没有可用于详情检查的记录')
    return
  }
  await mp.navigateTo(`/pages/journal-detail/index?id=${encodeURIComponent(target.id)}`)
  await wait(2600)
  const page = await mp.currentPage()
  const data = await page.data()
  const entry = data.entry
  record('详情加载完成', Boolean(entry && entry.id === target.id), page.path)
  if (!entry) return
  record('详情作者有首字回退', Boolean(entry.authorInitial), entry.authorInitial || '')
  if (fieldPresent) {
    record('详情作者头像已解析', Boolean(entry.authorAvatarUrl))
  }
  if (entry.images && entry.images.length) {
    const displayCount = entry.images.filter((image) => /_display\.jpg/.test(image.src || '')).length
    record(
      '详情使用展示图地址',
      displayCount === entry.images.length,
      `${displayCount}/${entry.images.length}`,
    )
  }
  await capture(mp, 'detail')
}

async function checkImageReorder(mp) {
  await mp.reLaunch('/pages/journal-form/index?kind=moment')
  await wait(1800)
  const page = await mp.currentPage()
  await page.setData({
    images: ['drag-1', 'drag-2', 'drag-3'].map((mediaId, index) => ({
      mediaId,
      src: '/images/demo-flowers.jpg',
      thumbSrc: '/images/demo-flowers.jpg',
      caption: index === 0 ? '第一张' : '',
    })),
  })
  await wait(700)
  const tiles = await page.$$('.journal-image-tile--photo')
  record('表单图片节点可长按', tiles.length === 3, `${tiles.length} 张`)
  if (tiles.length === 3) {
    // 优先走真实 longpress 事件；若自动化事件不带 dataset，再退回直接调页面处理函数。
    await tiles[0].trigger('longpress')
    await wait(300)
    let dragIndex = (await page.data()).draggingIndex
    if (dragIndex !== 0) {
      await mp.evaluate(() => {
        getCurrentPages().pop().onStartImageDrag({ currentTarget: { dataset: { index: 0 } } })
        return true
      })
      await wait(500)
      dragIndex = (await page.data()).draggingIndex
    }
    record('长按进入拖动状态', dragIndex === 0, String(dragIndex))
    const target = await mp.evaluate(() => new Promise((resolve) => {
      const query = wx.createSelectorQuery().in(getCurrentPages().pop())
      query.selectAll('.journal-image-tile--photo').boundingClientRect()
      query.exec(([rects]) => {
        const rect = rects && rects[2]
        resolve(rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : null)
      })
    }))
    if (target) {
      await mp.evaluate(({ x, y }) => {
        const current = getCurrentPages().pop()
        current.onGridTouchMove({ touches: [{ clientX: x, clientY: y }] })
        current.onEndImageDrag()
        return true
      }, target)
      await wait(400)
      const order = ((await page.data()).images || []).map((image) => image.mediaId)
      record('长按拖动后顺序更新', order.join(',') === 'drag-2,drag-3,drag-1', order.join(','))
    }
  }
  await capture(mp, 'image-reorder')
}

async function checkImageLimit(mp) {
  await mp.reLaunch('/pages/journal-form/index?kind=moment')
  await wait(1800)
  const page = await mp.currentPage()
  const images = Array.from({ length: 15 }, (_, index) => ({
    mediaId: `agent-media-${index + 1}`,
    src: '/images/demo-flowers.jpg',
    thumbSrc: '/images/demo-flowers.jpg',
    caption: '',
  }))
  await page.setData({ images })
  await wait(900)
  record('十五张图计数为 15', (await page.data()).images.length === 15)
  record('满额后隐藏添加入口', !(await page.$('.journal-image-tile--add')))
  record('满额后显示上限提示', Boolean(await page.$('.journal-image-limit')))
  await capture(mp, '15-images')

  await mp.evaluate(() => { getApp().__agentToast = null })
  await mp.mockWxMethod('showToast', function (options) {
    getApp().__agentToast = options
  })
  try {
    await mp.evaluate(() => { getCurrentPages().pop().onChooseImage(); return true })
    await wait(600)
    const toast = await mp.evaluate(() => getApp().__agentToast)
    record('第 16 张被明确拒绝', Boolean(toast && /15/.test(String(toast.title || ''))), toast && toast.title)
  } finally {
    await mp.restoreWxMethod('showToast').catch(() => undefined)
  }
}

async function main() {
  mkdirSync(SHOTS_DIR, { recursive: true })
  mkdirSync(REPORT_DIR, { recursive: true })

  let mp
  try {
    mp = await automator.connect({ wsEndpoint: WS_ENDPOINT })
  } catch {
    throw new Error(
      `无法连接自动化端口 ${WS_ENDPOINT}。请先执行：\n` +
      `"/Applications/wechatwebdevtools.app/Contents/MacOS/cli" auto --project "${ROOT}" --auto-port 9420 --lang zh`,
    )
  }

  try {
    const { token, session } = await ensureSession(mp)
    console.log(`SESSION ${session.user.nickname} · ${session.activeSpaceId}`)

    const apiList = await fetchJournalApi(token, session.activeSpaceId)
    const { entries } = await checkList(mp)
    const avatar = await checkAvatar(mp, entries, apiList)
    await checkPhotoRow(mp, entries)
    await checkNoteRow(mp)
    await checkDetail(mp, entries, avatar.fieldPresent)
    await checkImageReorder(mp)
    await checkImageLimit(mp)

    report.ok = report.checks.every((check) => check.passed)
    // 自测会临时改表单数据，结束后回到首页，避免影响正在使用模拟器的人。
    await mp.reLaunch('/pages/home/index').catch(() => undefined)
  } finally {
    writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
    console.log(`REPORT ${REPORT_PATH}`)
    await mp.restoreWxMethod('showToast').catch(() => undefined)
    await mp.disconnect().catch(() => undefined)
  }

  if (!report.ok) process.exitCode = 1
}

main().catch((error) => {
  report.error = error instanceof Error ? error.message : String(error)
  mkdirSync(REPORT_DIR, { recursive: true })
  writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`)
  console.error(`FAIL ${report.error}`)
  process.exitCode = 1
})
