// 将 assets/shikejian-icons 中的设计母版渲染为小程序可直接使用的 PNG。
// 单态图标按语义色生成，nav/feature 双态图标保留设计稿的 active/inactive 两个版本。
// 用法：npm run icons:build
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(root, 'assets/shikejian-icons')
const outputDir = path.join(root, 'src/images/icons')

// 输出色板保持克制，组件会把 blue/green/faint 等历史语义归一到这些实际颜色。
const dualStateBases = new Set([
  'nav-home',
  'nav-profile',
  'feature-inventory',
  'feature-expense',
  'feature-menu',
  'feature-travel',
  'feature-fitness',
  'feature-journal',
  'feature-todo',
  'feature-pets',
])

const tones = {
  muted: '#68706a',
  ink: '#232a24',
  accent: '#3d5c4a',
  green: '#4a7358',
  gold: '#8a6a1f',
  danger: '#a8564e',
  white: '#ffffff',
}

await mkdir(outputDir, { recursive: true })
const existing = await readdir(outputDir)
await Promise.all(
  existing
    .filter((file) => file.endsWith('.png'))
    .map((file) => rm(path.join(outputDir, file))),
)

const sourceFiles = (await readdir(sourceDir))
  .filter((file) => file.endsWith('.svg'))
  .sort()

let singleCount = 0
let stateCount = 0

for (const sourceFile of sourceFiles) {
  const name = path.basename(sourceFile, '.svg')
  const source = await readFile(path.join(sourceDir, sourceFile), 'utf8')
  const stateMatch = name.match(/^(.*)-(active|inactive)$/)
  const isStateIcon = Boolean(stateMatch && dualStateBases.has(stateMatch[1]))

  if (isStateIcon) {
    stateCount += 1
    await sharp(Buffer.from(source))
      .resize(96, 96, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({
        palette: true,
        quality: 92,
        compressionLevel: 9,
        effort: 10,
      })
      .toFile(path.join(outputDir, `${name}.png`))
    continue
  }

  singleCount += 1
  for (const [tone, color] of Object.entries(tones)) {
    const svg = source.replaceAll('currentColor', color)
    await sharp(Buffer.from(svg))
      .resize(96, 96, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png({
        palette: true,
        quality: 92,
        compressionLevel: 9,
        effort: 10,
      })
      .toFile(path.join(outputDir, `${name}-${tone}.png`))
  }
}

console.log(
  `built ${singleCount} single-state icons × ${Object.keys(tones).length} tones + ${stateCount} state assets → src/images/icons`,
)
