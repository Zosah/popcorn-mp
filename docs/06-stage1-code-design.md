# 阶段 1 代码设计：工程与契约

> 最后更新：2026-10-27
> 状态：**实施中**。B0 工程骨架、B1 登录/资料/Session、B2 空间/成员/邀请已完成并通过真实数据库与开发者工具 HTTP 验收；B3 库存是下一阶段。
> 上位基线是 `docs/04-mvp-implementation-plan.md`；本文只把阶段 1（工程与契约）细化到可直接编码的程度，不改变 MVP 范围。

## 0. 本文要解决的问题

`docs/04` 定了范围、目录、API 清单和验收标准，但没有定到"能直接写代码"的粒度：字段类型、排序规则、错误码、幂等实现、分页游标结构、前后端职责边界都还是空的。同时 `docs/02`、`docs/03` 与 `docs/04` 存在接口口径冲突。本文一次性给出裁决与实现设计。

## 1. 契约裁决（消除文档冲突）

以 `docs/04` 为准，OpenAPI 文件是唯一契约。裁决结果：

| 冲突项 | 裁决 | 理由 |
| --- | --- | --- |
| 库存路径 | `/spaces/{spaceId}/inventory/...`（资源嵌套在空间下） | 空间是鉴权边界，路径即权限声明；服务端可从路径直接校验成员关系 |
| summary | 保留 `GET /spaces/{spaceId}/inventory/summary` | 首页只需要计数，不应拉全量 |
| `POST /spaces` | **删除**，MVP 不提供主动创建多空间入口 | `docs/04` §2 已确认 |
| `restore` | 保留 `POST .../items/{itemId}/restore` | 前端历史视图已实现"恢复到库存" |
| `/media/*` | **不进 MVP**，接口不注册 | `docs/04` 明确延后图片上传 |
| 字段名 | 日期类字段统一 `purchasedOn` / `openedOn` / `expiresOn`（`YYYY-MM-DD`） | `docs/01` §5 明确保存日期字符串，不存到期时间戳；`docs/02` 的 `*_at` 写法需修订 |
| 时间戳字段 | `createdAt` / `updatedAt` / `deletedAt` 为 UTC RFC3339 | 与日期字段语义分离 |

已实现部分以 `popcorn-server/openapi/openapi.yaml` 和 `db/migrations/00001_init.sql` 为准；旧草案中的 ULID、开发/生产双库和单独迁移账号均已废弃。

## 2. API 契约细则

### 2.1 完整清单

```text
POST   /auth/wechat                                  微信登录
POST   /auth/mock                                    模拟登录（仅 local）
GET    /session                                      当前会话快照
DELETE /session                                      退出登录（撤销 token）
PUT    /me                                           保存资料（wx.request 兼容）
PATCH  /me                                           保存资料

GET    /spaces                                       我可访问的空间
GET    /spaces/{spaceId}                             空间详情
PUT    /spaces/{spaceId}                             重命名（owner，wx.request 兼容）
PATCH  /spaces/{spaceId}                             重命名（owner）
GET    /spaces/{spaceId}/members                     成员列表

POST   /spaces/{spaceId}/invites                     生成 10 位一次性邀请码（owner）
GET    /invites/{code}                               校验邀请码（无需登录）
POST   /invites/{code}/accept                        接受邀请

GET    /spaces/{spaceId}/inventory/summary           到期计数摘要
GET    /spaces/{spaceId}/inventory/items             列表（筛选 + 游标分页）
POST   /spaces/{spaceId}/inventory/items             新增
GET    /spaces/{spaceId}/inventory/items/{itemId}    详情
PATCH  /spaces/{spaceId}/inventory/items/{itemId}    编辑
DELETE /spaces/{spaceId}/inventory/items/{itemId}    软删除
POST   /spaces/{spaceId}/inventory/items/{itemId}/consume
POST   /spaces/{spaceId}/inventory/items/{itemId}/discard
POST   /spaces/{spaceId}/inventory/items/{itemId}/archive
POST   /spaces/{spaceId}/inventory/items/{itemId}/restore

GET    /healthz                                         存活（无鉴权、无 DB）
GET    /readyz                                          就绪（含 DB ping）
```

### 2.2 DTO 与字段类型

```jsonc
// InventoryItem
{
  "id": "0192f...",               // UUIDv7 字符串
  "spaceId": "0192f...",
  "name": "鲜牛奶",
  "category": "drink",            // food|drink|frozen|seasoning|daily|medicine|pet|other
  "quantity": "1.00",             // 字符串传输的 decimal，避免 JS 浮点精度问题
  "unit": "盒",
  "location": "fridge",           // fridge|freezer|kitchen|living-room|bathroom|storage|other
  "purchasedOn": "2026-10-19",    // 或 null
  "openedOn": null,
  "expiresOn": "2026-10-23",
  "note": "开封后尽快喝完",
  "status": "active",             // active|consumed|discarded|archived
  "expiryStatus": "expired",      // 服务端计算：expired|today|urgent|soon|normal|none
  "daysRemaining": -1,            // 服务端计算，none 时为 null
  "version": 3,
  "createdBy": "0192f...",
  "createdAt": "2026-10-19T02:11:00Z",
  "updatedAt": "2026-10-24T01:00:00Z"
}
```

关键决策：

- **`quantity` 用字符串**。数据库存 `DECIMAL(10,2)`，JSON 以字符串传输。前端现有类型 `quantity: string` 零改动，同时规避浮点误差。
- **`expiryStatus` 与 `daysRemaining` 由服务端返回并作为权威值**。前端 `domain/expiry.ts` 保留，但只用于生成中文 label（"已过期 1 天"），不再自行判定 status，避免设备改时间或时区错乱导致前后端结论不一致。
- 服务端与前端使用**同一套阈值**（3 天 / 7 天）与同一时区（`Asia/Shanghai`），并用同一组边界用例分别在 Go 和 TS 写测试锁死。

### 2.3 列表查询参数

```text
status    = active | consumed | discarded | archived   （可多值，逗号分隔；默认 active）
expiry    = expired | today | urgent | soon | normal | none （可多值）
category  = 可多值
location  = 可多值
query     = 名称模糊搜索
sort      = expiry | updated                            （默认 expiry）
cursor    = 上一页返回的 nextCursor
limit     = 默认 20，最大 100
```

排序定义（必须稳定，游标依赖它）：

```text
sort=expiry   ORDER BY expiry_rank ASC, expires_on ASC, id ASC
              expiry_rank: expired=0, today=1, urgent=2, soon=3, normal=4, none=5
              （expires_on IS NULL 视为最大）
sort=updated  ORDER BY status_rank ASC, updated_at DESC, id ASC
              status_rank: consumed=0, discarded=1, archived=2
```

响应：

```jsonc
{ "items": [...], "nextCursor": "eyJ...", "hasMore": true }
```

游标是 `base64url(JSON{排序键快照 + 最后一个 id})` 的不透明字符串，客户端不得解析。

**为什么这个排序能让前端保留分组视图**：现有库存页把列表分成"已过期 / 近期到期 / 安心库存 / 长期存放"四段。因为 `sort=expiry` 保证同段元素连续，前端只需在遍历有序列表时按 `expiryStatus` 变化插入段标题，不必为分组额外请求，也不必拉全量。历史视图同理（`sort=updated` 让 consumed/discarded/archived 三段连续）。

### 2.4 错误模型

```jsonc
{
  "code": "VALIDATION_FAILED",
  "message": "名称不能为空",
  "fields": [{ "field": "name", "reason": "REQUIRED" }],
  "requestId": "req_01J9ZK..."
}
```

| code | HTTP | 触发 |
| --- | --- | --- |
| `UNAUTHENTICATED` | 401 | token 缺失/失效/已撤销 |
| `FORBIDDEN` | 403 | 非空间成员，或角色不足 |
| `NOT_FOUND` | 404 | 资源不存在**或不属于该空间**（不区分，避免探测） |
| `VERSION_CONFLICT` | 409 | 乐观锁失败，响应体附最新对象 |
| `IDEMPOTENCY_CONFLICT` | 409 | 同 key 不同请求指纹 |
| `INVITE_INVALID` / `INVITE_EXPIRED` / `INVITE_USED` | 404 / 410 / 409 | 邀请码校验 |
| `VALIDATION_FAILED` | 422 | 字段校验失败，带 `fields` |
| `RATE_LIMITED` | 429 | 限流 |
| `INTERNAL` | 500 | 未分类错误，`message` 不泄漏内部细节 |

`requestId` 由服务端生成并回写响应头 `X-Request-Id`，同时进日志；前端错误提示与排障都以它串联。

### 2.5 幂等

- 适用范围：`POST` 新增物品、生成邀请、接受邀请、四个状态变更接口。
- 客户端生成 UUID 作为 `Idempotency-Key`，与本次业务请求一起本地保存，重试时复用。
- 服务端表 `idempotency_keys(user_id, key)` 唯一；存请求指纹（method + path + body SHA-256）与首次响应（status + body）。
  - 同 key 同指纹 → 直接回放首次响应（状态码 200，响应头 `Idempotent-Replay: true`）。
  - 同 key 不同指纹 → `409 IDEMPOTENCY_CONFLICT`。
  - 首次请求尚未完成 → `409` + `Retry-After`（避免并发双写）。
- TTL 24 小时，由查询时惰性清理（MVP 不引入定时任务）。

### 2.6 限流

MVP 只做进程内令牌桶，按 IP + 路由分组：`/auth/*` 与 `/invites/*` 严格（10 次/分钟/IP），其余宽松（120 次/分钟/用户）。不引入 Redis；多实例部署时再升级为共享存储。

## 3. 数据模型

MySQL 8.x，`utf8mb4` / `utf8mb4_0900_ai_ci`，InnoDB。主键统一使用 UUIDv7 `CHAR(36)`；所有业务表统一 `t_` 前缀，goose 版本表为 `t_schema_migrations`。

```sql
t_users(
  id CHAR(36) PK,
  wechat_appid VARCHAR(32) NOT NULL,
  wechat_openid VARCHAR(64) NOT NULL,
  nickname VARCHAR(64) NOT NULL DEFAULT '',
  avatar_tone ENUM('lavender','mint','peach','sun') NOT NULL DEFAULT 'lavender',
  onboarding_completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_users_wechat (wechat_appid, wechat_openid)
)

t_sessions(
  id CHAR(36) PK,
  user_id CHAR(36) NOT NULL,
  token_hash CHAR(64) NOT NULL,          -- SHA-256(token)，明文不落库
  device_label VARCHAR(64) NOT NULL DEFAULT '',
  expires_at DATETIME(3) NOT NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_sessions_token (token_hash),
  KEY idx_sessions_user (user_id, expires_at)
)

t_spaces(
  id CHAR(36) PK,
  name VARCHAR(40) NOT NULL,
  type ENUM('family','couple','pet','circle') NOT NULL DEFAULT 'family',
  owner_id CHAR(36) NOT NULL,
  timezone VARCHAR(32) NOT NULL DEFAULT 'Asia/Shanghai',
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL
)

t_space_members(
  space_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role ENUM('owner','member') NOT NULL DEFAULT 'member',
  joined_at DATETIME(3) NOT NULL,
  PRIMARY KEY (space_id, user_id),
  KEY idx_members_user (user_id, joined_at)
)

t_space_invites(
  id CHAR(36) PK,
  space_id CHAR(36) NOT NULL,
  code_hash CHAR(64) NOT NULL,           -- 10 位邀请码的 SHA-256，只存哈希
  created_by CHAR(36) NOT NULL,
  expires_at DATETIME(3) NOT NULL,       -- 创建后 7 天
  accepted_by CHAR(36) NULL,
  accepted_at DATETIME(3) NULL,
  revoked_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_invites_code (code_hash),
  KEY idx_invites_space (space_id, created_at)
)

t_inventory_items(
  id CHAR(36) PK,
  space_id CHAR(36) NOT NULL,
  name VARCHAR(60) NOT NULL,
  category VARCHAR(16) NOT NULL,
  quantity DECIMAL(12,3) NOT NULL,
  unit VARCHAR(12) NOT NULL DEFAULT '',
  location VARCHAR(16) NOT NULL,
  purchased_on DATE NULL,
  opened_on DATE NULL,
  expires_on DATE NULL,
  note VARCHAR(500) NOT NULL DEFAULT '',
  status ENUM('active','consumed','discarded','archived') NOT NULL DEFAULT 'active',
  version INT NOT NULL DEFAULT 1,        -- 乐观锁
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL,
  updated_at DATETIME(3) NOT NULL,
  deleted_at DATETIME(3) NULL,           -- 软删除
  KEY idx_items_space_status_expiry (space_id, status, deleted_at, expires_on),
  KEY idx_items_space_category (space_id, category, status),
  KEY idx_items_space_location (space_id, location, status)
)

idempotency_keys(
  id CHAR(36) PK,
  user_id CHAR(36) NOT NULL,
  idem_key VARCHAR(64) NOT NULL,
  request_fingerprint CHAR(64) NOT NULL,
  response_status SMALLINT NOT NULL,
  response_body MEDIUMTEXT NOT NULL,
  completed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  UNIQUE KEY uk_idem (user_id, idem_key)
)
```

说明：

- 名称搜索 MVP 用 `LIKE '%kw%'`，靠 `(space_id, status, deleted_at)` 索引先把行集缩小；中文全文索引留到数据量增长后再加，本文不做。
- 迁移用 goose，`migrations/00001_init.sql` 起；所有迁移必须向后兼容（先加列后删列，不在同一发布里改语义）。
- `expires_on` 用 `DATE` 而非 `DATETIME`，与"按自然日 + Asia/Shanghai 解释"的产品规则一致。

## 4. 后端工程设计

### 4.1 目录与职责

```text
popcorn-server/
  cmd/api/main.go              组装根：config → logger → db → repo → service → router → server
  internal/
    config/                    环境变量加载与校验；模拟登录在非 local 环境启动即 fatal
    httpapi/                   chi 路由、中间件、错误渲染、JSON 编解码、请求日志
    auth/                      会话签发/校验/撤销、微信登录编排、鉴权中间件
    spaces/                    空间、成员、邀请（handler → service → repository）
    inventory/                 库存 handler/service/repository + expiry 计算
    platform/database/         连接池、事务助手、时钟
    platform/idgen/            UUIDv7
    platform/wechat/           code2session 客户端（接口化，测试注入 fake）
  db/migrations/               goose 迁移与 embed.FS
  openapi/openapi.yaml         唯一契约
  deploy/systemd/  deploy/nginx/
  scripts/                     备份、部署、隧道脚本
  Makefile
  .github/workflows/
```

领域内严格 `handler → service → repository` 三层，不引入额外架构框架。handler 只做编解码与错误映射；service 承载规则与事务；repository 只做 SQL。

### 4.2 关键接口（Go）

```go
// platform/database
type Clock interface{ Now() time.Time }        // 到期计算与 token 过期必须可注入
func NewUUIDv7(now time.Time) (string, error)

// auth
type Token string
type Session struct {
    ID, UserID string
    ExpiresAt  time.Time
    DeviceLabel string
}
type SessionStore interface {
    Create(ctx context.Context, userID, deviceLabel string) (Session, Token, error)
    Resolve(ctx context.Context, tokenHash string) (Session, error) // 校验过期与撤销
    Revoke(ctx context.Context, sessionID string) error
    RevokeAllForUser(ctx context.Context, userID string) error
}
type WechatAuthenticator interface {
    Code2Session(ctx context.Context, code string) (WechatIdentity, error)
}

// spaces
type SpaceMember struct { UserID, Nickname, AvatarURL, Role string; JoinedAt time.Time }
type MembershipGuard interface {
    // 所有业务接口的统一入口：解析 session → 校验成员 → 校验角色
    Require(ctx context.Context, spaceID string, minRole Role) (Context, error)
}

// inventory
type ListQuery struct {
    SpaceID  string
    Statuses []Status
    Expiries []ExpiryStatus
    Categories, Locations []string
    Query    string
    Sort     Sort
    Cursor   string
    Limit    int
}
type InventoryRepository interface {
    List(ctx context.Context, q ListQuery) (Page[Item], error)
    Summary(ctx context.Context, spaceID string, today civil.Date) (Summary, error)
    Get(ctx context.Context, spaceID, itemID string) (Item, error)
    Insert(ctx context.Context, item Item) (Item, error)
    Update(ctx context.Context, item Item, expectedVersion int) (Item, error) // 0 行受影响 → ErrVersionConflict
    SoftDelete(ctx context.Context, spaceID, itemID string, expectedVersion int) error
    SetStatus(ctx context.Context, spaceID, itemID string, s Status, expectedVersion int) (Item, error)
}
```

到期计算集中在 `internal/inventory/expiry.go`，输入 `(expiresOn *civil.Date, today civil.Date)`，输出 `(ExpiryStatus, daysRemaining *int)`。使用 `time.Date`/civil date 而非 `time.Time` 做天数差，避免夏令时与跨零点误差（上海无夏令时，但算法仍按纯日历日实现）。

### 4.3 中间件顺序

```text
RequestID → Recover → AccessLog(slog, 脱敏) → RateLimit
  → Auth(可选路由跳过) → SpaceMembership(按 {spaceId} 路由) → Idempotency(仅 POST 写接口)
  → Handler
```

日志脱敏：`Authorization` 头、token、openid、AppSecret、数据库密码一律不落日志；用户维度只记 `userId` 与 `requestId`。

### 4.4 认证与会话

```text
wx.login() → POST /auth/wechat {code, deviceLabel}
  → code2session（AppID/AppSecret 来自环境变量）
  → upsert users by (appid, openid)
  → 若新用户：创建默认空间「我们的家」+ owner 成员（同一事务）
  → 生成 32 字节随机 token，库存 SHA-256
  → 返回 {token, expiresAt, user, spaces[], activeSpaceId}
```

- Token TTL 30 天，MVP **不做滑动续期**（简化撤销语义）；过期后客户端重新 `wx.login`。
- 撤销场景：主动退出、成员被移出空间（撤销其全部会话可留到阶段 5）。
- 模拟登录：`AUTH_MODE=mock` + `ENV=local` 时开放 `POST /auth/mock {identity}`，用固定 identity 复用/创建用户，便于两个"用户"并发测试越权。`ENV != local` 且 `AUTH_MODE=mock` → 启动直接 fatal，配置校验在 `internal/config`。

### 4.5 配置项

```text
ENV=local|staging|production
PORT=8080
MYSQL_DSN=                        # 密码来自环境变量或 systemd Credentials，不入仓库
WECHAT_APPID=  WECHAT_APPSECRET=
AUTH_MODE=wechat|mock
SESSION_TTL_DAYS=30
INVITE_TTL_DAYS=7
ALLOWED_ORIGINS=                  # 小程序无跨域需求，保留给未来 Web
LOG_LEVEL=info|debug
```

启动时全量校验并 fail fast；缺密钥时报错信息只说"缺少哪个变量"，不回显值。

## 5. 前端工程设计

### 5.1 新增目录

```text
src/
  config/env.ts                     baseUrl、demoMode 与 apiAuthMode 编译期开关
  types/api.ts                      Session、Space、Invite 等 DTO 类型
  services/transport.ts             wx.request 薄封装、Request-Id 与错误规范化
  services/http.ts                  Bearer Token、baseUrl 与 JSON 请求层
  services/auth.ts                  Demo/HTTP 账号状态门面
  services/auth-gateway.ts          登录、Session 恢复、资料保存、退出
  services/space-gateway.ts         空间详情、成员、重命名、邀请码与接受邀请
  services/http-inventory-gateway.ts  库存 HTTP 实现（B3 待补）
  stores/session.ts                 token、user、spaces、activeSpaceId、role
```

现有 `services/demo-*.ts` 与 `mocks/` 全部保留，Demo 仍可离线运行。

### 5.2 `services/http.ts` 职责

- 拼 baseUrl、注入 `Authorization: Bearer`、`X-Request-Id` 透传。
- 超时（10s）与网络错误规范化为 `HttpError{code,message,fields,requestId,httpStatus}`。
- 当前 B1/B2 在 401 时清理失效会话并回到未登录状态；单飞（single-flight）自动重登与请求重放留到库存弱网加固阶段实现。
- B1/B2 尚未进入写业务数据阶段；`Idempotency-Key` 的自动生成、持久化和复用随 B3 库存写接口一起落地。
- 页面内不得出现裸 `wx.request`，B1/B2 页面已统一通过 Gateway 访问。

### 5.3 `InventoryGateway` 接口演进

```ts
export interface InventoryListResult {
  items: InventoryItem[]
  nextCursor: string | null
  hasMore: boolean
}

export interface InventoryGateway {
  list(filters: InventoryFilters, today: string, cursor?: string | null): Promise<InventoryListResult>
  summary(today: string): Promise<InventorySummary>
  get(id: string): Promise<InventoryItem | null>
  create(input: InventoryItemInput): Promise<InventoryItem>
  update(id: string, input: InventoryItemInput, version: number): Promise<InventoryItem>
  remove(id: string, version: number): Promise<void>
  changeStatus(id: string, status: InventoryLifecycleStatus, version: number): Promise<InventoryItem>
}
```

变化点：`list` 返回分页信封；新增 `summary`。`InventoryFilters` 增加 `statuses` 已有、无需改；`today` 参数在 HTTP 实现中忽略（服务端自行取上海当天），仅为兼容 Mock 保留签名。

### 5.4 页面改动面（刻意压到最小）

| 页面 | 改动 |
| --- | --- |
| `pages/inventory` | `loadInventory` 由"两次 list + 本地 summarize"改为"`summary()` + `list(filters, today, cursor)`"；分段标题改为遍历有序列表时按 `expiryStatus`/`status` 变化插入；新增"加载更多"与 `hasMore` 状态 |
| `pages/item-form` | 捕获 `VALIDATION_FAILED` 时把 `fields` 映射到具体表单项提示（现在只有全局 toast） |
| `pages/item-detail` | `VERSION_CONFLICT` 后自动重新 `loadItem()` 再提示，避免用户对着旧版本号反复失败 |
| `pages/home` | 库存摘要改为读 `summary()`，不再 `list({})` 拉全量 |
| 其余页面 | 不动 |

登录态接入后，登录页和个人中心会读本地 token → `GET /session` 恢复；失效时清 Token，再由用户重新登录。`activeSpaceId` 只作请求上下文缓存，空间与邀请权限一律由服务端重新校验。

## 6. 测试策略（本机无 Docker）

| 层 | 方式 |
| --- | --- |
| 后端 service / expiry / 幂等 | 纯单元测试 + fake repository，`make test` 默认执行 |
| 后端 repository | 集成测试，`//go:build integration` 隔离，通过 SSH 隧道连服务器业务库 `db_popcorn_mp`，`make test-integration` 手动执行 |
| 后端 handler | `httptest` + fake service，校验状态码、错误结构、鉴权与越权 |
| 契约 | `kin-openapi` 校验所有 handler 响应符合 `openapi.yaml`；CI 中作为独立步骤 |
| 前端 | vitest：`http.ts`（注入 fake transport，覆盖 401 单飞重登、幂等 key 复用、超时）、`HttpInventoryGateway`（DTO ↔ domain 映射）、分页分段渲染纯函数 |
| 跨端一致性 | 到期边界用例表（-1/0/1/3/4/7/8/null）在 Go 与 TS 各写一份，值完全一致，任一端改动都会失败 |

WXML/WXSS 与真机交互仍在微信开发者工具中人工验收，沿用 `docs/05` §9 清单。

## 7. Makefile 与 CI

```text
make dev               ENV=local AUTH_MODE=mock go run ./cmd/api
make db-tunnel         ssh -N -L 13307:127.0.0.1:33123 <server>
make test              go test ./...（单元）
make test-race         go test -race ./...
make migrate-up/down   goose -dir db/migrations mysql "$MYSQL_DSN" up|down
make openapi-check     校验 openapi.yaml 可解析
make lint              gofmt -l + go vet + golangci-lint
make build-linux       CGO_ENABLED=0 GOOS=linux go build ./cmd/api
make openapi-check     校验 openapi.yaml 可解析且与路由一致
```

CI（GitHub Actions）：

```text
PR      → gofmt / go vet / golangci-lint / go test / openapi-check
master  → 上述全部 → 构建 linux arm64 + amd64 → 产物按 commit SHA 归档
        → 部署 staging：上传 releases/<sha>/ → migrate up → current 软链切换
        → systemctl restart → 探测 /healthz /readyz → 失败切回上一版本并重启
```

小程序仍由微信开发者工具手工上传发布；流程稳定后再接 `miniprogram-ci`。

## 8. 实施切片（每片可独立验收）

| 片 | 内容 | 验收 |
| --- | --- | --- |
| ✅ S1-1 | 后端骨架：go.mod（go 1.27 + toolchain）、config、slog、db、`/healthz`、`/readyz`、Makefile、CI 测试链 | 已通过 `make lint`、`make test-race`、`make build-linux` |
| ✅ S1-2 | `openapi.yaml` + 迁移 00001 + 模拟登录 + Session + 资料 + 默认空间 | mock 登录、Session 恢复、资料保存、无 token 401 已验证 |
| ✅ S1-3 | 前端 `transport/http/auth/stores/session` + `config/env.ts` | 22 个测试文件、135 项测试通过；开发者工具真实 HTTP 会话与 B2 页面验收通过 |
| ▶ S1-4 | 库存后端：CRUD、状态变更、软删除、summary、筛选、游标分页、幂等、乐观锁 | 下一阶段；handler 测试 + 真实数据库验证，越权访问他人空间返回 404 |
| S1-5 | 前端 `HttpInventoryGateway` + inventory/home/item-detail/item-form 改造 | 关闭 demoMode 后库存全链路可用，Demo 模式仍可离线运行 |
| ✅ S1-6 | 空间与邀请：重命名、成员列表、10 位邀请码生成/校验/接受（7 天、单次、只存哈希） | 真实数据库与 HTTP 页面验收通过；重复接受返回 `INVITE_USED` |

S1-1 与 S1-3 可并行（前端先对 mock 后端联调）。S1-4 依赖 S1-2 的契约冻结。

## 9. 待确认事项

1. `quantity` 用字符串传输 decimal 是否接受（另一选择是 number + 前端格式化）。
2. 会话 TTL 30 天且不滑动续期是否接受。
3. ✅ 主键已裁决为 UUIDv7 `CHAR(36)`，数据库与 API 均已落地。
4. 名称搜索 MVP 用 `LIKE`，暂不上中文全文索引，是否接受。
5. 限流只做进程内令牌桶（单实例前提），是否接受。
