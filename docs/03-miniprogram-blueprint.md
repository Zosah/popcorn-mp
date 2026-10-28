# 小程序前端蓝图

## 1. 技术选择

前端采用微信原生小程序与 TypeScript，不采用 uni-app。

这是一个以微信为首发平台、包含日期、图片、订阅消息、分享、权限和高频表单操作的产品。原生小程序能提供更好的平台适配、问题定位和交互控制。未来若出现明确的 App 或 Web 需求，应复用后端 API 和领域模型，而非为了未知的多端需求提前牺牲小程序体验。

## 2. Demo 信息架构与第一阶段边界

为了在后端完成前看清完整产品，Demo 采用四个底部 Tab：

```text
家                  库存                 记录                 我的
|- 今日概览         |- 到期摘要           |- 生活点滴           |- 当前空间
|- 库存提醒         |- 搜索与筛选         |- 重要记录           |- 成员与邀请
|- 菜单预览         |- 库存列表           `- 隐私可见性         |- 个人身份
|- 宠物预览         `- 添加物品                                `- Demo 工具
`- 最近记录
```

“家”是产品首页，用于表达共同生活空间的完整方向。当前账号、空间、库存、待办与生活记录已经接入真实服务端；菜单、宠物与提醒继续使用本地数据验证产品形态，不能让用户误以为已经具备跨设备同步能力。

库存页首屏仍优先回答三个问题：已经过期什么、最近几天会过期什么、库存里还有什么。

## 3. 页面清单

| 页面 | 路径建议 | 责任 | 第一阶段 |
| --- | --- | --- | --- |
| 家 | `pages/home/index` | 今日概览与长期产品模块预览 | 静态 Demo |
| 库存首页 | `pages/inventory/index` | 到期摘要、搜索、筛选、物品列表 | 是 |
| 生活记录 | `pages/journal/index` | 点滴、重要记录预览、公开/私密筛选 | HTTP / Demo 双模式 |
| 记录表单 | `pages/journal-form/index` | 新增生活记录、可见范围与版本冲突恢复 | HTTP / Demo 双模式 |
| 物品表单 | `pages/item-form/index` | 新建与编辑库存物品 | 是 |
| 物品详情 | `pages/item-detail/index` | 查看、变更数量、状态操作、删除 | 是 |
| 我的 | `pages/profile/index` | 用户资料、空间入口 | 是 |
| 空间管理 | `pages/space/index` | 空间资料、成员、邀请 | 是 |
| 邀请加入 | `pages/invite/index` | 校验邀请码或邀请链接 | 是 |
| 提醒设置 | `pages/reminder-settings/index` | 本地提醒偏好预览 | 交互 Demo |
| 宠物档案 | `pages/pets/index` | 多宠物切换、基础档案、事件时间线、周期照护、体重、每日吃喝拉撒与用品集合 | 本地交互 Demo；真实能力第二阶段 |
| 宠物事件表单 | `pages/pet-event-form/index` | 新增或编辑疫苗、洗护、就诊、外出、驱虫等事件及机构、费用和下次计划 | 本地交互 Demo；真实能力第二阶段 |
| 宠物事件详情 | `pages/pet-event-detail/index` | 查看事件完整信息，进入编辑或删除记录 | 本地交互 Demo；真实能力第二阶段 |
| 宠物月历 | `pages/pet-calendar/index` | 按月查看历史事件、计划事件和周期照护日期 | 本地交互 Demo；真实能力第二阶段 |
| 健康记录 | `pages/health/index` | 个人健康与身材记录 | 第二阶段 |
| 今日菜单 | `pages/menu/index` | 食材准备与烹饪步骤预览 | 交互 Demo；真实能力第三阶段 |
| 点滴 | `pages/moments/index` | 动态流与互动 | 第三阶段 |
| 重要记录 | `pages/notes/index` | 标签组和图文记录 | 第三阶段 |

## 4. 库存首页设计

首页不做营销式大卡片，保持高信息密度和连续浏览体验。

```text
[ 当前空间：我们家 v ]                         [ 搜索 ]

[ 2 已过期 ] [ 3 三天内 ] [ 8 正常 ] [ 全部 ]

已过期
  牛奶               已过期 1 天       冰箱冷藏       [...]

即将到期
  鸡蛋               还剩 2 天         冰箱冷藏       [...]
  酸奶               还剩 3 天         冰箱冷藏       [...]

正常
  洗衣凝珠           还剩 86 天        卫生间         [...]

                                                       [ + ]
```

状态颜色只用于辅助扫描，不能替代文字：

| 状态 | 色彩建议 | 必须显示的文本 |
| --- | --- | --- |
| 已过期 | 红色 | 已过期 N 天 |
| 今日到期 / 紧急 | 橙色 | 今日到期 / 还剩 N 天 |
| 即将到期 | 黄色或琥珀色 | 还剩 N 天 |
| 正常 | 绿色 | 还剩 N 天 |
| 无有效期 | 灰色 | 未设置有效期 |

## 5. 物品表单

字段按“必填、常用、可选”分层，避免一次性压入过多内容。

### 必填

- 名称

### 常用

- 分类：食品、饮料、冷冻、调料、日用品、药品、宠物用品、其他。
- 数量和单位。
- 存放位置：冰箱冷藏、冰箱冷冻、厨房、客厅、卫生间、储物间、其他。
- 有效期日期，或“暂无有效期”开关。

### 可选

- 购买日期。
- 开封日期。
- 图片。
- 备注。

保存前客户端做基础校验；服务端必须重复校验名称长度、日期格式、数量范围、媒体归属和空间权限。

## 6. 组件与目录边界

```text
src/
  app.ts
  app.json
  app.wxss

  pages/
    inventory/
    item-form/
    item-detail/
    profile/
    space/
    invite/

  components/
    inventory-card/
    expiry-badge/
    filter-sheet/
    quantity-stepper/
    space-switcher/
    empty-state/
    error-state/

  services/
    http.ts
    auth.ts
    spaces.ts
    inventory.ts
    media.ts

  stores/
    session.ts

  constants/
    inventory.ts
    locations.ts

  utils/
    date.ts
    format.ts
    validation.ts

  types/
    api.ts
    domain.ts
```

组件只负责展示和局部交互。页面负责加载与编排；`services/` 负责 API 调用；`utils/` 负责纯函数；`stores/session.ts` 只保存会话、用户、当前空间和当前角色。

不要引入复杂的全局状态框架。库存列表由页面管理并刷新；表单成功后返回详情或列表页，通过页面生命周期重新获取数据。只有跨页面且稳定的会话状态需要全局保存。

## 7. 会话与请求封装

客户端身份不能来自本地写入的 `userId` 或 `openId`。`services/auth.ts` 只处理微信授权码与服务端会话：

```text
启动小程序
  -> 读取本地 session token
  -> 请求当前会话
  -> 无效时调用 wx.login()
  -> POST /v1/auth/wechat
  -> 保存新的 session token 和 session snapshot
```

`services/http.ts` 统一负责：

- 基础 API 地址。
- `Authorization` 请求头。
- 请求超时与网络错误规范化。
- 收到 401 后只重试一次登录流程，避免死循环。
- 透传 `Idempotency-Key` 给创建和状态变更接口。
- 统一解析服务端错误码，不在页面内散落 `wx.request`。

`activeSpaceId` 可以缓存以改善体验，但只作为请求上下文。服务端必须验证该用户是空间成员；前端不得把本地缓存当作权限依据。

## 8. 第一阶段接口契约

接口字段的最终定义以服务端 OpenAPI 文档为准；以下为前端需要的最小能力。

```text
POST /v1/auth/wechat
GET  /v1/session
GET  /v1/spaces
POST /v1/spaces
POST /v1/spaces/{spaceId}/invites
POST /v1/invites/{code}/accept

GET  /v1/inventory/items
POST /v1/inventory/items
GET  /v1/inventory/items/{itemId}
PATCH /v1/inventory/items/{itemId}
POST /v1/inventory/items/{itemId}/consume
POST /v1/inventory/items/{itemId}/discard
POST /v1/inventory/items/{itemId}/archive
DELETE /v1/inventory/items/{itemId}

POST /v1/media/upload-intents
POST /v1/media/assets/{assetId}/complete
GET  /v1/media/assets/{assetId}/access-url
```

`GET /v1/inventory/items` 支持如下查询参数：

```text
spaceId
status=active
expiry=expired|today|urgent|soon|normal|none
category
location
query
cursor
limit
```

列表使用游标分页，并由后端稳定排序。首页可使用 `expiry` 分组展示，但不应该为了显示分组而下载全量历史数据。

## 9. 图片上传

图片不是库存第一阶段的硬依赖，但数据和组件边界应从一开始支持它。上传顺序：

```text
表单选择图片
  -> 请求上传意图
  -> 直传 COS
  -> 通知服务端上传完成
  -> 得到 assetId
  -> 保存物品时提交 assetId 列表
```

页面只能持有 `assetId` 和短期展示 URL，不能自行拼接永久 COS URL。对失败、取消、未关联的上传资源需要定义清理策略，避免产生大量孤儿文件。

## 10. 第一阶段实施顺序

1. 创建 TypeScript 小程序基础壳、路由、主题和错误页。
2. 实现会话初始化、请求封装、空间切换的最小状态。
3. 实现库存首页的空态、加载态、错误态和列表样式。
4. 实现新增、编辑、详情、状态变更和删除。
5. 实现到期分组、搜索和筛选。
6. 接入空间成员与邀请。
7. 最后接入图片上传与物品照片。

每一步应先与 Go 服务 OpenAPI 契约对齐。小程序包由微信工具链构建和上传，不通过传统的 CDN 部署。
