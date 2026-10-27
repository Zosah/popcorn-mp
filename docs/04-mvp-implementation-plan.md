# MVP 实施与部署基线

> 最后更新：2026-10-27
> 状态：已确认的 0→1 实施基线。后续架构、代码和部署变更应优先更新本文，避免仅存在于对话中。

当前进度：前端 Demo 1.4 已完成四个核心入口、v5「柔光玻璃生活手帐」视觉和主要生活模块的本地闭环。后端 B0/B1/B2/B3 与前端 B4 已完成并通过真实 MySQL、Go 测试、HTTP 接口和微信开发者工具双账号验收：微信/模拟登录、可撤销 Session、资料保存、默认空间、空间详情、owner 重命名、成员列表、10 位单次邀请码、公开预览、接受邀请、库存 CRUD、生命周期、软删除恢复、筛选分页、到期摘要、乐观锁、幂等、前端版本冲突和网络异常兜底均已打通。库存已接入真实 HTTP Gateway，其余生活模块仍保留本机 Demo。B5 已落地 `db_popcorn_mp` 专用每日备份、SHA-256 校验、空库恢复验证和可选 COS 上传；COS 用户媒体、跨设备业务数据与真机弱网尚未进入。

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

第一版只交付“微信登录 + 默认空间 + 家庭库存 + 单次邀请”的完整闭环。

### 必须包含

1. 微信登录，首次登录自动创建默认空间。
2. 空间重命名、成员查看。
3. 邀请码和微信分享路径邀请成员。
4. 库存新增、详情、编辑、软删除。
5. 已用完、已丢弃、已归档和恢复。
6. 名称搜索，以及分类、位置、到期状态筛选。
7. 已过期、今日到期、1～3 天、4～7 天、正常、无有效期。
8. 测试环境部署、真机联调、生产发布、备份和基础监控。

### 明确延后

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
- `t_idempotency_keys`：写接口幂等重放。

关键约定：

- ID 使用 UUIDv7。
- 时间戳使用 UTC RFC3339。
- `expires_on` 使用 MySQL `DATE`。
- 到期状态实时计算，不存为生命周期状态。
- 数量使用 `DECIMAL(12,3)`，API 使用十进制字符串。
- `version` 用于防止多人编辑时静默覆盖。
- 库存删除使用 `deleted_at` 软删除。

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
- 所有库存查询必须绑定经过鉴权的 `space_id`。

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
8. 后续加固：真机弱网、限流、日志脱敏、COS 完整恢复演练和稳定性验收。

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

1. 两个不同微信用户可以进入同一空间并看到相同库存。
2. 用户无法读取或修改未加入空间的数据。
3. 库存新增、编辑、软删除和全部生命周期状态可用。
4. 日期边界符合已过期、今日、1～3 天、4～7 天、正常和无有效期规则。
5. 重复提交不会创建重复库存或重复接受邀请。
6. 多人并发编辑时返回冲突，不静默覆盖。
7. 会话失效后客户端最多自动重登一次。
8. 真机通过 HTTPS 完成登录、空间、库存和邀请闭环。
9. GitHub Actions 能测试、构建、发布 production 并支持回滚。
10. 数据库完成一次真实的 COS 备份恢复演练。
11. 日志不出现 AppSecret、会话 Token 和 openid 明文。
