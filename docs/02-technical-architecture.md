# 技术架构

## 1. 已确认的技术方向

| 层级 | 决策 |
| --- | --- |
| 小程序前端 | 微信原生小程序，TypeScript、WXML、WXSS |
| 后端 | 独立 Go 服务 |
| 云资源 | 已有腾讯云服务器、已备案域名与腾讯云 COS |
| 源代码与自动化 | GitHub、GitHub Actions |
| 部署形态 | 无 Docker；Go Linux 二进制 + systemd，Caddy 或 Nginx 反向代理 |

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
  v
Go API（systemd）
  |- auth
  |- spaces
  `- inventory
  |
  v
MySQL（复用服务器现有实例，使用独立数据库）
  |
  `-- 定时 mysqldump -> 已有私有 COS 桶
```

图片、Worker、Redis、消息队列与托管数据库都不进入 MVP。用户量、数据量或运维风险达到实际阈值后，再评估迁移到 TencentDB for MySQL，并按需增加 COS 媒体、Worker 和 Redis。

## 4. 后端推荐栈

```text
Go 1.27.x
chi                 HTTP 路由与中间件
go-sql-driver/mysql + sqlc
goose 或 Atlas      数据库迁移
OpenAPI 3.x         API 契约和接口文档
systemd             生产进程托管
Makefile            本地开发、测试、迁移与构建入口
```

本机全局 Go 保持现状，不做系统级升级。后端 `go.mod` 声明项目所需的 Go 1.27 工具链，依靠 `GOTOOLCHAIN=auto` 在进入该模块时自动选择，不影响其他工程的 Go 版本。

本地不安装 Docker。开发时原生运行 Go API，通过 SSH 隧道连接服务器上的独立开发数据库；MySQL 端口不得直接暴露公网。若以后需要离线开发，再选择性安装本地 MySQL。第一阶段无需 Redis、消息队列或 Kubernetes。

服务器现有 MySQL 在接入前必须确认版本、字符集、磁盘、备份和其他业务占用。新项目优先采用仍在长期支持周期内的 MySQL 8.4 LTS；如果现有版本较旧，不直接升级共享实例，先评估现有业务兼容性。`popcorn` 使用独立数据库、独立迁移账号和独立运行账号，不修改其他业务表。

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
pets / pet_records / pet_daily_logs / pet_supplies
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
  Go API、数据库迁移、Linux 二进制构建、systemd 与反向代理配置
```

后端建议布局：

```text
popcorn-server/
  cmd/api/
  cmd/worker/
  internal/
  migrations/
  openapi/
  deploy/systemd/
  deploy/caddy/
  scripts/
  Makefile
  .github/workflows/
```

初期生产环境复用已有腾讯云服务器：

```text
已有服务器
  |- Caddy 或 Nginx：TLS 与反向代理
  |- popcorn-server.service：Go API 二进制
  |- MySQL：复用现有实例的独立数据库
  `- popcorn-backup.timer：定时备份并上传私有 COS
```

MVP 阶段不要求 TCR 和 TencentDB。上线前必须确认服务器操作系统、CPU、内存、磁盘、现有反向代理、MySQL 版本、端口占用与安全组规则。数据库至少每日使用 `mysqldump --single-transaction` 备份到已有私有 COS，并完成一次恢复演练。业务增长后再评估迁移到 TencentDB for MySQL。

## 10. GitHub Actions 发布链路

```text
推送 master
  -> Go 测试和静态检查
  -> 构建 Linux arm64/amd64 二进制（按服务器架构选择）
  -> 保存带 commit SHA 的发布产物
  -> 通过专用部署账号上传服务器
  -> 执行向后兼容的数据库迁移
  -> 原子切换 current 软链接并重启 systemd 服务
  -> 检查 /healthz 和 /readyz
  -> 失败则恢复上一个二进制并重启
```

微信小程序的发布不同于 Web 静态站点：小程序代码由微信开发者工具或微信 CI 构建、上传、审核和发布。CDN 不承载小程序包；CDN 仅服务公共静态资源或未来 Web 管理端。

微信公众平台必须配置 API 合法域名；图片能力启用后再配置 COS 上传和下载域名。域名已经备案，但还必须单独确认小程序备案状态。所有密钥必须放在 GitHub Secrets 或部署机环境变量中，不得提交到仓库。
