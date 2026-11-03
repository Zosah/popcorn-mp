# 时刻见｜小程序图标体系与设计 Agent 提示词

> 对应工程版本：v1.54.0
> 整理日期：2026-11-03
> 用途：交给视觉设计 Agent 产出小程序图标；本文只定义图标体系与提示词，不改页面功能。

## 0. 先看结论

这次不要做一套“每个图标都是独立插画”的图标墙，而是做一套真正能在小程序里长期使用的图标家族：

- **一级功能和底部导航**：统一双态，必须有 `inactive / active`。
- **二级功能、分类、对象、动作**：只做一个单色母版，运行时通过颜色变化适配场景。
- **主画板 24 × 24**，透明背景，圆润手绘线面风，常规线宽 1.8～2px。
- **最关键验收尺寸是 20px**：底部栏实际显示约 20px，20px 下看不清的细节都不应存在。
- **不靠文字、外框、彩色底板、渐变或投影来辨认图标**，图标本身必须一眼可读。
- **active 不是换一个含义**：轮廓不变，只增加主题色和局部轻填充；不能 inactive 是线稿、active 变成另一种物体。

建议设计 Agent 的交付顺序：

1. 先设计一级功能和底部导航，确认整套语言。
2. 再设计宠物高频日常，因为这里最容易出现含义重复。
3. 然后下厨、库存、记录等业务图标。
4. 最后补通用动作图标与整组验收。

---

## 1. 图标分层

### A. 一级功能与底部导航（必须双态）

底部导航固定项：

- 家
- 我的

底部导航可配置项：

- 库存
- 账单
- 下厨
- 旅行
- 健身
- 记录
- 待办
- 宠物

一级功能图标与底部导航图标共用同一套几何母版，避免首页、功能清单和底栏出现三个不同版本。

| 名称 | 用户看到的功能 | 建议语义 | 图标名 |
| --- | --- | --- | --- |
| 首页 | 家、共同生活摘要 | 小屋，带一点屋顶或门廊细节 | `nav-home` |
| 我的 | 账号、空间与设置 | 圆润人像，不用硬邦邦的头像框 | `nav-profile` |
| 库存 | 家里有什么、余量和临期 | 带标签的收纳盒或置物架，避免泛化成快递箱 | `feature-inventory` |
| 账单 | 花了多少、买了什么 | 钱包 + 小票，二者只保留一个主轮廓 | `feature-expense` |
| 下厨 | 今天吃什么、菜谱与做饭 | 带热气的锅或碗筷，突出“做饭”而非“餐厅” | `feature-menu` |
| 旅行 | 出行计划与随身清单 | 小飞机 + 一条轻路线，路线不能太细 | `feature-travel` |
| 健身 | 运动、时长与热量 | 圆角哑铃，避免过于硬朗的器械 | `feature-fitness` |
| 记录 | 生活点滴与重要资料 | 翻开的手账本 + 书签 | `feature-journal` |
| 待办 | TODO、标签与完成状态 | 两行清单 + 一个勾选点 | `feature-todo` |
| 宠物 | 宠物档案、照护与日常 | 爪印，但不能只是通用圆点爪，可加一个耳朵或小尾巴轮廓 | `feature-pets` |

### B. 功能分类（单态）

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 工具 | 收纳盒/工具抽屉 | `category-tool` |
| 生活 | 心形脉搏或小太阳 | `category-life` |
| 备忘 | 笔记本 + 书签 | `category-memo` |
| 成员 | 双人轮廓 + 小爪印，表达“一起生活” | `category-member` |

分类图标不参与底部导航，不强制做双态。

### C. 宠物功能（单态）

#### 宠物页签

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 日常 | 小太阳 + 饭碗，表达每天发生 | `pet-tab-daily` |
| 用品 | 带爪印的收纳袋 | `pet-tab-supplies` |
| 护理 | 心形 + 小十字或水滴，不要做成医疗急救 | `pet-tab-care` |
| 档案 | 宠物身份卡/折角档案页 | `pet-tab-profile` |

#### 日常记录

| 名称 | 必须区分的语义 | 图标名 |
| --- | --- | --- |
| 吃饭 | 装满食物的饭碗，不是袋装粮 | `pet-daily-meal` |
| 喝水 | 水碗 + 一条水波，不是单独水滴 | `pet-daily-water` |
| 便便 | 可爱的便便轮廓，不使用真实写实细节 | `pet-daily-stool` |
| 尿尿 | 水滴 + 小水洼，必须和“喝水”明显不同 | `pet-daily-urine` |
| 换猫砂 | 猫砂盆 + 小铲子 | `pet-daily-litter-change` |
| 换水 | 水碗 + 循环箭头，和“喝水”区分 | `pet-daily-water-change` |

#### 护理与档案事件

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 疫苗 | 小针筒 + 圆形保护盾 | `pet-care-vaccine` |
| 绝育 | 心形 + 细小缝合线，避免医疗器械感 | `pet-care-neuter` |
| 洗澡 | 花洒 + 两个气泡 | `pet-care-grooming` |
| 生病 | 温度计 + 轻微波纹 | `pet-care-illness` |
| 就诊 | 听诊器，不能和生病共用温度计 | `pet-care-visit` |
| 外出 | 小爪印 + 阳光/门，表达出门 | `pet-care-outing` |
| 体内驱虫 | 胶囊 + 向内的箭头或小胃形 | `pet-care-internal-deworm` |
| 体外驱虫 | 滴管 + 小虫/盾牌，表达体表防护 | `pet-care-external-deworm` |
| 生日 | 小蛋糕 + 蜡烛 | `pet-care-birthday` |
| 到家 | 小屋 + 爪印 | `pet-care-homecoming` |
| 体重 | 圆角体重秤 | `pet-metric-weight` |
| 月历 | 日历 + 爪印，不用普通日历替代 | `pet-action-calendar` |

#### 宠物用品分类

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 主粮 | 方形粮袋 + 少量颗粒 | `pet-supply-kibble` |
| 罐头 | 圆柱罐头 + 拉环 | `pet-supply-can` |
| 冻干 | 方形冻干块 + 雪花 | `pet-supply-freeze-dried` |
| 汤包 | 软包装 + 水波 | `pet-supply-soup` |
| 猫砂 | 猫砂袋 + 小铲子，不能和换猫砂完全同图 | `pet-supply-litter` |
| 自定义 | 标签/文件夹 + 小加号 | `pet-supply-custom` |

### D. 下厨（单态）

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 今天吃什么 | 餐桌 + 一盘食物 + 热气 | `menu-tab-eat` |
| 菜谱本 | 菜谱书 + 书签 | `menu-tab-recipes` |
| 肉类 | 肉排/骨头轮廓 | `menu-category-meat` |
| 菜类 | 一片叶菜 | `menu-category-vegetable` |
| 汤类 | 汤碗 + 热气 | `menu-category-soup` |
| 主食 | 米饭碗 | `menu-category-staple` |
| 其他 | 标签 + 三点 | `menu-category-other` |
| 早餐 | 太阳 + 小杯 | `menu-meal-breakfast` |
| 午餐 | 正午太阳 + 简餐盘 | `menu-meal-lunch` |
| 晚餐 | 月亮 + 小碗 | `menu-meal-dinner` |
| 加餐 | 小点心/水果 | `menu-meal-snack` |
| 已选菜谱 | 托盘 + 勾选 | `menu-status-selected` |
| 备菜中 | 砧板 + 小刀 | `menu-status-prep` |
| 做饭中 | 带热气的锅 | `menu-status-cooking` |
| 已吃完 | 空碗 + 勾选 | `menu-status-finished` |
| 看看怎么做 | 翻开的菜谱书 | `menu-action-view-recipe` |
| 新增菜谱 | 菜谱书 + 加号 | `menu-action-add-recipe` |
| 成品图/参考图 | 方形图片 + 小闪光，避免相机与相册混淆 | `menu-action-reference-image` |
| 食材 | 小篮子 + 一根胡萝卜 | `menu-object-ingredient` |

### E. 库存（单态）

#### 分类

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 食品 | 苹果或小餐盒，选更易识别的苹果 | `inventory-category-food` |
| 饮料 | 圆角瓶/杯 | `inventory-category-drink` |
| 冷冻 | 雪花 + 小冰块 | `inventory-category-frozen` |
| 调料 | 小调料瓶 | `inventory-category-seasoning` |
| 日用品 | 洗发水瓶/纸巾卷 | `inventory-category-daily` |
| 药品 | 胶囊 + 小药盒 | `inventory-category-medicine` |
| 宠物用品 | 粮袋 + 爪印 | `inventory-category-pet` |
| 其他 | 带圆点的标签 | `inventory-category-other` |

#### 位置

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 冰箱冷藏 | 打开的冰箱 + 水滴，内部不要画太多层 | `inventory-location-fridge` |
| 冰箱冷冻 | 打开的冰箱 + 雪花 | `inventory-location-freezer` |
| 厨房 | 小灶台/锅 | `inventory-location-kitchen` |
| 客厅 | 小沙发 | `inventory-location-living-room` |
| 卫生间 | 花洒 + 水滴 | `inventory-location-bathroom` |
| 储物间 | 两层置物架 | `inventory-location-storage` |
| 其他 | 小门或标签 | `inventory-location-other` |

#### 状态与动作

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 正在库存 | 盒子 + 勾选 | `inventory-status-active` |
| 临期 | 沙漏/时钟 + 小感叹号 | `inventory-status-expiring` |
| 已用完 | 空盒 + 勾选 | `inventory-status-consumed` |
| 已丢弃 | 垃圾桶 | `inventory-status-discarded` |
| 已归档 | 档案盒 | `inventory-status-archived` |
| 新增物品 | 盒子 + 加号 | `inventory-action-add` |
| 消耗一次 | 向下减少的刻度/减号 | `inventory-action-consume` |

### F. 旅行（单态）

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 出行计划 | 地图 + 图钉 + 小路线 | `travel-tab-plan` |
| 必备清单 | 行李箱 + 清单 | `travel-tab-packing` |
| 正在途中 | 飞机 + 虚线轨迹 | `travel-status-traveling` |
| 即将出发 | 日历 + 小飞机 | `travel-status-upcoming` |
| 走过的地方 | 地图图钉 + 小印章 | `travel-status-visited` |
| 新增行程 | 行李箱 + 加号 | `travel-action-add-trip` |
| 复制行程 | 两张错位卡片/复制箭头 | `travel-action-copy-trip` |
| 随身物品 | 小背包 | `travel-object-item` |
| 已带 | 背包 + 勾选 | `travel-status-packed` |
| 未带 | 背包 + 空心勾选框 | `travel-status-unpacked` |
| 目的地 | 地图图钉 | `travel-object-destination` |
| 出发/返回时间 | 时钟 + 小箭头 | `travel-object-time` |
| 加入清单 | 背包 + 加号 | `travel-action-add-item` |
| 移出清单 | 背包 + 减号 | `travel-action-remove-item` |

### G. 记录与待办（单态）

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 全部 | 两页叠放记录 | `journal-tab-all` |
| 生活点滴 | 笔 + 小照片 | `journal-tab-moments` |
| 重要记录 | 文件 + 书签 | `journal-tab-notes` |
| 居家资料 | 小屋 + 文件角 | `journal-note-home` |
| 健康资料 | 心形脉搏 + 文件角 | `journal-note-health` |
| 宠物资料 | 爪印 + 文件角 | `journal-note-pet` |
| 其他资料 | 文件夹 + 圆点 | `journal-note-other` |
| 私密 | 锁 | `journal-privacy-private` |
| 共享 | 两个人像 | `journal-privacy-shared` |
| 新增记录 | 纸张 + 笔 | `journal-action-add` |
| 添加图片 | 图片框 + 加号 | `journal-action-add-image` |
| 待办未完成 | 清单 + 空心勾选 | `todo-status-pending` |
| 待办已完成 | 清单 + 实心勾选 | `todo-status-done` |
| 标签 | 小标签 + 圆点 | `todo-object-tag` |
| 截止日期 | 日历 + 小时钟 | `todo-object-due-date` |
| 新增待办 | 清单 + 加号 | `todo-action-add` |

### H. 健身与账单（单态）

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 运动类型 | 跑鞋/哑铃，避免和一级“健身”完全一样 | `fitness-object-exercise` |
| 运动时长 | 秒表 | `fitness-metric-duration` |
| 消耗热量 | 小火苗 + 圆润火焰 | `fitness-metric-calories` |
| 完成一次运动 | 哑铃 + 勾选 | `fitness-status-done` |
| 金额 | 硬币 + 小票 | `expense-object-amount` |
| 商家 | 小店遮阳棚 | `expense-object-merchant` |
| 买了什么 | 购物袋 | `expense-object-purchase` |
| 月度支出 | 日历 + 小柱状图 | `expense-metric-monthly` |
| 新增账单 | 小票 + 加号 | `expense-action-add` |

### I. 通用对象、状态与动作（单态）

| 名称 | 建议语义 | 图标名 |
| --- | --- | --- |
| 空间 | 小屋 + 两个人像 | `system-space` |
| 成员 | 两个人像 | `system-members` |
| 邀请 | 人像 + 加号或链接 | `system-invite` |
| 设置 | 圆角齿轮 | `system-settings` |
| 功能配置 | 四宫格 + 拖动点 | `system-feature-config` |
| 新增 | 加号 | `system-add` |
| 完成/正确 | 勾 | `system-check` |
| 关闭 | 圆角叉 | `system-close` |
| 返回 | 左箭头 | `system-back` |
| 展开 | 双层圆角下箭头，不能太细 | `system-expand` |
| 更多 | 横向三点 | `system-more` |
| 拖动 | 六点拖动手柄 | `system-drag` |
| 搜索 | 放大镜 | `system-search` |
| 筛选 | 三条渐短滑杆 | `system-filter` |
| 日历 | 日历 | `system-calendar` |
| 时间 | 时钟 | `system-clock` |
| 相机 | 圆角相机 | `system-camera` |
| 图片 | 山与太阳 | `system-image` |
| 编辑 | 铅笔 | `system-edit` |
| 删除 | 垃圾桶 | `system-delete` |
| 成功 | 圆形勾选 | `system-success` |
| 提醒 | 铃铛 | `system-bell` |
| 警告 | 圆角感叹号 | `system-alert` |
| 锁 | 锁 | `system-lock` |
| 刷新/重置 | 环形箭头 | `system-refresh` |
| 火候 | 火苗 | `system-flame` |

---

## 2. 双态规则

### 一级功能与底部导航

每个图标交付两个状态：

- `*-inactive`：单色线性，低饱和，对比安静。
- `*-active`：完全相同的轮廓，使用深鼠尾草绿描边 + 浅鼠尾草局部填充。

建议颜色：

| 角色 | 色值 |
| --- | --- |
| inactive 描边 | `#68706A` |
| active 描边 | `#3D5C4A` |
| active 填充 | `#E2EEE9` |
| 需要中和的浅填充 | `#F3F8F5` |
| 危险动作 | `#A8564E` |

active 规则：

- 只改变线宽、颜色和局部填充，不换图标含义。
- 填充面积控制在图形总面积的 20%～35%，避免在小底栏里变成一块实心色块。
- 不额外添加圆点、徽标、光晕或装饰线。
- 20px 下仍能看出与 inactive 相同的轮廓。

### 二级功能与动作

- 只交付一个 `currentColor` 单色母版。
- 除底部导航外，页面内图标默认直接裸显，不额外套彩色/白色圆角底板。
- 底栏如需选中底座，只由底栏容器负责，不画进图标。
- 危险图标的几何形状不变，运行时换成危险色。

---

## 3. 尺寸与导出规范

### 设计网格

- 主画板：`24 × 24`。
- 有效视觉安全区：四周至少 `2px`。
- 视觉内容建议控制在 `20 × 20` 内。
- 常规线宽：`1.8～2px`。
- 最细线：不小于 `1.5px`。
- 圆角、端点：圆头端点、圆角连接。
- 图形重心：视觉居中，不要依赖数学边界强行居中。
- 同一组图标的光学面积接近，避免有的很满、有的很空。

### 实际显示尺寸

- 底部导航：约 `20px`，最关键验收尺寸。
- 页面内联：约 `16～20px`。
- 卡片/功能入口：约 `24～32px`。
- 分类与空状态：约 `32～40px`。

### 导出

- 母版：透明背景 SVG。
- 小程序备用：透明 PNG，`96 × 96`，用于现有 `line-icon` 组件缩放。
- 预览：必须同时展示 `20px / 24px / 32px` 三个尺寸。
- 文件名使用小写英文和连字符。
- 不把文字、不同色底板、投影、渐变、纹理烘焙进图标。

---

## 4. 可直接复制给设计 Agent 的总提示词

```text
你是一位擅长移动端小尺寸图标系统的视觉设计师。请为微信小程序「时刻见」设计一套统一图标家族。

【产品气质】
「时刻见」是面向情侣、夫妻、室友和小家庭的共同生活小程序。它不是效率后台，而是一起维护的生活手账。
视觉关键词：暖奶油纸底、低饱和鼠尾草绿、浅粉、珊瑚陶土、圆润、温柔、手绘感、轻生活感。
图标要比通用线性图标多一点温度和可爱感，但不能变成彩色 emoji、卡通贴纸或复杂插画。

【统一画风】
- 圆润手绘线面图标：以清晰轮廓为主，局部可有很轻的色块填充。
- 线条圆头、圆角连接；转折柔和但不软塌。
- 24 × 24 透明画板，四周至少留 2px 安全区。
- 常规线宽 1.8～2px，最细不低于 1.5px。
- 同一套图标保持一致的光学面积、圆角半径、留白和视觉重心。
- 不依赖文字、外框、彩色圆角底、渐变、投影、纹理、复杂高光或细小装饰。
- 不用真实写实的动物、排泄物或食物照片感。
- 不能把通用 Lucide 图标原样复制；可以借鉴基础语义，但要有自己的圆润手绘气质。

【颜色】
- 单态图标使用 currentColor；母版默认深灰绿 #3D5C4A。
- 底部导航和一级功能需要 inactive / active 两态：
  - inactive：单色线稿，颜色 #68706A。
  - active：同一轮廓，#3D5C4A 描边，加 20%～35% 的 #E2EEE9 局部轻填充。
  - active 不能换成另一个物体，不能加外圈、徽标或光晕。
- 页面容器和浅色背景由 UI 负责，不画进图标文件。

【小尺寸硬标准】
- 每个图标必须在 20px 下仍然一眼可辨，这是底部导航的真实尺寸。
- 不要依赖内部文字、1px 以下细节、复杂透视、过多线条或颜色差异来表达含义。
- 同类图标之间必须能快速区分，例如：吃饭 / 主粮、喝水 / 换水、尿尿 / 便便、体内驱虫 / 体外驱虫、洗澡 / 换水。
- 如果两个概念容易混，优先改变主物体轮廓，而不是只加一个小符号。

【交付】
- 提供独立透明 SVG；同时给 96 × 96 透明 PNG。
- 每个图标提供 20px / 24px / 32px 的预览。
- 一级功能与底栏图标建立组件和 State=Inactive/Active 变体。
- 命名使用小写英文连字符，例如 feature-inventory、nav-home-active。
- 所有图标放在一张分组清晰的预览板上，组名使用中文。
- 不要只给一张模糊的总览图，必须能导出单个图标。
```

---

## 5. 分批提示词

> 用法：先发送上面的“总提示词”，确认风格方向后，每轮发送一批。每批都沿用上一轮确定的线宽、圆角、留白和光学重量。

### 第 1 批：底部导航与一级功能双态

```text
先设计第 1 批：底部导航与一级功能图标，全部需要 inactive / active 双态。

固定项：
- nav-home：小屋，带一点门廊或屋顶温度
- nav-profile：圆润人像

可配置功能：
- feature-inventory：带标签的收纳盒/置物架
- feature-expense：钱包 + 小票
- feature-menu：带热气的锅或碗
- feature-travel：小飞机 + 轻路线
- feature-fitness：圆角哑铃
- feature-journal：翻开的手账本 + 书签
- feature-todo：清单 + 勾选点
- feature-pets：有耳朵或小尾巴轮廓的爪印

另交付四个单态分类图标：
- category-tool
- category-life
- category-memo
- category-member

要求：
- 先在 20px 下检查识别度。
- active 与 inactive 必须同轮廓，只改变线宽、颜色和局部轻填充。
- 不要做成同一个圆角方块里塞不同符号；图标本身要独立成立。
- 请同时放在模拟的浅色毛玻璃底部栏里预览。
```

### 第 2 批：宠物日常高频

```text
设计第 2 批：宠物日常记录图标，全部为单态线性/轻填充图标。

- pet-daily-meal：装满食物的饭碗
- pet-daily-water：水碗 + 一条水波
- pet-daily-stool：可爱的便便轮廓
- pet-daily-urine：水滴 + 小水洼
- pet-daily-litter-change：猫砂盆 + 小铲子
- pet-daily-water-change：水碗 + 循环箭头

硬要求：
- 喝水、尿尿、换水三个不能只靠颜色区分。
- 吃饭必须和主粮袋区分。
- 便便要可爱但不写实、不低俗。
- 20px 下仍然能看出各自主物体。
```

### 第 3 批：宠物护理、档案与用品

```text
设计第 3 批：宠物护理、档案和用品分类图标。

护理与档案：
- pet-care-vaccine：针筒 + 轻盾牌
- pet-care-neuter：心形 + 细小缝合线
- pet-care-grooming：花洒 + 气泡
- pet-care-illness：温度计
- pet-care-visit：听诊器
- pet-care-outing：爪印 + 阳光/门
- pet-care-internal-deworm：胶囊 + 向内箭头
- pet-care-external-deworm：滴管 + 小虫/盾牌
- pet-care-birthday：小蛋糕 + 蜡烛
- pet-care-homecoming：小屋 + 爪印
- pet-metric-weight：圆角体重秤
- pet-action-calendar：日历 + 爪印

用品：
- pet-supply-kibble：方形粮袋 + 颗粒
- pet-supply-can：罐头 + 拉环
- pet-supply-freeze-dried：冻干块 + 雪花
- pet-supply-soup：软包装 + 水波
- pet-supply-litter：猫砂袋 + 小铲子
- pet-supply-custom：标签/文件夹 + 加号

硬要求：
- 生病和就诊必须明显不同。
- 体内驱虫和体外驱虫必须明显不同。
- 主粮、罐头、冻干、汤包要能一眼区分，不能都画成碗或袋子。
- 洗澡和换水不能共用花洒/水滴语义。
```

### 第 4 批：下厨

```text
设计第 4 批：下厨功能图标，全部为单态图标。

页签：
- menu-tab-eat：餐桌 + 一盘食物 + 热气
- menu-tab-recipes：菜谱书 + 书签

分类：
- menu-category-meat：肉排/骨头
- menu-category-vegetable：叶菜
- menu-category-soup：汤碗 + 热气
- menu-category-staple：米饭碗
- menu-category-other：标签 + 三点

餐次：
- menu-meal-breakfast：太阳 + 小杯
- menu-meal-lunch：正午太阳 + 简餐盘
- menu-meal-dinner：月亮 + 小碗
- menu-meal-snack：小点心/水果

状态与动作：
- menu-status-selected：托盘 + 勾选
- menu-status-prep：砧板 + 小刀
- menu-status-cooking：带热气的锅
- menu-status-finished：空碗 + 勾选
- menu-action-view-recipe：翻开的菜谱书
- menu-action-add-recipe：菜谱书 + 加号
- menu-action-reference-image：方形图片 + 小闪光
- menu-object-ingredient：小篮子 + 胡萝卜

硬要求：
- 今天吃什么、做饭中、汤类不能都变成同一个“冒热气的碗”。
- 通过主物体区分：餐桌、锅、汤碗、菜谱书、砧板。
- 餐次图标在小尺寸下允许简化，但不能让人误认成功能按钮。
```

### 第 5 批：库存

```text
设计第 5 批：库存分类、位置、状态和动作图标，全部为单态图标。

分类：
- inventory-category-food：苹果/食品
- inventory-category-drink：圆角瓶
- inventory-category-frozen：雪花 + 冰块
- inventory-category-seasoning：小调料瓶
- inventory-category-daily：洗护瓶/纸巾卷
- inventory-category-medicine：胶囊 + 药盒
- inventory-category-pet：粮袋 + 爪印
- inventory-category-other：标签 + 圆点

位置：
- inventory-location-fridge：打开的冰箱 + 水滴
- inventory-location-freezer：打开的冰箱 + 雪花
- inventory-location-kitchen：小灶台/锅
- inventory-location-living-room：小沙发
- inventory-location-bathroom：花洒 + 水滴
- inventory-location-storage：两层置物架
- inventory-location-other：小门/标签

状态与动作：
- inventory-status-active：盒子 + 勾选
- inventory-status-expiring：沙漏/时钟 + 小感叹号
- inventory-status-consumed：空盒 + 勾选
- inventory-status-discarded：垃圾桶
- inventory-status-archived：档案盒
- inventory-action-add：盒子 + 加号
- inventory-action-consume：向下刻度/减号

硬要求：
- 冷藏和冷冻只通过明确的冰箱内部元素区分，不能只靠颜色。
- 食品、日用品、药品、宠物用品必须一眼区分。
- 状态图标优先使用轮廓变化，不要给每个状态都套同一个盒子。
```

### 第 6 批：旅行、记录、待办、健身、账单

```text
设计第 6 批：生活与备忘功能图标，全部为单态图标。

旅行：
- travel-tab-plan：地图 + 图钉 + 路线
- travel-tab-packing：行李箱 + 清单
- travel-status-traveling：飞机 + 虚线轨迹
- travel-status-upcoming：日历 + 小飞机
- travel-status-visited：地图图钉 + 小印章
- travel-action-add-trip：行李箱 + 加号
- travel-action-copy-trip：两张错位卡片/复制箭头
- travel-object-item：小背包
- travel-status-packed：背包 + 勾选
- travel-status-unpacked：背包 + 空心勾选框
- travel-object-destination：地图图钉
- travel-object-time：时钟 + 小箭头
- travel-action-add-item：背包 + 加号
- travel-action-remove-item：背包 + 减号

记录：
- journal-tab-all：两页叠放记录
- journal-tab-moments：笔 + 小照片
- journal-tab-notes：文件 + 书签
- journal-note-home：小屋 + 文件角
- journal-note-health：心形脉搏 + 文件角
- journal-note-pet：爪印 + 文件角
- journal-note-other：文件夹 + 圆点
- journal-privacy-private：锁
- journal-privacy-shared：两个人像
- journal-action-add：纸张 + 笔
- journal-action-add-image：图片框 + 加号

待办：
- todo-status-pending：清单 + 空心勾选
- todo-status-done：清单 + 实心勾选
- todo-object-tag：小标签 + 圆点
- todo-object-due-date：日历 + 小时钟
- todo-action-add：清单 + 加号

健身：
- fitness-object-exercise：跑鞋/小哑铃
- fitness-metric-duration：秒表
- fitness-metric-calories：圆润火苗
- fitness-status-done：哑铃 + 勾选

账单：
- expense-object-amount：硬币 + 小票
- expense-object-merchant：小店遮阳棚
- expense-object-purchase：购物袋
- expense-metric-monthly：日历 + 小柱状图
- expense-action-add：小票 + 加号

硬要求：
- 同一批里不能出现两个视觉几乎一样的背包、文件、日历。
- 通用日历可以重复使用 system-calendar；业务图标只在确有必要时加小元素变化。
```

### 第 7 批：系统对象与通用动作

```text
设计第 7 批：通用对象、状态和动作图标，全部为单态。

- system-space：小屋 + 两个人像
- system-members：两个人像
- system-invite：人像 + 加号/链接
- system-settings：圆角齿轮
- system-feature-config：四宫格 + 拖动点
- system-add：加号
- system-check：勾
- system-close：圆角叉
- system-back：左箭头
- system-expand：双层圆角下箭头
- system-more：横向三点
- system-drag：六点拖动手柄
- system-search：放大镜
- system-filter：三条渐短滑杆
- system-calendar：日历
- system-clock：时钟
- system-camera：圆角相机
- system-image：山与太阳
- system-edit：铅笔
- system-delete：垃圾桶
- system-success：圆形勾选
- system-bell：铃铛
- system-alert：圆角感叹号
- system-lock：锁
- system-refresh：环形箭头
- system-flame：火苗

硬要求：
- 这是使用频率最高的一批，必须最容易识别。
- 展开箭头不要又细又小，也不要和返回箭头混成一套硬直线。
- 设置、配置、筛选必须明显不同。
- 通用图标不要加多余的小装饰，避免 20px 下变脏。
```

---

## 6. 整组验收提示词

```text
请对整套图标做一次严格验收，不要只给风格评价，要逐项指出问题并直接修正。

验收项：
1. 把每个图标缩到 20px，检查是否还能一眼识别；无法识别的请简化或重画。
2. 检查 inactive / active 是否完全同轮廓；active 是否只是颜色和局部填充变化。
3. 检查全套线宽、圆角、视觉重心和光学面积是否一致。
4. 找出隐喻重复：例如主粮/罐头/冻干/汤包、喝水/尿尿/换水、体内/体外驱虫、洗澡/换水、生病/就诊。
5. 检查是否有图标依赖文字、彩色底板、阴影、渐变、细纹理或过多内部线条。
6. 检查危险动作是否容易误触，删除图标不能和关闭、减少、归档混淆。
7. 检查图标是否过度通用、像直接复制的 Lucide；保留可读性的同时增加圆润手绘温度。
8. 给出最终预览板：按“底部导航 / 一级功能 / 宠物 / 下厨 / 库存 / 旅行 / 记录待办 / 健身账单 / 通用动作”分组，并同时展示 20px、24px、32px。
9. 对每个需要双态的图标，给出 State=Inactive / State=Active 两个可直接导出的 SVG。
10. 最终只保留一套命名、一个线宽体系和一个色彩规则，不要在一套图标里混入多种画风。
```

---

## 7. 交付文件命名建议

```text
nav-home.svg
nav-home-active.svg
feature-inventory.svg
feature-inventory-active.svg
pet-daily-meal.svg
pet-care-external-deworm.svg
menu-status-prep.svg
inventory-category-medicine.svg
system-add.svg
```

如果输出 PNG：

```text
nav-home-inactive@4x.png
nav-home-active@4x.png
pet-daily-meal@4x.png
```

建议 `@4x` 对应 `96 × 96`，页面中仍按 20～32px 使用；不要因为 PNG 是 96px 就往图标里添加只有 96px 才看得见的细节。

---

## 7.1 本批落地记录

- v1.52.0 已接入第一批 10 枚真双色相 active 图标：首页、我的、库存、账单、下厨、旅行、健身、记录、待办、宠物。
- active 使用主色 + 第二色相做局部填充；inactive 保持单色，不增加圆形底板、外框、渐变或阴影。
- 图标母版位于 `assets/shikejian-icons/`，执行 `npm run icons:build` 生成 `src/images/icons/` 下的 active / inactive PNG。
- v1.53.0 放大首页快捷入口、我的功能卡、全部功能与功能配置中的图标，并将宠物日常、用品、护理、档案的二级入口图标接入实际页面；底部导航尺寸保持不变。
- v1.54.0 根据实际页面反馈回调图标尺度：一级功能图标保持醒目但不压过文字，二级 Tab、时间线和列表图标缩小到正文与标题之间的视觉层级。

## 8. 最小交付顺序

如果设计 Agent 一次无法完成全部图标，按以下顺序交付：

1. 底部导航 + 8 个一级功能双态。
2. 宠物日常 6 个 + 护理 8 个。
3. 下厨 18 个。
4. 库存分类与位置 15 个。
5. 记录、待办、旅行、健身、账单。
6. 通用动作图标。

这样即使后面暂停，也能先替换底部栏和核心功能入口，不影响当前体验版继续迭代。
