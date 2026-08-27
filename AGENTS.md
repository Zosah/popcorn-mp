# AGENTS.md

## 长期项目约束

- 所有回复、代码注释和项目文档使用中文。
- 开始设计或实现前，必须完整阅读 `docs/04-mvp-implementation-plan.md`；该文件是当前 0→1 实施与部署的统一基线。
- 本项目本地开发不依赖 Docker，不得把安装 Docker 作为前置条件。
- 后端使用项目级 Go 工具链，不升级或改写系统全局 Go 版本。
- MVP 不依赖 TencentDB、TCR、Redis、消息队列或 Kubernetes。
- 架构决策发生变化时，必须同步更新 `docs/04-mvp-implementation-plan.md`，不能只保留在对话中。
- 不得覆盖用户对 `project.config.json` 和 `project.private.config.json` 的本地修改。
