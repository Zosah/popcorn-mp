// 将 assets/shikejian-icons 中的设计母版渲染为小程序可直接使用的 PNG。
// 单态图标按语义色生成，宠物二级图标额外保留真双色相版本，nav/feature 双态图标保留 active/inactive。
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

const palettes = {
  coral: { primary: '#b65c50', fill: '#f8d9ca', accent: '#dfa338' },
  blue: { primary: '#4b7ba6', fill: '#d7ebf8', accent: '#df8758' },
  teal: { primary: '#2f8580', fill: '#d5f0eb', accent: '#dfb03b' },
  rose: { primary: '#a75d79', fill: '#f6dce7', accent: '#d69a3d' },
  green: { primary: '#4e845f', fill: '#dcefde', accent: '#d97646' },
  gold: { primary: '#92712e', fill: '#f7e5a8', accent: '#418a7a' },
  purple: { primary: '#765b99', fill: '#eadff4', accent: '#d67691' },
}

// 宠物图标不再用单一语义色硬套。彩色来自图标内部的线条、局部填充和第二色相，
// 不添加圆形底板、外框、渐变或阴影。fill 指定可安全填充的闭合元素，accent 指定局部强调元素。
const petColorIconSpecs = {
  'pet-action-calendar': { palette: 'blue', fill: [0], accent: [1, 3, 4, 5, 6] },
  'pet-care-birthday': { palette: 'rose', fill: [0], accent: [1, 3] },
  'pet-care-external-deworm': { palette: 'blue', fill: [0, 4], accent: [2, 3, 4] },
  'pet-care-grooming': { palette: 'blue', fill: [1], accent: [3, 4] },
  'pet-care-homecoming': { palette: 'green', fill: [1], accent: [5] },
  'pet-care-illness': { palette: 'coral', fill: [0], accent: [2] },
  'pet-care-internal-deworm': { palette: 'green', fill: [0], accent: [2, 3] },
  'pet-care-neuter': { palette: 'rose', fill: [0], accent: [2] },
  'pet-care-outing': { palette: 'green', fill: [1], accent: [3, 4] },
  'pet-care-vaccine': { palette: 'blue', fill: [4], accent: [0, 1, 2, 3, 4] },
  'pet-care-visit': { palette: 'teal', fill: [4], accent: [5] },
  'pet-daily-litter-change': { palette: 'gold', fill: [0], accent: [2, 3] },
  'pet-daily-meal': { palette: 'gold', fill: [0, 2, 3, 4], accent: [2, 3, 4] },
  'pet-daily-record': { palette: 'purple', fill: [0], accent: [1, 2, 3] },
  'pet-daily-stool': { palette: 'coral', fill: [0] },
  'pet-daily-urine': { palette: 'blue', fill: [0, 1], accent: [1] },
  'pet-daily-water-change': { palette: 'blue', fill: [0], accent: [2, 3] },
  'pet-daily-water': { palette: 'blue', fill: [0], accent: [1] },
  'pet-metric-weight': { palette: 'purple', fill: [0], accent: [2, 3] },
  'pet-supply-can': { palette: 'coral', fill: [0, 3], accent: [2, 3, 4] },
  'pet-supply-custom': { palette: 'purple', fill: [0], accent: [1] },
  'pet-supply-freeze-dried': { palette: 'teal', fill: [0], accent: [1, 2, 3, 4] },
  'pet-supply-kibble': { palette: 'gold', fill: [0, 2, 3, 4], accent: [2, 3, 4] },
  'pet-supply-litter': { palette: 'teal', fill: [0, 2], accent: [2, 3] },
  'pet-supply-soup': { palette: 'gold', fill: [0], accent: [2, 3] },
  'pet-tab-care': { palette: 'rose', fill: [0], accent: [1] },
  'pet-tab-daily': { palette: 'coral', fill: [0, 3], accent: [1, 2, 4] },
  'pet-tab-profile': { palette: 'blue', fill: [0], accent: [2, 3] },
  'pet-tab-supplies': { palette: 'teal', fill: [0, 2, 3, 4], accent: [1] },
}

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
let colorCount = 0

function buildPetColorSvg(source, spec) {
  const palette = palettes[spec.palette]
  const groupPattern = /(<g fill="none" stroke="currentColor"[^>]*>)([\s\S]*?)(<\/g>)/
  const match = source.match(groupPattern)
  if (!palette || !match) return null

  let elementIndex = 0
  const body = match[2].replace(/<(path|circle|rect)\b([^>]*?)\/>/g, (element, tag, attrs) => {
    const index = elementIndex++
    const fill = spec.fill?.includes(index) ? ` fill="${palette.fill}"` : ''
    const stroke = spec.accent?.includes(index)
      ? ` stroke="${palette.accent}"`
      : ` stroke="${palette.primary}"`
    return `<${tag}${attrs}${fill}${stroke} />`
  })

  return source.replace(match[0], `<g fill="none">${body}</g>`).replaceAll('currentColor', palette.primary)
}

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
  const colorSpec = petColorIconSpecs[name]
  if (colorSpec) {
    const svg = buildPetColorSvg(source, colorSpec)
    if (!svg) throw new Error(`彩色宠物图标生成失败：${name}`)
    colorCount += 1
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
      .toFile(path.join(outputDir, `${name}-color.png`))
  }

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
  `built ${singleCount} single-state icons × ${Object.keys(tones).length} tones + ${colorCount} multicolor pet icons + ${stateCount} state assets → src/images/icons`,
)
