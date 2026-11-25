# AGENTS.md

## 长期项目约束

- 所有回复、代码注释和项目文档使用中文。
- 开始设计或实现前，必须完整阅读 `docs/04-mvp-implementation-plan.md`；该文件是当前 0→1 实施与部署的统一基线。
- 本项目本地开发不依赖 Docker，不得把安装 Docker 作为前置条件。
- 后端使用项目级 Go 工具链，不升级或改写系统全局 Go 版本。
- MVP 不依赖 TencentDB、TCR、Redis、消息队列或 Kubernetes。
- 架构决策发生变化时，必须同步更新 `docs/04-mvp-implementation-plan.md`，不能只保留在对话中。
- 不得覆盖用户对 `project.config.json` 和 `project.private.config.json` 的本地修改。

## 视觉风格约束（用户明确要求，长期有效）

- **按钮与选中态不得使用纯黑、纯白或黑白配色**，那会显得像模板/机器生成，AI 味重。
- 可用色板：珊瑚 `--c-coral #c67d6d`、鼠尾草 `--c-sage #668478`、奶油 `--c-butter #c9a764`、暖纸色 `--c-paper-2 #f1ede7`，以及它们的浅色/渐变派生。
- 主按钮用珊瑚或鼠尾草渐变 + 白字；次级与步进器按钮用奶油底 + 深棕字；选中胶囊用珊瑚淡底 + 珊瑚字，不要用黑底白字。
- 新增组件前先看 `src/app.wxss` 的既有权衡，保持同一套暖色调，不要引入中性灰阶当强调色。

## 发布通知格式（用户指定，长期有效）

每次上传体验版后，按下面格式汇报，字段一个不能少：

```
[YYYY-MM-DD HH:mm] 时刻见 <version> 已上传。
1. 提交记录：<短 SHA> YYYY/MM/DD HH:mm
2. 本次改动：<修改摘要>
 - 改动1
 - 改动2
3. 测试结果：测试【通过/失败】，UI 测试【通过/失败】
```

约定：

- 时间取上海时区，第一位是发送时刻，`提交记录` 里的时间是 commit 时间
- `本次改动` 用 commit 主题作摘要，正文里有 bullet 就逐条列出，最多 3 条
- 测试口径：`npm run typecheck` + `npx vitest run` 都过才算【通过】；UI 测试指 miniprogram-automator 截图/交互验证，没跑就写【跳过】，不能写通过
- 已固化进 `scripts/release-experience.mjs` 的 `buildWeComNotice()`，企微通知走同一套文案
