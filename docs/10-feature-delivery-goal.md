# 功能交付 Goal 与闭环基线

> 目标：按 `popcorn-mp` 与 `popcorn-server` 现有架构，逐个功能完成产品设计、前后端实现、数据库迁移、图片与 COS、后端部署、真实环境联调、自动化验收和体验版上传。
>
> 最后更新：2026-11-01

## 0. 当前 Goal 状态

- 状态：进行中（active）。
- 当前焦点：把每个功能按“设计 → 前后端实现 → 数据库迁移 → 私有 COS → 生产部署与真实联调 → 自动化验收 → 体验版上传”推进到可验收状态。
- 本轮已完成：家庭库存生产真实微信全链路、库存数量格式修复、首次加载节流修复、详情时间格式化和可重复生产验收脚本。
- 当前切片：家庭库存从页面创建、列表回读、到期筛选、编辑、详情、用完 / 历史 / 恢复、首页摘要到软删除与兜底清理均已在生产真实微信会话闭环。
- 验证结果：Go 全量测试与 `go vet` 通过；前端类型检查、35 个测试文件 / 206 项测试通过；生产真实微信完成 3 类临时库存的页面 CRUD、摘要、生命周期和清理，最终临时数据残留为空。
- 发布状态：后端 `9b60052` 已部署生产，库存数量统一输出为 `1` / `2.5` 等规范格式；前端提交 `1103bbf` 已推送，`1.15.0` 已上传微信后台，包体 `1,832,509 Byte`（约 1.7 MB）。
- 生产复验：`npm run verify:production-inventory-ui` 已通过，截图 `shots/production-inventory-ui-form.png`、`shots/production-inventory-ui-list.png`、`shots/production-inventory-ui-filter.png`、`shots/production-inventory-ui-detail.png`、`shots/production-inventory-ui-history.png`、`shots/production-inventory-ui-home.png`。
- 下一门槛：在微信公众平台将 `1.15.0` 设为体验版，完成真机弱网、临期提醒边界与双人共享验收。

## 1. 执行原则

- 每次只推进一个功能，但必须端到端闭环，不把“页面能点”“接口能返回”当成完成。
- 前端保留 Demo / HTTP 双模式；真实模式不可绕过空间权限、幂等、乐观锁和软删除。
- 图片统一上传私有 COS，业务表只保存 `mediaId`；服务端签发短时效访问 URL。
- 数据库只使用 `db_popcorn_mp`，业务表统一 `t_` 前缀，变更通过向后兼容迁移发布。
- 生产发布保持“测试通过 -> 构建 -> 迁移 -> 原子切换 -> 健康检查 -> 失败回滚”。
- 每个版本必须有 Git 提交、实施记录、验收清单和可回滚的上传版本。
- 不覆盖用户本地配置、不提交密钥、Token、数据库密码或浏览器会话文件。

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
| 5 | 待办与小计划 | 🔄 五类场景生产联调完成，待真机验收 | 小计划、旅行准备、健身、今天吃什么、账单 |
| 6 | 登录、空间与邀请 | 🔄 `1.11.1` 体验版已上传 | 真机微信登录、邀请分享、成员退出和多用户复验 |
| 7 | 首页与底部导航 | 🔄 `1.13.0` 已上传，待真机验收 | 首页摘要、宠物动态、自定义底栏、本机快照与跨设备同步 |
| 8 | 提醒与设置 | 🔄 体验版已上传，待真机验收 | 偏好持久化、微信订阅消息和通知授权边界 |

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

### 旅行准备

- ✅ 复用统一待办模型，不单独复制一套旅行表；支持目的地、出发日期、备注和逐项准备清单。
- ✅ 旅行清单按顺序保存并去重；勾选准备项会递增父待办版本，继续使用空间权限、幂等、乐观锁和软删除。
- ✅ 生产环境用真实微信登录完成前端创建、列表读取、准备项勾选、服务端并发更新、409 冲突后自动恢复和软删除复验。
- ✅ 生产截图：`shots/travel-http-production.png`。
- ⏳ 纳入 `1.11.0` 体验版真机验收，重点检查多行清单、出发日期和双人同时勾选。

### 小计划、健身 / 热量、今天吃什么、账单

- ✅ 五类场景继续复用统一待办模型，分别验证字段裁剪，避免类型切换时残留无关字段。
- ✅ 小计划：生产创建、字段保存与页面完成。
- ✅ 健身 / 热量：运动名称、时长、热量保存与完成接口。
- ✅ 今天吃什么：餐次、备注、完成与本地推荐卡。
- ✅ 账单：金额、购买地点、备注；创建后自动完成，并进入支出汇总。
- ✅ 所有生产验收数据在完成后均通过软删除清理。
- ⏳ 纳入 `1.11.0` 体验版真机验收，重点检查输入体验、完成反馈、账单金额和跨成员共享。

### 提醒与设置

- ✅ 后端新增 `t_reminder_settings`，按“空间 + 用户”隔离偏好。
- ✅ `GET /spaces/{spaceId}/reminder-settings` 首次读取懒创建默认设置；`PUT` 使用 `If-Match` 与 `Idempotency-Key`。
- ✅ 生产迁移升至 goose version 9，服务运行 `a04d89e`，`healthz / readyz` 均正常。
- ✅ 前端新增 Gateway 分层、Demo / HTTP 双模式、加载态、错误态、重试和版本冲突自动恢复。
- ✅ 前端类型检查、34 个测试文件 / 194 项测试、真实 HTTP 与开发者工具 UI 自动化通过；代码提交 `2183b79`。
- ✅ 生产环境已用真实微信登录完成 HTTPS 读取、写入、幂等重放、409 冲突、428 前置条件和页面加载复验。
- ⏳ 微信订阅消息模板 ID、订阅授权和定时发送任务尚未配置；当前只保证偏好已持久化，不宣称会发送服务通知。
- ✅ `1.11.0` 体验版已上传，包体 `1,807,907 Byte`（约 1.7 MB）。
- ⏳ 在微信公众平台设为体验版，完成真机登录、提醒设置持久化和版本冲突复验。

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

家庭库存已完成生产真实微信全链路验收，统一了数量和时间对外格式，并补充可重复脚本与 automation 重连能力；`1.15.0` 已上传微信后台。下一步先在公众平台设为体验版并完成真机验收，再按功能清单继续为待办与小计划补完整生产 UI 切片；微信订阅消息仍需模板 ID 后才能进入发送验收。
