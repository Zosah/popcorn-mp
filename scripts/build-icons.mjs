// 将 assets/lucide-icons 中的线性图标批量渲染为小程序可直接使用的 PNG。
// 用法：npm run icons:build
import { mkdir, readFile, readdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourceDir = path.join(root, 'assets/lucide-icons')
const outputDir = path.join(root, 'src/images/icons')
const tones = {
  faint: '#c6c9d6',
  muted: '#9497a6',
  ink: '#22242e',
  accent: '#5b6ee0',
  danger: '#e8695c',
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
