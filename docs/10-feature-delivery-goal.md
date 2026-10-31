# 功能交付 Goal 与闭环基线

> 目标：按 `popcorn-mp` 与 `popcorn-server` 现有架构，逐个功能完成产品设计、前后端实现、数据库迁移、图片与 COS、后端部署、真实环境联调、自动化验收和体验版上传。
>
> 最后更新：2026-11-01

## 0. 当前 Goal 状态

- 状态：进行中（active）。
- Goal 模式：这不是一次性计划。每轮只取一个功能切片，从交互设计一路推进到生产部署、真实环境联调、小程序体验版上传和真机验收；未达到 Definition of Done 就留在当前切片，不跳到下一个功能。
- 当前焦点：微信用户真实头像与账号资料全链路。头像已写入 `t_users.avatar_media_id`，图片进入私有 COS，登录、账号资料、个人中心、首页空间成员、空间成员和邀请页统一展示服务端签名地址。
- 当前切片已完成：数据库迁移 13、后端头像媒体校验与回读、OpenAPI、前端选图 / 上传 / 替换 / 移除 / 失败回退、生产真实微信会话验收，以及个人中心空间头像溢出修复。
- 本地验证：前端类型检查通过；38 个测试文件 / 220 项测试通过；后端 `gofmt`、`go vet`、`go test ./...` 与 `go test -race ./...` 通过。
- 生产验证：`npm run verify:production-avatar-ui` 已覆盖真实微信会话、`purpose=avatar`、私有 COS 路径与签名 URL、保存回读、替换、移除、无头像昵称首字回退、跨空间头像引用拒绝，并在 `finally` 中恢复验收前头像。
- 当前截图：`shots/production-avatar-ui-auth-uploaded.png`、`shots/production-avatar-ui-account.png`、`shots/production-avatar-ui-profile.png`、`shots/production-avatar-ui-home-members.png`、`shots/production-avatar-ui-space-members.png`、`shots/production-avatar-ui-invite.png`、`shots/production-avatar-ui-account-cleared.png`、`shots/production-avatar-ui-profile-fallback.png`。
- 发布状态：后端 `6e960c0` 已推送并部署生产，迁移 13 已应用，`healthz / readyz` 正常；前端 `1.18.0` 已上传微信后台，包体 `1,852,683 Byte`（约 1.8 MB），待提交推送、设为体验版并完成真机验收。
- 下一门槛：完成 `1.18.0` 前端提交推送，在公众平台设为体验版；真机复验上传、替换、移除、杀进程重进后的头像状态。GitHub Actions 自动部署结果仍需在网页端确认（本机无可用的已授权 GitHub CLI）。

## 1. 执行原则

- 每次只推进一个功能，但必须端到端闭环，不把“页面能点”“接口能返回”当成完成。
- 前端保留 Demo / HTTP 双模式；真实模式不可绕过空间权限、幂等、乐观锁和软删除。
- 图片统一上传私有 COS，业务表只保存 `mediaId`；服务端签发短时效访问 URL。
- 数据库只使用 `db_popcorn_mp`，业务表统一 `t_` 前缀，变更通过向后兼容迁移发布。
- 生产发布保持“测试通过 -> 构建 -> 迁移 -> 原子切换 -> 健康检查 -> 失败回滚”。
- 每个版本必须有 Git 提交、实施记录、验收清单和可回滚的上传版本。
- 不覆盖用户本地配置、不提交密钥、Token、数据库密码或浏览器会话文件。
- 每轮汇报固定包含：已完成门槛、当前验证证据、剩余门槛、真实外部阻塞项。
- 自动化可以证明接口和页面行为，但不能替代真实模板、真实微信授权、真机通知和体验版验收；未完成就如实标记。
- 不因一次提交、一次部署或一次上传就结束 Goal；只有功能清单全部达到闭环，或用户明确要求暂停，Goal 才结束。

## 2. 单功能 Definition of Done

一个功能只有同时满足以下条件才算完成：

1. 产品范围、关键状态和异常分支已明确。
2. 数据库表、索引、迁移和回滚策略已落地。
3. 后端接口、权限、校验、幂等和并发控制已实现并通过自动化测试。
4. 前端交互、空态、加载态、错误态和无网络恢复已实现。
5. Demo / HTTP 双模式均可运行；真实模式完成至少两个用户或两个空间的数据隔离验收。
6. 有图片时完成私有 COS 上传、替换、移除、鉴权展示和失败降级。
7. 本地类型检查、单元测试、接口脚本和关键页面 UI 自动化通过。
8. 后端已部署到生产，生产迁移、HTTPS 接口和 COS 读写已复验。
9. 小程序版本已上传微信后台，并完成体验版真机验收。
10. 文档记录当前版本、验证结果、已知限制和下一步。

## 3. 功能推进顺序

| 顺序 | 功能 | 当前阶段 | 闭环重点 |
| --- | --- | --- | --- |
| 1 | 菜单 / 今天吃什么 | 🔄 生产 COS 闭环完成，待真机验收 | CRUD、人份、食材备齐、私有 COS、共享与冲突 |
| 2 | 宠物照护 | 🔄 `1.14.0` 已上传，待真机验收 | 档案增删、体重、事件、日历、周期照护、私有 COS 图片 |
| 3 | 生活记录 | 🔄 生产图片/私密记录闭环，待真机验收 | 弱网、双人可见范围与删除后媒体治理 |
| 4 | 家庭库存 | 🔄 `1.15.0` 已上传，待真机验收 | 页面 CRUD、数量格式、到期筛选、生命周期、首页摘要、软删除 |
| 5 | 待办与小计划 | 🔄 `1.16.0` 已上传，待真机验收 | 小计划、旅行准备、健身、今天吃什么、账单、冲突恢复 |
| 6 | 登录、空间与邀请 | 🔄 `1.11.1` 体验版已上传 | 真机微信登录、邀请分享、成员退出和多用户复验 |
| 7 | 首页与底部导航 | 🔄 `1.13.0` 已上传，待真机验收 | 首页摘要、宠物动态、自定义底栏、本机快照与跨设备同步 |
| 8 | 提醒与设置 | 🔄 `1.17.0` 已上传，待真机与真实模板送达验收 | 偏好持久化、微信订阅授权、每日聚合、失败重试、失效回收 |
| 9 | 用户头像与账号资料 | 🔄 `1.18.0` 已上传，待真机验收 | 私有 COS、资料保存、全局头像回读、替换 / 移除、失败降级 |

## 4. 每个功能的执行流水线

```text
范围确认
  -> 交互与视觉设计
  -> API / 数据模型契约
  -> 数据库迁移
  -> 后端实现与测试
  -> 前端 Demo 模式
  -> 前端 HTTP 模式
  -> 图片 / COS 接入
  -> 本地全链路联调
  -> 生产部署与公网复验
  -> 小程序上传
  -> 体验版真机验收
  -> 文档与版本归档
```

### 每个阶段的交付证据

| 阶段 | 必须产出 | 通过门槛 |
| --- | --- | --- |
| 范围与交互 | 功能范围、非目标、关键状态、空 / 错 / 加载态、设计稿或原型 | 主链路和异常分支可直接转成页面与接口 |
| 契约与数据 | OpenAPI、表结构、索引、迁移、权限、错误码、幂等与乐观锁策略 | 前后端对字段类型、资源归属和冲突行为无歧义 |
| 后端 | handler / service / repository、单元与集成测试、OpenAPI 更新 | 权限隔离、幂等、并发冲突、软删除和回滚路径可验证 |
| 前端 Demo | 可点击页面、完整状态、Demo 数据持久化 | 无后端也能独立演示完整产品流程 |
| 本地 HTTP | 真实请求、双用户 / 双空间、页面自动化 | Demo 与 HTTP 双模式行为一致，异常可恢复 |
| 图片 / COS | 私有桶上传、对象路径、短时签名、替换、移除、失败回退 | 业务表只存 `mediaId`，跨空间引用被拒绝；无图片功能显式标记 N/A |
| 生产部署 | 构建产物、迁移记录、systemd 切换、健康检查、公网 HTTPS 复验 | `healthz / readyz` 正常，新路由和新表已在生产生效 |
| 生产联调 | 真实微信会话、可重复验收脚本、关键截图 | 至少覆盖主链路、替换 / 清理、权限负例和失败态 |
| 小程序发布 | 新版本号、包大小、上传描述、微信后台记录 | 构建成功并上传为可回滚版本 |
| 真机验收 | 体验版二维码、真机操作记录、问题清单 | 主链路在真实设备可完成，已知限制被记录 |
| 归档 | README、实施计划、Goal 进度、提交记录 | 任何人从文档可以复现验证并定位剩余阻塞 |

### 单功能 Goal 卡模板

每个功能开工时先复制下面这张卡，后续所有汇报都围绕同一张卡更新，避免“做完页面就换下一个功能”：

```text
功能：
版本：
范围：
非目标：
交互与视觉证据：
API / DB / OpenAPI：
Demo 模式：
本地 HTTP + 双用户：
图片 / COS（不适用时写 N/A）：
生产部署与迁移：
生产真实微信验收 / 截图：
小程序上传：
体验版真机验收：
剩余阻塞：
提交与文档归档：
```

## 5. 当前里程碑

### 菜单 / 今天吃什么

- ✅ 后端 CRUD、搜索、分页、空间权限、幂等、乐观锁和软删除。
- ✅ 人份调整、食材备齐 / 取消、首页摘要。
- ✅ 私有 COS 上传、签名展示、替换和移除。
- ✅ 生产迁移、HTTPS 接口、写入与回读复验。
- ✅ 2026-11-01 使用生产真实微信会话完成前端 `uploadImage → wx.uploadFile → 私有 COS → 保存菜谱 → 列表展示`；另验证图片替换、移除、创建幂等和软删除。
- ✅ 生产截图：`shots/menu-cos-ui-upload-vwlsjai.png`、`shots/menu-cos-ui-saved-vwlsjai.png`、`shots/menu-cos-production-list-vwlkubr.png`、`shots/menu-cos-production-detail-vwlkubr.png`。
- ✅ 新增可重复生产验收脚本 `npm run verify:production-menu-ui`，本次再次通过真实微信会话、私有 COS 上传、保存回读、签名图片 `200 image/jpeg` 和软删除清理。
- ✅ 本次生产截图：`shots/production-menu-ui-form-empty.png`、`shots/production-menu-ui-form-uploaded.png`、`shots/production-menu-ui-list-loaded.png`、`shots/production-menu-ui-detail-loaded.png`。
- ✅ 前端类型检查和 178 项自动化测试通过。
- ✅ 小程序 `1.9.0` 已上传微信后台。
- ✅ 菜单能力已包含在 `1.10.0` 体验版构建中。
- ⏳ 在微信公众平台设为体验版，并完成真机登录、上传、多人冲突和弱网恢复验收。

### 宠物照护

- ✅ 后端档案、体重、日常、事件、月历、用品、空间权限、幂等、乐观锁和软删除。
- ✅ 私有 COS 头像上传、签名展示、替换与失败回退插画。
- ✅ 前端 Demo / HTTP 双模式、首页摘要、加载态、错误态和冲突恢复。
- ✅ MySQL 业务日期统一返回 `YYYY-MM-DD`，并增加仓储回归测试。
- ✅ Go 全量测试、`go vet`、生产部署、HTTPS 健康检查通过。
- ✅ 周期照护支持疫苗 365 天、洗护 30 天、体内驱虫 90 天、体外驱虫 30 天，周期可调整为 1–3650 天。
- ✅ 周期事件只提交 `recurrenceDays` 时，后端按 `occurredOn + recurrenceDays` 自动生成 `nextOn`；编辑时保留 `If-Match` 乐观锁。
- ✅ 照护卡片“今天完成一次”会新建当天事件，并继承当前自定义周期推进下次日期。
- ✅ 本地真实 HTTP UI 自动化覆盖 30 天默认值、45 天创建、60 天编辑、版本从 1 到 2、完成一次、自动推算、四张周期卡、事件详情、月历、用品、首页动态和私有 COS 头像。
- ✅ 档案删除使用事务软删除宠物、照护事件和用品，要求 `If-Match` 与幂等键；版本冲突返回 `409`，无权或不存在返回 `404`。
- ✅ 删除当前宠物后自动切换到剩余宠物；删除最后一只后进入空态，刷新不会重新 seed 演示数据。
- ✅ 新增 `npm run verify:production-pet-ui`，真实微信会话完成页面创建两只临时宠物、私有 COS 头像、体重、日常、45 天周期照护、用品、首页摘要、两次删除和 finally 兜底清理。
- ✅ 前端类型检查、35 个测试文件 / 204 项测试通过；Go 全量测试与 `go vet` 通过。
- ✅ 后端提交 `439381d` 已部署生产且删除路由 `401` 验证通过；`healthz / readyz` 正常。
- ✅ 生产截图：`shots/production-pet-ui-profile-empty.png`、`shots/production-pet-ui-profile-avatar.png`、`shots/production-pet-ui-care.png`、`shots/production-pet-ui-supplies.png`、`shots/production-pet-ui-home.png`、`shots/production-pet-ui-profile-deleted-switched.png`、`shots/production-pet-ui-profile-final-empty.png`。
- ✅ 前端提交 `0e155f4` 已推送，`1.14.0` 已上传微信后台，包体 `1,832,112 Byte`（约 1.7 MB）。
- ⏳ 在公众平台设置 `1.14.0` 体验版，完成真机弱网、周期照护、图片和双人共享验收。

### 家庭库存

- ✅ 后端 CRUD、状态流转、历史筛选、软删除、空间权限、幂等和乐观锁均已完成。
- ✅ MySQL `DECIMAL(9,3)` 数量在服务层、仓储层和 HTTP 响应统一规范为 `1`、`2.5` 等外部格式，不再向页面泄露 `1.000`。
- ✅ 库存页首次加载节流改为页面实例级，快速重开页面不会共享模块级时间戳而永久停留在加载态。
- ✅ 库存详情更新时间统一按上海时区格式化为 `M月D日 HH:mm`，不再直接显示 ISO 字符串。
- ✅ 新增可重复生产验收脚本 `npm run verify:production-inventory-ui`，覆盖真实微信会话、页面创建三类库存、列表回读、筛选项、编辑、详情、用完、历史、恢复、首页摘要、页面软删除和 finally 兜底清理。
- ✅ 开发者工具连续 `reLaunch` 偶发 automation 超时；脚本增加断线重连与一次重试，避免验收工具不稳定造成假失败。
- ✅ 前端类型检查、35 个测试文件 / 206 项测试通过；Go 全量测试与 `go vet` 通过。
- ✅ 生产复验最终输出 `PRODUCTION INVENTORY UI VERIFICATION PASSED`，临时库存检查 `FINAL_LEFTOVERS []`。
- ✅ 生产截图：`shots/production-inventory-ui-form.png`、`shots/production-inventory-ui-list.png`、`shots/production-inventory-ui-filter.png`、`shots/production-inventory-ui-detail.png`、`shots/production-inventory-ui-history.png`、`shots/production-inventory-ui-home.png`。
- ✅ 前端提交 `1103bbf` 已推送，`1.15.0` 已上传微信后台，包体 `1,832,509 Byte`（约 1.7 MB）。
- ⏳ 在公众平台将 `1.15.0` 设为体验版，完成真机弱网、临期提醒边界与双人共享验收。

### 待办与小计划

- ✅ 旅行准备、小计划、健身 / 热量、今天吃什么和账单继续复用统一待办模型，不复制五套业务表；类型切换时按场景裁剪字段，避免残留无关数据。
- ✅ 旅行准备支持目的地、出发日期、备注和逐项准备清单；清单按顺序保存并去重，勾选准备项会递增父待办版本。
- ✅ 小计划支持预期待办日期、分类筛选、完成与重开；未设置日期显示“待安排”，已设置日期显示“按计划推进”。
- ✅ 健身 / 热量记录运动名称、时长和热量；今天吃什么记录餐次与备注；账单记录金额、购买地点和备注，创建后自动完成且不能重开。
- ✅ 日期统一按 `Asia/Shanghai` 自然日计算，覆盖今天、明天、逾期判断和展示，不依赖设备本地时区。
- ✅ 分类筛选的未完成数改为当前分类数量，进度卡统一使用“共同进度”，删除提示与软删除语义保持一致。
- ✅ 新增可重复生产验收脚本 `npm run verify:production-todo-ui`，覆盖真实微信会话下的五类页面创建、字段回读、筛选、编辑、完成 / 重开、准备项、账单规则、409 冲突恢复、摘要同步、页面软删除和 finally API 兜底清理。
- ✅ automation 增加断线重连；页面检查覆盖横向溢出并输出真实截图。
- ✅ 最终验证输出 `PRODUCTION TODO UI VERIFICATION PASSED` 与 `FINAL_LEFTOVERS []`：创建后总计 5 条、未完成 4 条、已完成 1 条；删除小计划后总计 4 条、未完成 3 条、已完成 1 条。
- ✅ 前端类型检查、36 个测试文件 / 210 项测试通过；本切片复用已部署待办后端，无需新增迁移。
- ✅ 生产截图：`shots/production-todo-ui-list.png`、`shots/production-todo-ui-travel-form.png`、`shots/production-todo-ui-fitness-form.png`、`shots/production-todo-ui-meal-form.png`、`shots/production-todo-ui-expense-form.png`、`shots/production-todo-ui-filter.png`、`shots/production-todo-ui-checklist.png`、`shots/production-todo-ui-conflict-recovered.png`。
- ✅ 前端提交 `9fc592a` 已推送；`1.16.0` 已上传微信后台，包体 `1,833,231 Byte`（约 1.7 MB）。
- ⏳ 在公众平台将 `1.16.0` 设为体验版，重点检查真机弱网、双人同时勾选准备项、旅行准备、账单共享和版本冲突恢复。

### 提醒与设置

- ✅ 后端新增 `t_reminder_settings`，按“空间 + 用户”隔离偏好。
- ✅ `GET /spaces/{spaceId}/reminder-settings` 首次读取懒创建默认设置；`PUT` 使用 `If-Match` 与 `Idempotency-Key`。
- ✅ 新增迁移 12：`t_reminder_subscriptions` 与 `t_reminder_deliveries`，已应用到生产 `db_popcorn_mp`。
- ✅ `GET/PUT /spaces/{spaceId}/reminder-subscription` 已实现；模板未配置时 GET 返回 `configured=false`，PUT 返回 `503 SUBSCRIPTION_NOT_CONFIGURED`。
- ✅ 微信订阅授权支持 `accept/reject/ban/filter`；`accept` 累加发送机会，发送成功才消费一次。
- ✅ 每日聚合 Worker 已接入启动流程，生产默认关闭；同一空间、用户、模板每天最多一条，失败 5 分钟后重试，最多 3 次，订阅失效时清零机会。
- ✅ 前端真实 `wx.requestSubscribeMessage` 授权、状态卡片、模板未配置降级、授权失败提示和错误重试已完成。
- ✅ 本地未配置与已配置两态 UI 自动化通过，截图见当前 Goal 状态。
- ✅ 前端类型检查、36 个测试文件 / 213 项测试通过；后端 `gofmt`、`go vet`、`go test`、`go test -race` 与 OpenAPI YAML 解析通过。
- ✅ 后端 `45382b8` 已提交、推送并部署生产；`healthz / readyz` 正常，迁移 12 已应用，生产 Worker 保持关闭。
- ✅ 生产真实微信会话验证：GET 返回 `configured=false`，页面显示“模板未配置 / 暂不可授权”；PUT `accept` 返回 `503 SUBSCRIPTION_NOT_CONFIGURED`，发送机会仍为 0。
- ✅ 新增可重复脚本 `npm run verify:production-reminder-ui`，同时检查生产 HTTPS、页面加载、同步状态、横向溢出和截图。
- ✅ 生产截图：`shots/production-reminder-ui-unconfigured.png`。
- ✅ 前端提交 `0523bf4` 已推送；`1.17.0` 已上传微信后台，包体 `1,840,159 Byte`（约 1.8 MB）。
- ⏳ 真实模板 ID 与字段 key 尚未提供，生产 Worker 保持关闭；真实微信授权和通知送达尚不能验收。
- ⏳ 在公众平台将 `1.17.0` 设为体验版，确认提醒页在真机上的标题、状态卡片和开关保存行为。

### 自定义底栏

- ✅ 后端新增 `t_app_tab_settings`，唯一键为 `(space_id, user_id)`，并以外键约束空间、用户和更新人；迁移版本升至 11。
- ✅ `GET /spaces/{spaceId}/app-tab-settings` 首次读取时懒创建默认配置 `slot2=pets`、`slot3=journal`，重复读取不会产生多行。
- ✅ `PUT /spaces/{spaceId}/app-tab-settings` 必须携带 `If-Match`，支持可选 `Idempotency-Key`；缺失前置条件返回 `428`，旧版本返回 `409 VERSION_CONFLICT`，相同幂等键重放首次结果。
- ✅ 两个入口不能重复，并校验允许的一级 / 二级功能 ID；非空间成员统一返回 `404`。
- ✅ 配置按“空间 + 用户”隔离：同一空间的成员互不覆盖，同一用户切换空间也不串配置。
- ✅ 资源 ID 使用新的 `z_xxxxxxxxxx` 前缀，符合统一短 ID 规范。
- ✅ 前端保留 Demo / HTTP 双模式；本机缓存键为 `popcorn_app_tab_config_v1:{spaceId}:{userId}`，并兼容旧版仅按用户 ID 保存的缓存。
- ✅ 页面先展示本机快照，再后台与空间同步；保存失败回退原配置，版本冲突自动载入服务端最新版本，弱网时底栏仍能立即渲染。
- ✅ 应用启动、登录 / 注册、设置页和个人中心共用同一套同步与读取逻辑，避免使用旧缓存键导致摘要不一致。
- ✅ 本地真实 HTTP + 开发者工具 UI 自动化全部通过，覆盖双用户、双空间、幂等、冲突、权限、设置保存、重开持久化、底栏跳转、个人中心摘要、错误态和重试。
- ✅ 截图：`shots/app-tabs-http-loaded.png`、`shots/app-tabs-http-saved.png`、`shots/app-tabs-http-home.png`、`shots/app-tabs-http-tab-navigation.png`、`shots/app-tabs-http-conflict-recovered.png`、`shots/app-tabs-http-error-state.png`、`shots/app-tabs-http-profile-summary.png`。
- ✅ 后端 `ab19ea3` 已部署生产，迁移 11、`t_app_tab_settings`、HTTPS 健康检查和新路由均已核验。
- ✅ 生产真实微信会话通过底栏读取、保存、清本机缓存后恢复、首页渲染与个人中心摘要；生产截图见本节顶部。
- ✅ 前端提交 `3f17308` 已推送；`1.13.0` 已上传微信后台，包体 `1,826,043 Byte`（约 1.7 MB）。
- ⏳ 下一步在公众平台设为体验版，完成真机跨设备、切空间和弱网验收。
- ℹ️ 本切片不涉及图片，因此没有 COS 上传或媒体清理；后续带图片的功能继续执行私有 COS 全链路。

### 私有 COS 用户媒体全链路

- ✅ 生产 `healthz / readyz` 正常，私有桶为 `popcorn-1302154647`（`ap-guangzhou`）。
- ✅ 统一路径继续使用 `popcorn/prod/media/spaces/{spaceId}/{mediaId}_display.jpg` 和 `..._thumb.jpg`；业务表只保存 `mediaId`。
- ✅ 菜单图片：小程序前端真实上传、签名展示、创建菜谱、幂等重放、回读、替换、移除、软删除全部通过。
- ✅ 生活记录图片：上传 `purpose=journal`、创建记录、列表与详情图片展示、幂等重放、软删除全部通过；截图为 `shots/journal-cos-production-list-vwlm85s.png`、`shots/journal-cos-production-detail-vwlm85s.png`。
- ✅ 新增可重复生产验收脚本 `npm run verify:production-journal-ui`：真实微信会话创建私密重要记录、上传图片、列表缩略图、详情原图、签名地址 `200 image/jpeg` 和软删除清理全部通过。
- ✅ 生活记录生产截图：`shots/production-journal-ui-form-empty.png`、`shots/production-journal-ui-form-uploaded.png`、`shots/production-journal-ui-list-loaded.png`、`shots/production-journal-ui-detail-loaded.png`。
- ✅ 宠物头像：上传 `purpose=avatar`、创建档案、列表回读和页面头像展示通过；截图 `shots/pet-cos-production-vwlp9ms.png`；验收宠物已软删除。
- ✅ display / thumb 两个签名地址均返回 `200 image/jpeg`，COS 主机为 `popcorn-1302154647.cos.ap-guangzhou.myqcloud.com`。
- ℹ️ 按当前设计，用户图片暂不物理删除；业务数据删除不清理 COS 对象，后续通过生命周期与恢复策略统一治理。


### 用户头像与账号资料

- ✅ 新增迁移 13 与 `t_users.avatar_media_id`，外键指向 `t_media_assets`；业务数据只保存 `mediaId`。
- ✅ `PUT /me` 支持“保留 / 清空 / 替换”三种语义，并校验媒体格式、`purpose=avatar`、未删除、本人上传及当前空间归属。
- ✅ 登录、`GET /session`、空间成员和邀请预览统一返回 `avatarMediaId`；服务端为私有 COS 媒体签发短时地址。
- ✅ 前端账号资料页支持选图、上传、预览、替换、移除和失败提示；登录检测页、个人中心、首页成员、空间成员及邀请页统一展示真实头像。
- ✅ 图片不可用或用户没有头像时回退昵称首字；Demo 模式同步持久化头像媒体元数据。
- ✅ 新增 `npm run verify:production-avatar-ui`，使用生产真实微信会话完成私有 COS 上传、签名展示、保存回读、替换、移除、重载回退和越权媒体引用拒绝；验收结束自动恢复原头像。
- ✅ 已完成头像接入后的个人中心空间卡片尺寸约束修复；重新生成并复核 `shots/production-avatar-ui-profile.png` 与 `shots/production-avatar-ui-profile-fallback.png`。
- ✅ 后端 `6e960c0` 已部署生产，迁移 13 已应用，`healthz / readyz` 正常。
- ✅ 前端 `1.18.0` 已上传微信后台，包体 `1,852,683 Byte`（约 1.8 MB）。
- ⏳ 待完成前端提交推送、设为体验版，以及真机上传、替换、移除和重进检查。

### 登录、空间与邀请

- ✅ 微信登录、账号资料、会话恢复、个人空间、共同空间和一次性邀请码已打通真实 HTTP 链路。
- ✅ 空间权限按服务端成员关系收口，非成员不可读取空间详情、成员和共享业务数据。
- ✅ 新增成员主动退出：`DELETE /spaces/{spaceId}/members/me`；owner 返回 `403`，非成员返回 `404`，成功返回 `204`。
- ✅ 前端在成员视角显示退出入口，退出后刷新 `/session` 并切回剩余空间；owner 不展示退出入口。
- ✅ 后端仓储、服务、HTTP 层测试与前端网关测试通过。
- ✅ B2 自动化已改为页面跳转后重新读取 `currentPage()`；双账号注册、邀请、共享、越权隔离、邀请码单次失效和成员退出均通过，验收账号与测试空间随后已清理。
- ✅ 后端 `bad7a30` 已发布到生产，`/healthz` 与 `/readyz` 通过；未鉴权访问退出接口返回 `401`，证明生产路由已生效。
- ✅ 小程序 `1.11.1` 已上传微信后台，包体 `1,810,587 Byte`（约 1.7 MB）；提交 `547c8de`。

### 下一阶段

当前先收口用户头像与账号资料：发布并上传 `1.18.0`，在公众平台设为体验版，完成真机上传、替换、移除和重进验收。头像门槛全部通过后，再按功能清单进入下一个功能。微信提醒订阅的真实模板发送仍作为独立外部阻塞保留，不把未验证的真实送达标记为完成。
