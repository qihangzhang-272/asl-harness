---
name: asl-environment
description: 当用户要检查个人 ASL 工作环境、刷新能力地图、切换 Mode、投影到 Codex App 或 Claude Code，或导出 DeepSeek Agent Preset 时使用
---
# ASL Environment Host

这是宿主管理 Skill，不是业务编排器。它只调用 `asl-harness` 的确定性命令；用户的具体 Goal 仍由当前 Host 在 Mode 能力面内直接完成。

## 使用方法

1. 找到用户指定的 Personal Harness Environment；没有明确路径时，只从当前项目及其父目录查找包含 `WORKSPACE.md`、`PROFILE.md`、`skills/`、`modes/` 的目录，不进行全盘扫描。
2. 先运行 `asl-harness workspace.validate --workspace <environment>`，向用户报告真实 Skill、Mode 和能力视图状态。
3. 能力视图过期且用户正在维护 Environment 时，运行 `workspace.view.sync`；普通业务 Goal 不因视图过期被阻断。
4. 用户明确选择 Mode 时直接使用；需要根据 Goal 判断且只有一个合理 Mode 时可以选择，存在实质歧义时只问一个简短问题。
5. 对 Codex App 使用 `host.project --host-id codex-app`；对 Claude Code 使用 `host.project --host-id claude-code`；对 DeepSeek 项目使用 `deepseek-harness`。
6. DeepSeek 长期 Mode 需要 Agent Preset 时，要求一个已知能启动的 base preset 目录，再调用 `deepseek.preset.export`。不要把 Mode 映射成 Profile。
7. 投影后运行一次对应的 `host.verify`。来源漂移只提醒刷新；用户文件碰撞、路径越界或非法依赖必须停止写入并说明具体路径。

## 边界

- 不创建 Workflow、Run、第二 Agent、事件总线或隐藏路由。
- 不把外部 Prompt、MCP、Agent、API、模型或脚本直接写进 Mode；它们必须先成为正式本地 Skill。
- 不自动修改 `PROFILE.md`、Skill 或 Mode。只有用户明确要求长期演化，且当前 Mode 允许 `mutateEnvironment` 时才修改最小真源。
- 不覆盖项目原有 `AGENTS.md`、`CLAUDE.md` 或 Skill；Harness 只能维护自己的标记区域和能够证明属于它的投影。

## 完成标准

- 使用的是用户指定或可证明的同一份本地 Environment；
- 当前 Mode 的 Skill 根和依赖闭包通过校验；
- 宿主原生目录、规则块和投影清单已经生成并通过 `host.verify`；
- 没有把业务执行责任转移给 Harness，也没有覆盖用户自有文件；
- 未完成或仅结构验证的 DeepSeek 能力被如实说明。
