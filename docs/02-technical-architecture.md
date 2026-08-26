# 技术架构

## 1. 已确认的技术方向

| 层级 | 决策 |
| --- | --- |
| 小程序前端 | 微信原生小程序，TypeScript、WXML、WXSS |
| 后端 | 独立 Go 服务 |
| 云资源 | 腾讯云服务器、腾讯云 COS，后续按需新建桶 |
| 源代码与自动化 | GitHub、GitHub Actions |
| 部署形态 | Docker 容器；初期使用单机 Docker Compose |

旧版微信云函数不再作为后端实现方案。本项目只保留小程序客户端；建议由独立的 `popcorn-server` 仓库维护 API、迁移和部署配置。

## 2. 架构原则

1. 从单一 Go 服务开始，按领域拆分包，不预先拆分微服务。
2. 所有业务数据都必须在服务端按空间成员关系鉴权。
3. 客户端不直接读写数据库，也不直接信任客户端提交的用户身份。
4. 私有图片和附件不提供永久公开链接。
5. API 以业务动作建模，不提供泛化的“增删改查”接口。
6. 健康、宠物诊疗和悄悄话等敏感内容默认最小可见范围。

## 3. 系统概览

```text
微信原生小程序
  |
  | HTTPS JSON API
  v
api.popcorn.example.com
  |
  v
Caddy 或 Nginx
  |
  +-- Go API 容器
  |     |- auth
  |     |- spaces
  |     |- inventory
  |     |- pets
  |     |- health
  |     |- kitchen
  |     |- moments
  |     |- notes
  |     |- media
  |     |- notifications
  |     |- ai
  |     `- entitlements
  |
  `-- Go Worker 容器（后期启用）
        |- 定时提醒
        |- 媒体处理
        `- AI 异步任务

Go API / Worker
  |- PostgreSQL：主业务数据
  |- COS 私有桶：用户媒体和附件
  |- COS 公共桶 + CDN：公共素材
  `- Redis：后期任务、缓存、限流
```

## 4. 后端推荐栈

```text
Go 1.24+
chi                 HTTP 路由与中间件
pgx + sqlc          PostgreSQL 数据访问
goose 或 Atlas      数据库迁移
OpenAPI 3.x         API 契约和接口文档
Docker              容器镜像
Docker Compose      本地开发与初期生产编排
```

PostgreSQL 优先于 MySQL。它适合空间成员关系、标签、筛选、时间范围查询、统计和逐步扩展的 JSON 字段。第一阶段无需 Redis、消息队列或 Kubernetes；当定时提醒、AI 异步工作和多实例部署产生实际需求后再增加。

## 5. 数据模型

### 5.1 核心表

| 表 | 责任 | 关键字段 |
| --- | --- | --- |
| `users` | 微信用户 | `id`、`wechat_openid`、`nickname`、`avatar_url`、`created_at` |
| `spaces` | 家庭或小圈子 | `id`、`name`、`type`、`owner_id`、`timezone` |
| `space_members` | 成员与角色 | `space_id`、`user_id`、`role`、`joined_at` |
| `media_assets` | COS 文件元数据 | `id`、`space_id`、`owner_id`、`object_key`、`mime_type`、`size` |
| `tag_groups` | 标签组 | `id`、`space_id`、`name`、`sort_order` |
| `tags` | 标签 | `id`、`space_id`、`group_id`、`name`、`color` |

服务端主键建议使用 UUIDv7 或 ULID。所有时间使用 UTC 时间戳；涉及“保质期”与“日程”的业务字段另外保存本地日期字符串，并由空间时区解释。

### 5.2 第一阶段库存表

```text
inventory_items
  id
  space_id
  name
  category
  quantity
  unit
  location
  purchased_at
  opened_at
  expires_at
  status
  note
  created_by
  created_at
  updated_at
```

建议第一期索引：

```text
inventory_items(space_id, status, expires_at)
inventory_items(space_id, category, status)
inventory_items(space_id, location, status)
space_members(space_id, user_id)
space_members(user_id, joined_at)
```

未来模块使用独立表，而不是把宠物、健康、动态和笔记塞入一个泛化记录表：

```text
pets / pet_records
health_profiles / health_weight_records / health_habits
recipes / recipe_ingredients / meal_plans
moments / moment_media / comments / reactions
notes / note_tags
notifications / subscriptions
plans / subscriptions / entitlements / ai_usage_records
```

## 6. 认证、会话与授权

### 微信登录

```text
小程序调用 wx.login()
  -> 将临时 code 发送到 POST /v1/auth/wechat
  -> Go 服务端调用微信 code2session
  -> 得到 openid 和 session_key
  -> 创建或更新 users 记录
  -> 创建可撤销的服务端会话
  -> 返回 session token、当前用户、可访问空间
```

不做账号密码登录。微信 `openid` 只能作为服务端身份来源，客户端不可提交任意 `userId` 或 `openid` 并要求服务端相信它。

### 会话

推荐使用随机、可撤销的会话 Token，而非一开始使用长期 JWT：

- 服务端仅保存 Token 哈希、用户 ID、设备标识、过期时间和撤销时间。
- 客户端将 Token 放在本地存储，并在每次 API 请求的 `Authorization: Bearer <token>` 请求头中携带。
- 服务端收到 401 后，小程序重新走微信登录流程。
- 退出登录、设备丢失、成员被移出空间时可撤销相应会话或权限。

### 空间权限

```text
owner    创建者；管理空间、成员与付费权益
admin    管理成员与全部共享内容
member   创建和维护共同内容
viewer   只读；后续可用于老人、保姆等场景
```

每个接口都必须经过以下顺序：

```text
session token
  -> 当前 user
  -> 校验 user 是 space member
  -> 校验 role 与内容 visibility
  -> 执行业务操作
```

对象级权限不可由前端决定。编辑或删除库存、动态、笔记和媒体时，服务端还要确认该资源本身属于目标空间，且调用者拥有该对象的操作权。

## 7. 媒体与 COS

建议从一开始区分公共与私有资源：

```text
public/
  公共图标、默认图片、应用素材

private/
  {space_id}/{asset_id}/original
  用户上传图片、视频、宠物档案、健康附件和私密记录
```

用户内容默认放入私有桶或私有前缀。推荐上传流程：

```text
小程序请求上传凭证
  -> Go 服务端鉴权并生成短期 COS 临时凭证或预签名 URL
  -> 小程序直传 COS
  -> 小程序提交 asset_id 完成业务写入
  -> 服务端按权限生成短期访问 URL
```

后端必须验证 MIME 类型、文件大小、对象路径和资产归属。不要让小程序自行生成任意 COS 路径或永久公开 URL。

## 8. HTTP API 原则

使用版本化 REST API，例如 `/v1`。写接口使用明确业务语义，避免 `select`、`insert`、`update`、`delete` 这种服务端无法稳定鉴权的通用接口。

```text
POST   /v1/auth/wechat
GET    /v1/spaces
POST   /v1/spaces
POST   /v1/spaces/{spaceId}/invites
POST   /v1/inventory/items
GET    /v1/inventory/items
GET    /v1/inventory/items/{itemId}
PATCH  /v1/inventory/items/{itemId}
POST   /v1/inventory/items/{itemId}/consume
POST   /v1/inventory/items/{itemId}/discard
```

列表接口使用游标分页、稳定排序和显式筛选参数。创建和状态变更接口支持 `Idempotency-Key`，避免弱网络重试造成重复插入。

维护 OpenAPI 文件作为前后端契约，前端不应散落硬编码接口字段。所有接口时间字段需明确使用 UTC 时间戳还是空间本地日期。

## 9. 仓库与部署

建议保持两个仓库：

```text
popcorn-mp
  微信小程序前端

popcorn-server
  Go API、Worker、数据库迁移、Docker、部署配置
```

后端建议布局：

```text
popcorn-server/
  cmd/api/
  cmd/worker/
  internal/
  migrations/
  openapi/
  deploy/compose/
  deploy/caddy/
  Dockerfile
  compose.yaml
  .github/workflows/
```

初期生产环境使用腾讯云 CVM + Docker Compose：

```text
CVM
  |- Caddy 或 Nginx：TLS 与反向代理
  |- Go API 容器
  `- Go Worker 容器（需要提醒后启用）

腾讯云托管 PostgreSQL
腾讯云 COS
腾讯云 TCR
```

PostgreSQL 生产数据应使用托管数据库，而非长期运行在同一台应用服务器容器中。

## 10. GitHub Actions 发布链路

```text
推送 main
  -> Go 测试和静态检查
  -> 构建多阶段 Docker 镜像
  -> 推送镜像至腾讯云 TCR
  -> 部署机拉取指定镜像
  -> 执行数据库迁移
  -> API 健康检查
  -> 成功切换；失败时保留上一个可用镜像
```

微信小程序的发布不同于 Web 静态站点：小程序代码由微信开发者工具或微信 CI 构建、上传、审核和发布。CDN 不承载小程序包；CDN 仅服务公共静态资源或未来 Web 管理端。

微信公众平台必须配置 API、上传和下载域名白名单。所有密钥必须放在 GitHub Secrets、腾讯云密钥管理服务或部署机环境变量中，不得提交到仓库。
