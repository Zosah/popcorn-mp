#!/usr/bin/env node
/**
 * 前端自动验收与体验版上传统一入口。
 *
 * 能力：
 * 1. 类型检查 + 全量单测，任一失败就不上传；
 * 2. 调用本机微信开发者工具 CLI 上传最新代码（开发版）；
 * 3. 可选生成预览二维码，方便体验成员直接扫码；
 * 4. watch 模式在源码静默后自动重复上述流程。
 *
 * 微信没有公开“设为体验版”的接口，所以脚本只能自动上传为开发版并生成预览码，
 * “选为体验版”仍需在微信公众平台点一次。
 *
 * 用法：
 *   npm run release:experience                 # 验收通过后上传一次
 *   npm run release:experience -- --with-preview
 *   npm run release:watch                      # 监听改动，静默后自动验收并上传
 *   npm run release:preview                    # 只出预览二维码，不上传
 *
 * 可用环境变量：
 *   WECHAT_DEVTOOLS_CLI   开发者工具 CLI 路径
 *   RELEASE_VERSION       覆盖版本号（默认 package.json version）
 *   RELEASE_DESC          覆盖上传描述
 *   RELEASE_DEBOUNCE_MS   watch 静默时间，默认 20000
 */
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  watch,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { notifyWeCom } from './notify-wecom.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEBUG = process.env.RELEASE_DEBUG === '1'
const PREVIEW_DIR = join(ROOT, '.preview')
const STATUS_FILE = join(PREVIEW_DIR, 'release-status.json')
const HISTORY_FILE = join(PREVIEW_DIR, 'release-history.jsonl')
const PNG_PATH = join(PREVIEW_DIR, 'experience-latest.png')

const argv = process.argv.slice(2)
const options = {
  watch: argv.includes('--watch'),
  previewOnly: argv.includes('--preview-only'),
  withPreview: argv.includes('--with-preview') || argv.includes('--preview-only'),
  skipTests: argv.includes('--skip-tests'),
  buildSuffix: argv.includes('--build-suffix') || process.env.RELEASE_BUILD_SUFFIX === '1',
  uiCheck: argv.includes('--ui-check') && process.env.RELEASE_UI_CHECK !== '0',
  runNow: argv.includes('--now') || !argv.includes('--watch'),
  help: argv.includes('--help') || argv.includes('-h'),
}

const CLI_CANDIDATES = [
  process.env.WECHAT_DEVTOOLS_CLI,
  '/Applications/wechatwebdevtools.app/Contents/MacOS/cli',
  '/Applications/wechatwebdevtools.app/Contents/MacOS/cli.js',
].filter(Boolean)

/** 统一的子进程执行器：capture 为 true 时收集输出，否则直接打印到终端。 */
function execute(command, args, { capture = false, timeoutMs = 0 } = {}) {
  return new Promise((done) => {
    let stdout = ''
    let stderr = ''
    let settled = false
    const child = spawn(command, args, {
      cwd: ROOT,
      env: process.env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    })
    const timer = timeoutMs > 0
      ? setTimeout(() => {
          child.kill('SIGTERM')
          finish(124, stdout, `命令超时：${command} ${args.join(' ')}`)
        }, timeoutMs)
      : null

    function finish(code, out, err) {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      done({ code, stdout: out.trim(), stderr: err.trim() })
    }

    if (capture) {
      child.stdout?.on('data', (chunk) => { stdout += chunk })
      child.stderr?.on('data', (chunk) => { stderr += chunk })
    }
    child.on('error', (error) => finish(1, stdout, error.message))
    child.on('close', (code) => finish(code ?? 1, stdout, stderr))
  })
}

/** watch 排障用：只在实际需要时打印触发来源，不污染正常输出。 */
function debugLog(...values) {
  if (DEBUG) console.log('[release:debug]', ...values)
}

function printHelp() {
  console.log(`生活记录改动后的自动验收与上传

  npm run release:experience              类型检查 + 单测通过后上传开发版
  npm run release:experience -- --with-preview   上传后再生成预览二维码
  npm run release:preview                 只生成预览二维码，不上传
  npm run release:watch                   监听改动，静默后自动执行
  npm run release:watch -- --now          启动时先执行一次

可选参数：
  --skip-tests    跳过类型检查与单测（仅排障时使用）
  --build-suffix  在 package.json 版本后追加 .MMDDHHmm 构建号，便于区分多次自动上传
  --ui-check      上传后跑一遍生活记录 UI 自测（需要开发者工具自动化端口 9420）
  --preview-only  只出预览码
  --with-preview  上传后同时出预览码
  --now           watch 模式启动时立即执行一次

环境变量：
  WECHAT_DEVTOOLS_CLI  开发者工具 CLI 路径
  RELEASE_VERSION      覆盖版本号
  RELEASE_DESC         覆盖上传描述`)
}

function locateCli() {
  const cli = CLI_CANDIDATES.find((candidate) => existsSync(candidate))
  if (!cli) {
    throw new Error('找不到微信开发者工具 CLI。请设置 WECHAT_DEVTOOLS_CLI，或在开发者工具里开启“服务端口”。')
  }
  return cli
}

async function ensureLoggedIn(cli) {
  const result = await execute(cli, ['islogin', '--lang', 'zh'], {
    capture: true,
    timeoutMs: 60000,
  })
  const output = `${result.stdout}\n${result.stderr}`
  if (result.code !== 0 || !/"login"\s*:\s*true/.test(output)) {
    throw new Error('开发者工具未登录，请先打开微信开发者工具并用管理员微信扫码登录。')
  }
}

function readPackage() {
  return JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
}

async function gitValue(args) {
  const result = await execute('git', args, { capture: true })
  return result.code === 0 ? result.stdout : ''
}

async function workspaceInfo() {
  const commit = (await gitValue(['rev-parse', '--short', 'HEAD'])) || 'nogit'
  const status = await gitValue(['status', '--porcelain=v1', '--untracked-files=all'])
  const dirtyFiles = status.split('\n').filter(Boolean)
  // 用 HEAD 对比同时覆盖已暂存和未暂存改动，避免 git add 后签名回退。
  const diff = await gitValue(['diff', 'HEAD', '--binary', '--no-color'])
  const hash = createHash('sha256')
  hash.update(status)
  hash.update(diff)
  // 未跟踪文件的内容也要进入签名，否则新建测试文件的改动会被 watch 模式当成无变化。
  for (const line of dirtyFiles) {
    if (!line.startsWith('?? ')) continue
    const file = join(ROOT, line.slice(3).trim())
    try {
      hash.update(readFileSync(file))
    } catch {
      // 目录或临时文件读不到就跳过，不影响签名主流程。
    }
  }
  return {
    commit,
    dirtyFiles: dirtyFiles.length,
    signature: hash.digest('hex'),
  }
}

function buildMetadata(pkg, workspace) {
  let version = (process.env.RELEASE_VERSION || '').trim() || pkg.version
  if (options.buildSuffix && !process.env.RELEASE_VERSION) {
    // 微信允许四段版本号；追加构建号后，多次自动上传在公众平台可以区分。
    const build = new Intl.DateTimeFormat('zh-CN', {
      timeZone: 'Asia/Shanghai',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date()).replace(/\D/g, '')
    version = `${version}.${build}`
  }
  const stamp = new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date())
  const defaultDesc = `${workspace.commit}${workspace.dirtyFiles ? ` +${workspace.dirtyFiles}个改动` : ''} ${stamp} 时刻见日常体验`
  const desc = ((process.env.RELEASE_DESC || '').trim() || defaultDesc).slice(0, 100)
  return { version, desc }
}

async function runGate() {
  const steps = [
    ['类型检查', 'npm', ['run', 'typecheck']],
    ['单元测试', 'npm', ['test']],
  ]
  for (const [label, command, args] of steps) {
    console.log(`\n▶ ${label}`)
    const result = await execute(command, args)
    if (result.code !== 0) {
      throw new Error(`${label}未通过，已停止上传（退出码 ${result.code}）`)
    }
    console.log(`✔ ${label}通过`)
  }
}

async function upload(cli, version, desc) {
  console.log(`\n▶ 上传开发版 ${version}`)
  const result = await execute(cli, [
    'upload',
    '--project', ROOT,
    '--version', version,
    '--desc', desc,
    '--lang', 'zh',
  ], { timeoutMs: 5 * 60 * 1000 })
  if (result.code !== 0) {
    throw new Error(`上传失败（退出码 ${result.code}），请查看上方开发者工具输出`)
  }
  console.log('✔ 已上传为开发版')
}

async function preview(cli) {
  mkdirSync(PREVIEW_DIR, { recursive: true })
  console.log('\n▶ 生成预览二维码')
  const result = await execute(cli, [
    'preview',
    '--project', ROOT,
    '--qr-format', 'image',
    '--qr-output', PNG_PATH,
    '--lang', 'zh',
  ], { timeoutMs: 5 * 60 * 1000 })
  if (result.code !== 0) {
    throw new Error(`预览二维码生成失败（退出码 ${result.code}）`)
  }
  console.log(`✔ 预览二维码：${PNG_PATH}`)
  return PNG_PATH
}

async function runUiCheck() {
  console.log('\n▶ 生活记录 UI 自测')
  const result = await execute('npm', ['run', 'verify:journal-ui:agent'], {
    timeoutMs: 3 * 60 * 1000,
  })
  if (result.code !== 0) {
    console.warn('⚠ UI 自测未通过，详见 .preview/journal-ui-report.json')
    return 'failed'
  }
  console.log('✔ UI 自测通过')
  return 'passed'
}

function persist(record) {
  mkdirSync(PREVIEW_DIR, { recursive: true })
  writeFileSync(STATUS_FILE, `${JSON.stringify(record, null, 2)}\n`)
  appendFileSync(HISTORY_FILE, `${JSON.stringify(record)}\n`)
}

async function releaseOnce(reason) {
  const startedAt = Date.now()
  const pkg = readPackage()
  const workspace = await workspaceInfo()
  const { version, desc } = buildMetadata(pkg, workspace)
  const record = {
    reason,
    startedAt: new Date(startedAt).toISOString(),
    version,
    desc,
    commit: workspace.commit,
    dirtyFiles: workspace.dirtyFiles,
    signature: workspace.signature,
    tests: options.skipTests ? 'skipped' : 'pending',
    upload: options.previewOnly ? 'skipped' : 'pending',
    preview: '',
    uiCheck: options.uiCheck ? 'pending' : 'skipped',
    wecom: options.previewOnly ? 'skipped' : 'pending',
    ok: false,
    durationMs: 0,
  }

  console.log(`\n=== 发布检查 ${new Date(startedAt).toLocaleString('zh-CN')} ===`)
  console.log(`版本 ${version} · ${desc}`)

  try {
    const cli = locateCli()
    await ensureLoggedIn(cli)

    if (!options.skipTests) {
      await runGate()
      record.tests = 'passed'
    }

    if (!options.previewOnly) {
      await upload(cli, version, desc)
      record.upload = 'uploaded'
    }

    // UI 自测要连接正在运行的模拟器；先生成预览码会弹出二维码窗口，容易让自测拿不到页面。
    if (options.uiCheck) {
      record.uiCheck = await runUiCheck()
    }

    if (options.withPreview) {
      record.preview = await preview(cli)
    }

    if (!options.previewOnly) {
      const notice = await notifyWeCom(
        `时刻见 ${version} 已上传。${desc}。测试 ${record.tests}，UI ${record.uiCheck}。预览码 .preview/experience-latest.png`,
      )
      record.wecom = notice.ok ? 'sent' : 'failed'
    }

    record.ok = true
    console.log('\n✔ 本轮完成')
    if (!options.previewOnly) {
      console.log('ℹ 下一步：微信公众平台 → 版本管理 → 开发版本 → 选为体验版（微信未提供该步公开接口）')
    }
  } catch (error) {
    console.error(`\n✖ ${error instanceof Error ? error.message : String(error)}`)
    record.error = error instanceof Error ? error.message : String(error)
    throw error
  } finally {
    record.durationMs = Date.now() - startedAt
    persist(record)
  }
}

async function main() {
  if (options.help) {
    printHelp()
    return
  }

  if (!options.watch) {
    await releaseOnce('manual')
    return
  }

  const debounceMs = Math.max(3000, Number(process.env.RELEASE_DEBOUNCE_MS ?? 20000))
  const targets = ['src', 'scripts', 'tests']
    .map((target) => join(ROOT, target))
    .filter((target) => existsSync(target))

  let timer = null
  let running = false
  let queued = false
  let lastSignature = ''

  const schedule = (reason) => {
    debugLog('schedule', reason, { running, queued, hasTimer: Boolean(timer) })
    if (running) {
      queued = true
      return
    }
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      void runSafely(reason)
    }, debounceMs)
  }

  async function runSafely(reason) {
    debugLog('run', reason, { running, queued })
    if (running) {
      queued = true
      return
    }
    running = true
    try {
      const workspace = await workspaceInfo()
      if (workspace.signature === lastSignature) {
        console.log(`\n· 跳过：工作区内容自上次发布后没有变化（${reason}）`)
        return
      }
      lastSignature = workspace.signature
      await releaseOnce(reason)
    } catch {
      // releaseOnce 已经打印原因；保留 watch 进程等待下一次改动。
    } finally {
      running = false
      if (queued) {
        queued = false
        schedule('运行期间的改动')
      }
    }
  }

  console.log(`watch 已启动，静默 ${Math.round(debounceMs / 1000)} 秒后自动验收并上传。按 Ctrl+C 停止。`)
  // 以启动时的工作区内容作为基线：只改 mtime、没有真实内容变化时不重复上传。
  if (!options.runNow) {
    lastSignature = (await workspaceInfo()).signature
  }
  for (const target of targets) {
    const listener = (eventType, filename) => {
      const name = String(filename ?? '')
      debugLog('fs', target, eventType, name)
      if (!name || name.includes('node_modules') || name.endsWith('.log')) return
      schedule(`${eventType} ${name}`)
    }
    watch(target, { recursive: true }, listener)
  }
  // macOS 对单个文件 watch 会反复触发 change，改成只监听根目录下的 package.json。
  watch(ROOT, (eventType, filename) => {
    if (String(filename ?? '') !== 'package.json') return
    schedule(`${eventType} package.json`)
  })

  if (options.runNow) void runSafely('watch-start')
}

main().catch(() => {
  process.exitCode = 1
})
