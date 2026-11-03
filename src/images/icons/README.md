# 时刻见小程序图标

图标母版存放在仓库根目录的 `assets/shikejian-icons/`，小程序包内只发布构建后的 PNG。

## 生成

```bash
npm run icons:build
```

脚本会读取全部 SVG 母版，输出 96 × 96 透明 PNG 到当前目录。新增或调整图标时，只修改 SVG 母版并重新生成，不手工编辑 PNG。

## 两类资源

- **单态图标**：读取 SVG 中的 `currentColor`，按 `muted / ink / accent / green / gold / danger / white` 七种语义色生成。
- **双态图标**：底部导航和一级功能使用 `*-active.svg`、`*-inactive.svg` 独立母版，保留设计稿的局部填充和选中层级。

## 使用原则

- 页面统一通过 `line-icon` 组件调用：`<line-icon name="feature-inventory" size="28" tone="green" />`。
- 双态场景传入语义名称和 `active`：`<line-icon name="nav-home" active="{{selected}}" />`。
- 不在深色按钮上直接复用双态底栏图标；账号、登录等场景使用 `system-user` 等单态图标。
- 图标不替代文字，也不单独承担关键操作；常规显示尺寸为 22–32rpx。
