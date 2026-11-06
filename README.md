# 时刻见

> 我回来啦，把日子安放在一起。

时刻见是一个面向家庭、情侣、养宠家庭与亲密小圈子的共同生活管理小程序。

项目的核心不是单一的库存清单，而是一个可共享的生活空间：成员可以管理家庭物品和有效期、宠物档案、个人健康数据、菜谱与菜单、生活点滴，以及重要的图文记录。

当前仓库是微信小程序前端工程。配套 Go 服务端在 `popcorn-server` 仓库维护，双方通过版本化 HTTP API 通信。

## 当前状态

项目当前为前端 v1.0.0：以“家”为首页，采用「暖奶油手帐」视觉。登录注册、个人中心、真实头像、库存、宠物、菜单、生活点滴、重要记录、待办与小计划、提醒设置、自定义底栏、共同空间和邀请均有可操作界面。账号、资料、真实头像、会话、空间、库存、待办、生活记录、菜单、宠物照护、提醒设置和底栏偏好均已接入真实 Go API。当前支持 Demo/HTTP 双模式、空间权限、双账号共享、公开/私密可见范围、版本冲突处理、幂等写入、私有 COS 图片和网络异常兜底。v1.25.1 新增独立宠物创建页，修复连续原生弹窗导致创建请求不稳定的问题；宠物头像、基础档案与日期校验一并接入真实接口，当前宠物缓存改为按空间隔离，空列表会清理旧缓存。用户头像、宠物头像、菜单做饭模式、生活记录私密图片权限、待办与小计划等生产链路均已通过真实微信页面验收。微信订阅消息的真实模板与每日 Worker 尚未启用。`src/config/env.ts` 可切换 Demo 与 HTTP 模式，正式构建会关闭 Demo；一级导航使用自定义底部栏组件，可在个人中心配置第 2、3 个入口。

## 文档

- [产品设计与路线图](docs/01-product-design.md)：产品定位、功能边界、版本拆分、AI 与会员构思。
- [技术架构](docs/02-technical-architecture.md)：前后端边界、数据模型、认证授权、腾讯云与部署方案。
- [小程序前端蓝图](docs/03-miniprogram-blueprint.md)：页面结构、组件边界、状态管理、接口约定与第一阶段任务。
- [MVP 实施与部署基线](docs/04-mvp-implementation-plan.md)：0→1 范围、无 Docker 开发方式、服务器部署流程、前置资源和验收标准。该文档是当前实施的统一依据。
- [前端 MVP Demo 设计与运行](docs/05-frontend-demo.md)：Demo 1.6 的产品叙事、柔光玻璃生活手帐视觉、登录注册、真实空间与邀请、核心交互和验收方式。
- [阶段 1 代码设计](docs/06-stage1-code-design.md)：工程与契约阶段的接口裁决、字段类型、排序与游标、错误码、幂等、数据模型、前后端分层与实施切片。该文档是 `04` 基线的实现细化，不改变 MVP 范围。
- [前端 Demo v1 规划](docs/07-frontend-demo-v1-plan.md)：从单机预览升级为双人共用的范围裁剪、前端分层、设计系统、后端最小集、里程碑节奏与成本估算。当前阶段的执行依据。
- [功能交付 Goal 模式](docs/10-feature-delivery-goal.md)：逐功能从设计、API、数据库、后端、前端、私有 COS、生产部署、真实联调，到小程序上传与体验版真机验收的闭环门禁。
- [生活记录 1.22.0 真机验收](docs/11-journal-1.22.0-acceptance.md)：两个真实微信账号下的私密 / 共享图片、弱网恢复和图片替换 / 移除验收步骤。
- [功能清单与快捷配置设计](docs/12-feature-configuration-design.md)：功能分类、个人页入口、首页快捷入口、底栏拖拽配置、数据模型与实施切片。
- [当前能力清单（设计交接）](docs/13-current-capability-map.md)：当前已实现功能、对象关系、关键闭环与设计 Agent 输入。

## 技术决策

- 前端：微信原生小程序，使用 TypeScript、WXML 和 WXSS。
- 后端：独立 Go 模块化单体服务，不使用旧版微信云函数实现。
- 数据库：复用现有服务器 MySQL，使用独立数据库和独立账号。
- 文件存储：已有私有腾讯云 COS；业务表只保存 `mediaId`，服务端签发短时效访问 URL。
- 部署：不依赖 Docker。GitHub Actions 构建 Linux 二进制，服务器通过 systemd 运行 Go API，现有 Nginx 提供 HTTPS。

## 本地开发

使用微信开发者工具导入本目录即可运行 Demo。首次拉取后执行：

```bash
npm install
npm test
npm run typecheck
npm run verify:demo  # 需先开启开发者工具自动化端口
```

真实接口联调时，把 `src/config/env.ts` 临时切为 `demoMode: false`、`apiBaseUrl: http://127.0.0.1:8080`，启动本机 API 后执行：

```bash
npm run verify:http-b2
npm run verify:http-b3
npm run verify:http-b4
npm run verify:http-b5
npm run verify:http-reminders
npm run verify:http-app-tabs
npm run verify:http-menu-ui
npm run verify:production-menu-ui
npm run verify:production-journal-ui
npm run verify:production-pet-ui
npm run verify:production-inventory-ui
npm run verify:production-todo-ui
npm run verify:production-reminder-ui
npm run verify:production-avatar-ui
```

`b2` 用两个 mock 微信身份验证注册、会话、空间、邀请和单次失效；`b3` 验证双账号共享库存、前端创建编辑、版本冲突、状态流转、软删除恢复和摘要更新；`b4` 验证双账号共享待办、准备项勾选、完成/重开、账单自动完成、旧版本冲突恢复和软删除；`b5` 验证双账号共享生活记录、公开/私密可见范围、幂等写入、版本冲突和软删除；`reminders` 与 `app-tabs` 验证按“空间 + 用户”持久化的设置、乐观锁、幂等、错误态和开发者工具页面交互；`production-menu-ui`、`production-journal-ui`、`production-pet-ui`、`production-inventory-ui`、`production-todo-ui`、`production-reminder-ui` 与 `production-avatar-ui` 使用开发者工具中的真实微信生产会话，分别验收菜单、生活记录、宠物照护、家庭库存、待办与小计划、提醒订阅安全态和用户头像；头像验收覆盖私有 COS 上传、保存回读、替换、移除、无头像回退、跨空间引用拒绝和 finally 恢复。API 不在 8080 时可通过 `API_BASE_URL` 覆盖。联调完成后切回 `production` + `apiAuthMode: 'wechat'` 再编译。账号、资料、真实头像、空间、邀请、库存、待办、生活记录、菜单、宠物、提醒偏好和自定义底栏均已支持 HTTP 模式。小程序包由微信平台编译和发布，CDN 不用于承载小程序代码。

## 仓库边界

本仓库只维护小程序客户端。配套的 `popcorn-server` 仓库用于维护 Go API、数据库迁移、Linux 发布产物和 systemd 服务器部署配置。

## 版本记录

### v1.60.0

- 宠物最近状态改为横向标签，日常记录恢复时间线并支持长按编辑、删除。
- 用品分类标签收紧，用品名层级调整，图片支持查看、编辑、更换与移除。
- 全站图片统一选择原图、微信编辑后再上传；列表使用缩略图，预览统一读取展示图。
- 修复同空间成员无法查看生活记录多图和用户头像的媒体权限问题。

### v1.61.0

- 重新梳理宠物档案与护理信息架构：档案日期改为三项独立点选编辑并统一年月日展示。
- 成长记录保留出生、到家、绝育、疫苗和体重；护理独立为洗护、驱虫、就诊、生病和体检。
- 历史记录统一为日常式时间线，右侧展示距今间隔，超过十二个月自动补充年维度并支持长内容换行。

### v1.62.0

- 档案出生、到家、绝育三项补回图标并统一水平对齐；成长记录加入分类筛选和连续时间线。
- 就诊与体检从护理移入档案，历史生病记录统一显示为“就诊”；护理专注洗澡、内驱、外驱。
- 护理记录加入类型筛选，长间隔日期与距今时间保持单行展示。

### v1.62.1

- 宠物档案的出生、到家、绝育日期下增加截止今天的已过时长，便于直接查看陪伴与成长天数。

### v1.62.2

- 宠物档案日期时长去掉“已过”前缀，放大距今时长并增加三栏内部行距。
