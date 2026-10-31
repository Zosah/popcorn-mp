// 将 assets/lucide-icons 中的线性图标批量渲染为小程序可直接使用的 PNG。
// 用法：npm run icons:build
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(root, 'assets/lucide-icons')
const outputDir = path.join(root, 'src/images/icons')
// v8 墨绿单色：主色系全部收在同一个色相，领域色只压到低饱和的底色调。
// 改动这里必须重跑 npm run icons:build，否则图标 PNG 不会更新。
const tones = {
  faint: '#6b736d',
  muted: '#5b665d',
  ink: '#232a24',
  accent: '#3d5c4a',
  danger: '#a8564e',
  white: '#ffffff',
  blue: '#587a62',
  green: '#4a7358',
  gold: '#8a6a1f',
  orange: '#9a7250',
  pink: '#a8564e',
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

for (const sourceFile of sourceFiles) {
  const name = path.basename(sourceFile, '.svg')
  const source = await readFile(path.join(sourceDir, sourceFile), 'utf8')

  for (const [tone, color] of Object.entries(tones)) {
    const svg = source.replaceAll('currentColor', color)
    await sharp(Buffer.from(svg))
      .resize(96, 96, {
        fit: 'contain',
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toFile(path.join(outputDir, `${name}-${tone}.png`))
  }
}

console.log(
  `built ${sourceFiles.length} icons × ${Object.keys(tones).length} tones → src/images/icons`,
)
