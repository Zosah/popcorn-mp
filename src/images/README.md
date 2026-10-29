# 图片资源目录

设计资源统一放这里，避免散落在页面目录中。Demo 的叙事图片和小幅插画均为公版艺术示例，授权与作品来源统一记录在 `assets/credits.json`。

## 当前资源

| 文件 | 页面与用途 | 处理 |
| --- | --- | --- |
| `home-still-life.jpg` | 首页生活记录影像锚点 | 裁切压缩 |
| `demo-flowers.jpg` | 生活记录正文图片排版 | 裁切压缩 |
| `demo-cat-dreaming.jpg` | 宠物页陪伴叙事 | 裁切压缩 |
| `demo-menu-still-life.jpg` | 菜单版式示例 | 裁切压缩 |
| `demo-botanical.jpg` | 我的页植物版画小景 | 裁切压缩 |
| `home-cat-box.svg` | 首页「黑猫与纸箱」插画源文件 | 参考 HTML 原型 SVG 提取 |
| `home-cat-box.png` | 首页「黑猫与纸箱」插画 | SVG 600 × 600 透明底导出 |
| `avatars/avatar-*.svg` | 空间成员插画头像源文件 | 参考手账原型头像风格绘制 |
| `avatars/avatar-*.png` | 空间成员插画头像 | SVG 192 × 192 导出 |
| `ink-cat.png` | 宠物月历空日提示 | 去底、统一深赭色 |
| `ink-pantry.png` | 库存空结果提示 | 去底、统一深赭色 |
| `ink-letter.png` | 邀请页手札小景 | 提取墨迹、统一深赭色 |
| `icons/*.png` | 全局细线功能图标 | Lucide Static 0.468.0 渲染，详见 `icons/README.md` |

## 约定

- 叙事图片每页最多一处；小幅插画只服务空态、邀请和身份语境，不做满屏装饰。
- 不把公版艺术示例伪装成用户照片，涉及宠物或生活记录时要就近标注。
- 用户上传内容未来走 COS 私有前缀，不进入小程序包。
- 功能图标统一通过 `line-icon` 组件调用；正式 Logo 与品牌头像仍待设计资源到位后替换。
