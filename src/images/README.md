# 图片资源目录

设计资源统一放这里，避免散落在页面目录中。Demo 的叙事图片和小幅插画均为公版艺术示例，授权与作品来源统一记录在 `assets/credits.json`。

## 当前资源

| 文件 | 页面与用途 | 处理 |
| --- | --- | --- |
| `demo-flowers.jpg` | 生活记录正文图片排版 | 裁切压缩 |
| `demo-menu-still-life.jpg` | 菜单版式示例 | 裁切压缩 |
| `avatars/avatar-*.svg` | 空间成员插画头像源文件 | 参考手账原型头像风格绘制 |
| `avatars/avatar-*.png` | 空间成员插画头像 | SVG 192 × 192 导出 |
| `ink-cat.png` | 宠物月历空日提示 | 去底、统一深赭色 |
| `ink-letter.png` | 邀请页手札小景 | 提取墨迹、统一深赭色 |
| `icons/*.png` | 全局功能、底栏与业务图标 | 由 `assets/shikejian-icons/` 渲染，详见 `icons/README.md` |

## 约定

- 叙事图片每页最多一处；小幅插画只服务空态、邀请和身份语境，不做满屏装饰。
- 不把公版艺术示例伪装成用户照片，涉及宠物或生活记录时要就近标注。
- 用户上传内容未来走 COS 私有前缀，不进入小程序包。
- 功能图标统一通过 `line-icon` 组件调用；图标母版放在 `assets/shikejian-icons/`，页面只使用构建后的 PNG。
