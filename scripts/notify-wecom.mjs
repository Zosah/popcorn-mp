#!/usr/bin/env node
/**
 * 企业微信任务提醒。
 *
 * 接口：GET https://api.simiway.cc/wechat/send_wx_msg?content=<URL 编码文本>
 * - 无鉴权；content 必须 URL 编码（这里用 URLSearchParams）。
 * - 内容控制在 500 个中文字以内，避免 URL 过长被 nginx 断开。
 * - 成功判据：HTTP 200 且 JSON code == 0。
 * - 接口不幂等，失败最多重试 2 次。
 *
 * 用法：
 *   npm run notify:wecom -- "任务完成，版本 1.2.3"
 */
import { pathToFileURL } from 'node:url'

const ENDPOINT = 'https://api.simiway.cc/wechat/send_wx_msg'
const MAX_LENGTH = 460
const RETRY_DELAY_MS = 800

function timestamp() {
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date()).replace(/\//g, '-')
}

/** 发送一条企微提醒；返回是否成功，不抛异常，避免阻断发布主流程。 */
export async function notifyWeCom(content) {
  const body = String(content ?? '').trim()
  const text = `[${timestamp()}] ${body}`.slice(0, MAX_LENGTH)
  const url = `${ENDPOINT}?${new URLSearchParams({ content: text }).toString()}`
  let lastError = ''

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) })
      const data = await response.json().catch(() => null)
      if (response.status === 200 && data?.code === 0) {
        return { ok: true, text }
      }
      lastError = `HTTP ${response.status} ${data ? JSON.stringify(data) : ''}`.trim()
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    if (attempt < 2) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS))
    }
  }

  console.warn(`企微提醒发送失败：${lastError}`)
  return { ok: false, text, error: lastError }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const content = process.argv.slice(2).join(' ').trim() || '时刻见任务完成'
  const result = await notifyWeCom(content)
  if (!result.ok) process.exitCode = 1
}
