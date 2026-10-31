# MVP 实施与部署基线

> 最后更新：2026-11-01
> 状态：已确认的 0→1 实施基线。后续架构、代码和部署变更应优先更新本文，避免仅存在于对话中。

当前进度：前端已升级到 v1.20.0，继续沿用「暖奶油手帐」视觉与自定义底部导航。登录、真实头像、空间、库存、待办、生活记录、菜单、宠物照护和提醒设置均已接入真实 HTTP Gateway，并保留 Demo / HTTP 双模式；空间权限、幂等、乐观锁、私有 COS 图片和用户偏好持久化已经打通。菜单 1.20.0 在 1.19.0 的发现能力上补齐真实做饭模式，覆盖备菜勾选、计时、分步引导、退出恢复、完成态和结束清理；本地 HTTP 与生产真实微信全链路通过，前端类型检查、40 个测试文件 / 230 项测试通过；`1.20.0` 已提交推送并上传微信后台，包体 `1,890,881 Byte`（约 1.8 MB）。

## 1. 当前资源与约束

### 已有

- 微信小程序账号、管理员权限、AppID 和 AppSecret。
- 自有域名，域名与现有服务器均已备案。
- 腾讯云服务器。
- 腾讯云 COS 桶。
- GitHub 前端仓库 `popcorn-mp` 和后端仓库 `popcorn-server`。
- 本机微信开发者工具、Node.js 20、Go 1.22.12。

### 明确约束

- 本机不能安装 Docker，因此本地开发和生产发布都不能把 Docker 作为必需条件。
- 不升级系统全局 Go，避免影响其他工程。
- `popcorn-server/go.mod` 当前声明 Go 1.22 工具链；本机 `GOTOOLCHAIN=auto` 会按模块自动选择工具链。
- 前端 `project.config.json` 和 `project.private.config.json` 存在用户本地修改，初始化工程时不得覆盖。
- 域名备案不等于小程序备案。正式提交新版前必须在微信公众平台确认并完成小程序备案。

### 暂不要求购买或开通

- TencentDB；MVP 复用服务器现有 MySQL。
- TCR。
- Redis、消息队列、Kubernetes。
- 新 COS 桶；优先复用现有私有桶的独立前缀。

## 2. MVP 目标与边界

第一版先交付“微信登录 + 默认空间 + 单次邀请 + 家庭库存”，再补齐共享待办与准备清单。库存和待办都按“先跑通、后扩展”的方式实现，不提前拆分微服务。

### 必须包含

1. 微信登录，首次登录自动创建默认空间。
2. 空间重命名、成员查看。
3. 邀请码和微信分享路径邀请成员。
4. 库存新增、详情、编辑、软删除。
5. 已用完、已丢弃、已归档和恢复。
6. 名称搜索，以及分类、位置、到期状态筛选。
7. 已过期、今日到期、1～3 天、4～7 天、正常、无有效期。
8. 测试环境部署、真机联调、生产发布、备份和基础监控。

### 原始 MVP 明确延后（后续功能已按第 11 节逐步补齐）

- 图片上传与 COS 用户媒体。
- 二维码邀请和微信订阅消息。
- 购物清单、宠物、健康、动态、菜谱。
- AI、会员和支付。
- Worker、Redis 和消息队列。

### 已确认的产品规则

- 邀请码为 10 位、单次使用、7 天失效，数据库只保存 SHA-256 哈希。
- 到期阈值固定为 3 天和 7 天，首版不可配置。
- 首版只开放 `owner` 和 `member` 两种角色。
- 支持用户加入多个空间，但不提供主动创建多个空间的入口。
- 分类支持食品、饮料、冷冻、调料、日用品、药品、宠物用品和其他。

## 3. MVP 技术架构

```text
微信原生小程序
       |
       | HTTPS JSON API
       v
https://popcorn-api.simiway.cc
       |
       v
Caddy 或现有 Nginx
       |
       v
Go API 二进制（systemd）
       |
       v
MySQL（现有服务器的独立数据库）
       |
       `-- 每日 mysqldump -> 私有 COS 前缀
```

采用 Go 模块化单体，不拆微服务。生产进程由 systemd 管理，GitHub Actions 构建 Linux 二进制并上传服务器，不使用 Docker 镜像和 TCR。当前已复用服务器现有 Nginx。

## 4. 本地开发方式

```text
微信开发者工具
       |
       v
本机 Go API（go run / make dev）
       |
       v
SSH 隧道 -> 服务器 MySQL db_popcorn_mp
```

本地不直接开放 MySQL 公网端口，通过 SSH 把服务器 `127.0.0.1:33123` 映射到本机 `127.0.0.1:13307`。本地、体验版和生产统一使用 `db_popcorn_mp`，不再拆分开发库。开发、测试、迁移和构建统一收口到 Makefile：

```text
make dev
make db-tunnel
make test
make migrate-up
make migrate-down
make generate
make lint
make build
```

本地提供严格隔离的模拟登录模式，避免微信真机登录阻塞前期开发。测试和生产环境如果启用了模拟登录，服务必须拒绝启动。

## 5. 后端技术与目录

```text
Go 1.22.x
chi
go-sql-driver/mysql + sqlc
goose
OpenAPI 3.x
slog
systemd
```

```text
popcorn-server/
  cmd/api/
  internal/
    config/
    auth/
    spaces/
    inventory/
    platform/wechat/
    platform/database/
    httpapi/
  db/migrations/
  openapi/
  deploy/systemd/
  deploy/caddy/
  scripts/
  Makefile
  .github/workflows/
```

领域内部只保持 `handler -> service -> repository`，不引入复杂的架构框架。

## 6. 核心数据模型

MVP 只建立以下表：

- `t_users`：以 `wechat_appid + wechat_openid` 唯一识别微信用户。
- `t_sessions`：只保存随机 Token 的哈希、过期和撤销状态。
- `t_spaces`：空间名称、拥有者和固定时区 `Asia/Shanghai`。
- `t_space_members`：空间成员和角色。
- `t_space_invites`：单次邀请、哈希、过期和接受状态。
- `t_inventory_items`：库存内容、生命周期、日期、乐观锁和软删除。
- `t_menu_recipes`：空间内菜谱主表、成品图片媒体 ID、人份、烹饪时间、乐观锁和软删除。
- `t_menu_ingredients`：菜谱食材、用量、来源、备齐状态和稳定排序。
- `t_menu_steps`：菜谱步骤、说明和稳定排序。
- `t_idempotency_keys`：写接口幂等重放。

关键约定：

- 资源 ID 使用 12 位短 ID：`{类型前缀}_{10 位小写 base36}`，例如 `u_3k9m2q8x7p`、`s_8f2n5c1a9d`。
- 时间戳使用 UTC RFC3339。
- `expires_on` 使用 MySQL `DATE`。
- 到期状态实时计算，不存为生命周期状态。
- 数量使用 `DECIMAL(12,3)`，API 使用十进制字符串。
- `version` 用于防止多人编辑时静默覆盖。
- 库存与菜单删除使用 `deleted_at` 软删除。
- 菜单编辑时前端回传已有食材/步骤 ID，服务端复用记录并保留食材备齐状态。
- 菜单 `imageMediaId` 为可选媒体 ID：更新时不传表示保留原图，显式传空字符串表示清空图片；媒体必须属于当前空间，禁止跨空间引用。

MySQL 接入约束：

- 优先使用仍在长期支持周期内的 MySQL 8.4 LTS。
- 如果服务器版本较旧，不直接升级共享实例，先确认其他业务兼容性。
- 使用 `utf8mb4` 字符集和 InnoDB。
- 统一使用 `db_popcorn_mp`；本地通过 SSH 隧道，服务器内服务连接 `127.0.0.1:33123`。
- `popcorn_app` 是唯一业务账号，对本库拥有 DML/DDL 权限，但不能访问其他业务库。
- MySQL 不向公网开放；DataGrip 使用 SSH + `admin`，应用使用 `popcorn_app`。

## 7. API 基线

```text
POST   /auth/wechat
POST   /auth/mock
GET    /session
DELETE /session
PUT    /me
PATCH  /me

GET    /spaces
GET    /spaces/{spaceId}
PUT    /spaces/{spaceId}
PATCH  /spaces/{spaceId}
GET    /spaces/{spaceId}/members
POST   /spaces/{spaceId}/invites
GET    /invites/{code}
POST   /invites/{code}/accept

GET    /spaces/{spaceId}/inventory/summary
GET    /spaces/{spaceId}/inventory/items
POST   /spaces/{spaceId}/inventory/items
GET    /spaces/{spaceId}/inventory/items/{itemId}
PATCH  /spaces/{spaceId}/inventory/items/{itemId}
DELETE /spaces/{spaceId}/inventory/items/{itemId}
POST   /spaces/{spaceId}/inventory/items/{itemId}/consume
POST   /spaces/{spaceId}/inventory/items/{itemId}/discard
POST   /spaces/{spaceId}/inventory/items/{itemId}/archive
POST   /spaces/{spaceId}/inventory/items/{itemId}/restore

GET    /spaces/{spaceId}/menu-recipes
POST   /spaces/{spaceId}/menu-recipes
GET    /spaces/{spaceId}/menu-recipes/{recipeId}
PUT    /spaces/{spaceId}/menu-recipes/{recipeId}
DELETE /spaces/{spaceId}/menu-recipes/{recipeId}
PUT    /spaces/{spaceId}/menu-recipes/{recipeId}/servings
POST   /spaces/{spaceId}/menu-recipes/{recipeId}/ingredients/{ingredientId}/ready
POST   /spaces/{spaceId}/menu-recipes/{recipeId}/ingredients/{ingredientId}/unready
```

- JSON 字段统一使用 `camelCase`。
- 日期使用 `YYYY-MM-DD`，时间戳使用 UTC RFC3339。
- 错误结构统一为 `code/message/fields/requestId`。
- 创建、邀请和状态变更支持 `Idempotency-Key`。
- 列表使用游标分页和稳定排序。
- OpenAPI 是前后端唯一接口契约。
- 每个业务接口都必须验证会话、空间成员、角色和对象所属空间。

## 8. 微信登录与安全

```text
wx.login()
  -> POST /auth/wechat
  -> 服务端调用微信 code2session
  -> 查询或创建用户
  -> 首次用户创建默认空间
  -> 创建可撤销会话
  -> 返回 Token、用户和空间
```

- 不使用账号密码，不信任客户端提交的 `userId`、`openid` 或角色。
- 不使用长期 JWT；使用高强度随机 Token，数据库只保存 SHA-256 哈希。
- 401 后客户端最多自动重新登录一次。
- AppSecret、数据库密码和会话 Token 不写入仓库或日志。
- 登录和邀请接口需要基础限流。
- 所有库存与菜单查询必须绑定经过鉴权的 `space_id`。
- 菜单图片在上传完成后仅保存 `mediaId`，展示时由服务端签发短时效私有 COS URL；签名失败不阻塞菜谱文字保存。

## 9. 发布与回滚

```text
Pull Request
  -> gofmt / go vet / test / OpenAPI 校验
  -> 合并 master
  -> 构建目标服务器架构的 Linux 二进制
  -> 生成带 commit SHA 的发布包
  -> 上传服务器 releases/<sha>/
  -> 执行向后兼容的数据库迁移
  -> current 软链接原子切换到新版本
  -> systemctl restart popcorn-server
  -> 检查 /healthz 和 /readyz
  -> 失败则切回上一版本并重启
```

小程序第一版使用微信开发者工具手工上传、体验、审核和发布。流程稳定后再接入 `miniprogram-ci`。

## 10. 数据库与 COS 备份

- MySQL 只监听本机或内网地址，不直接暴露公网端口。
- 已落地 Popcorn 专用每日 `mysqldump --single-transaction`，只备份 `db_popcorn_mp`，不再混入服务器上的其他业务库。
- 本地备份保留 14 天并生成 SHA-256；现有私有 COS 使用独立前缀 `popcorn/backups/mysql/prod/`，配置 remote 后自动上传并校验。
- 已提供空库恢复验证脚本；正式推广前还需完成一次从 COS 下载到恢复的完整演练。
- 业务增长后再评估迁移至 TencentDB for MySQL。

## 11. 实施阶段

1. ✅ 工程与契约：Go 骨架、OpenAPI、迁移、systemd、原生本地运行；前端 TypeScript 请求层。
2. ✅ 登录与空间：微信/模拟登录、会话、资料、默认空间、重命名和成员列表。
3. ✅ 邀请协作：10 位邀请码、公开预览、接受邀请、单次失效和越权校验。
4. ✅ 部署链路：服务器 HTTPS、systemd、GitHub Actions 自动发布和健康检查。
5. ✅ 库存后端：CRUD、状态、软删除、搜索、筛选、分页、到期摘要、幂等和乐观锁。
6. ✅ 库存前端：HTTP Gateway 全面切换、Demo/HTTP 双模式和双账号开发者工具验收。
7. ✅ 备份与恢复：单一业务库每日备份、systemd timer、SHA-256、可选 COS 上传和空库恢复验证。
8. ✅ 待办后端：CRUD、准备清单、完成/重开、账单自动完成、摘要、幂等、乐观锁和软删除。
9. ✅ 待办前端：HTTP Gateway、自动游标翻页、冲突刷新、同步状态和双账号开发者工具验收。
10. ✅ 生活记录：后端权限、游标分页、幂等、乐观锁和软删除；前端 Gateway、同步状态与双模式页面。
11. ✅ 前端体验重构：Figma Make 视觉落地、自定义底栏、跨页面设计 token 统一、二级页面和横向溢出验收。
12. ✅ 菜单/今天吃什么闭环：后端 CRUD、人份、食材备齐、权限、幂等、乐观锁和软删除；前端 Demo/HTTP 双模式、图片上传、真实 HTTP 与开发者工具 UI 自动化验收均已完成。
13. ✅ 宠物照护闭环：档案、体重、日常、事件、月历、用品状态、首页摘要、空间权限、幂等、乐观锁和私有 COS 头像均已完成；MySQL `DATE` 契约修复与仓储回归测试已完成。新增疫苗、洗护、体内驱虫和体外驱虫四类周期照护，周期 1～3650 天，完成后自动推进下次日期；档案删除会通过事务软删除宠物、照护事件和用品，媒体文件暂不物理删除。迁移 10 与生产后端 `439381d` 已部署并通过健康检查。
14. 🔄 提醒与设置闭环：偏好持久化已生产部署；微信订阅授权、授权次数累计、每日聚合 Worker、失败重试、失效回收、迁移 12、OpenAPI 与前端真实授权 UI 已完成本地未配置/已配置两态验收。后端 `45382b8` 已发布生产并应用迁移 12；生产真实微信会话验证 `configured=false`、页面“模板未配置”、PUT 返回 `503 SUBSCRIPTION_NOT_CONFIGURED` 且发送机会保持 0。生产 Worker 在真实模板 ID 到位前保持关闭。
15. ✅ 待办与小计划生产 UI 全链路：旅行准备、小计划、健身 / 热量、今天吃什么和账单均通过真实微信登录与生产 HTTPS 完成页面创建、字段回读、筛选、编辑、完成 / 重开、准备项、账单规则、409 冲突恢复、上海自然日、摘要、软删除和 finally 兜底清理，最终临时数据残留为空。
16. ✅ 用户头像闭环：迁移 13、`t_users.avatar_media_id`、`PUT /me` 媒体校验、登录 / 会话 / 成员 / 邀请回读、前端选图上传与全页面展示均已完成；生产真实微信会话通过替换、移除、失败回退和越权引用验收，截图与可重复脚本已归档。
17. 🔄 发布验收：菜单、宠物、家庭库存、提醒、五类待办和用户头像均已完成开发者工具真实链路验收；私有 COS 已完成菜单、生活记录、宠物头像和用户头像生产验收；1.11.0 与 1.11.1 已完成历史版本验收；1.12.0 已完成宠物周期照护本地真实 HTTP UI 验收；1.14.0 完成宠物档案删除、空态与生产宠物全链路；1.15.0 完成家庭库存生产页面闭环；1.16.0 完成待办与小计划生产页面闭环；1.17.0 完成提醒订阅生产安全态验收；1.18.0 完成用户头像全链路并上传微信后台；1.19.0 完成菜单发现能力、生产真实微信验收与上传；1.20.0 完成菜单做饭模式、本地 HTTP 与生产真实微信全链路验收并上传微信后台，待设为体验版并完成真机验收。
18. ⏳ 后续加固：真实微信订阅模板配置与送达验收、限流、日志脱敏、COS 完整恢复演练和稳定性验收。

### 微信开发者工具上传排障

- 开发者工具 `36.6.0` 的 `cli upload` 不要同时传 `--info-output`，否则会误报“二维码输出路径无效或不存在”；上传只传项目、版本、描述、端口和语言参数。
- `preview` 可以单独使用 `--qr-output`，但上传失败排障时不要把它和 `upload` 的参数混用。

## 12. 下一步需要核对的外部信息

开始云端部署前，需要只读确认：

- 服务器操作系统、CPU 架构、CPU、内存和磁盘。
- 是否已经安装 Nginx、Caddy，以及现有 MySQL 的版本、配置和业务占用。
- 域名 DNS 当前托管位置和可用子域名。
- 安全组开放端口和 SSH 登录方式。
- COS 桶名称、地域、访问权限和可用备份前缀。
- 微信公众平台中的小程序备案状态与服务器合法域名配置。

这些信息未确认前，不假设已经开通 TencentDB 或 TCR，也不要求新增付费资源。

## 13. MVP 验收标准

1. 两个不同微信用户可以进入同一空间并看到相同库存、待办与公开生活记录。
2. 用户无法读取或修改未加入空间的数据。
3. 库存新增、编辑、软删除和全部生命周期状态可用。
4. 待办、准备项、完成/重开、账单自动完成和生活记录公开/私密权限可用；冲突时不静默覆盖。
5. 日期边界符合已过期、今日、1～3 天、4～7 天、正常和无有效期规则。
6. 重复提交不会创建重复库存、待办、生活记录或重复接受邀请。
7. 多人并发编辑时返回冲突，不静默覆盖。
8. 会话失效后客户端最多自动重登一次。
9. 真机通过 HTTPS 完成登录、空间、库存、待办、生活记录、菜单与邀请闭环，包括私有 COS 图片上传和展示。
10. GitHub Actions 能测试、构建、发布 production 并支持回滚。
11. 数据库完成一次真实的 COS 备份恢复演练。
12. 日志不出现 AppSecret、会话 Token 和 openid 明文。
