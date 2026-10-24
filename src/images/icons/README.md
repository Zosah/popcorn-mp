# 小程序线性图标

图标来自 [Lucide Static 0.468.0](https://lucide.dev/)，许可证为 ISC。原始 SVG 存放在仓库根目录的 `assets/lucide-icons/`，小程序包内只保留渲染后的 PNG。

## 生成

```bash
npm run icons:build
```

脚本会读取 `assets/lucide-icons/*.svg`，输出 96 × 96 RGBA PNG 到当前目录。新增图标时，把同版本 SVG 放进源目录后再执行生成命令，不要手工改 PNG。

## 色调

| 后缀 | 色值 | 用途 |
| --- | --- | --- |
| `muted` | `#5f605a` | 常规辅助、列表与表单 |
| `ink` | `#1b1b18` | 选中态、正文操作 |
| `accent` | `#743e37` | 需要提示的内容锚点 |
| `white` | `#ffffff` | 深色按钮与反白场景 |

## 使用原则

- 图标只辅助识别，不替代文字，也不单独承担关键操作。
- 图标保持细线、同一视觉重量，常规尺寸 22–32rpx。
- 不做图标墙；同一区域通常只放 1–3 个，避免装饰性堆叠。
- 页面通过 `line-icon` 组件使用：`<line-icon name="package" size="32" tone="accent" />`。
