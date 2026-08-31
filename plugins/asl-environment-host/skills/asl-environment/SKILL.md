---
name: asl-environment
description: 当用户要初始化、检查、维护或演化 ASL Environment，接入外部能力，修改 Skill 或 Mode，刷新能力地图，切换宿主投影，或导出 DeepSeek Agent Preset 时使用
---
# ASL Environment Host

这是 Harness System 的宿主管理 Skill，不是业务 Mode、业务编排器或后台 Agent。它把 Environment Steward、Environment Access 与确定性校验收敛在一个入口；用户的具体 Goal 仍由当前 Host 在业务 Mode 的能力面内直接完成。

## 读取工作环境

1. 使用用户指定的 Environment；没有明确路径时，只从当前项目及父目录查找同时包含 `WORKSPACE.md`、`PROFILE.md`、`skills/`、`modes/`、`candidates/`、`trials/`、`feedback/` 与 `archive/` 的目录，不做全盘扫描。
2. 先运行 `asl-harness state --workspace <environment>` 获取紧凑状态；结构维护前再运行 `workspace.validate`。常驻只读取精简 `PROFILE.md`、当前 Mode 边界和能力摘要；完整 Skill、Case、Feedback、Archive 与 Git 历史只在当前目标需要时按需读取。
3. `WORKSPACE.md` 视图过期只是一条维护信号。维护任务可以运行 `workspace.view.sync`；普通业务 Goal 不因此被阻断。

## 选择与投影 Mode

1. Mode 是会反复进入的广域工作状态，只选择完整 Skill 根，不保存顺序、用户、revision、plane 或维护权限。
2. 用户明确选择时直接使用。只有一个合理 Mode 时当前 Host 可以判断；实质歧义会改变结果时只问一个简短问题。
3. Codex App、Claude Code 与 DeepSeek 项目分别使用 `host.project --host-id codex-app|claude-code|deepseek-harness`，随后运行同宿主的 `host.verify`。
4. DeepSeek 长期工作状态使用 `deepseek.preset.export` 从已知可启动的 base preset 复制并替换 persona 与 Skill 根，随后运行 `deepseek.preset.verify`。Mode 映射为 Agent Preset，不映射成整个 Profile。

## 接入或修改能力

仅在用户明确要求长期改变，或当前 Goal 已证明正式能力缺失、失效或边界错误时进入维护路径。普通结果返工留在 Case，不自动改 Environment。

1. 完整读取责任 Skill 与外部来源的说明、引用、脚本、资产、依赖、许可、测试和历史，不凭目录名判断。
2. 先比较本地 Owner，再选择吸收、合并、硬依赖、独立 Skill、明确变体、宿主 Adapter、Clean-room 重构或拒绝。优先减少重复 Owner。
3. 用户明确指定来源且关系清楚时可以直接写入正式本地 Skill；来源、许可、重合、安全、Runtime 或采用方向仍不确定时才使用 Candidate 或 Trial。
4. 外部 Prompt、MCP、Agent、API、Plugin、模型、命令、脚本或服务正式使用前必须成为或并入完整本地 Skill；不得在业务执行中裸调用。
5. 每个正式 Skill 都必须保留含非空 `Origin` 的 `SOURCE.md`。复制或改编实现时继续记录许可、版本和本地改动；只借鉴需求或组织思路时不复制实现，按本地契约与许可清楚的公共基础能力独立重构。
6. 需要运行接线时，把 portable 或宿主专用资产留在完整 Skill package 的 `bindings/` 内。Mode 不增加 MCP、API、Agent、Plugin 或权限字段；真正激活由对应 Host Adapter 或宿主原生命令完成。

## 受控修改

1. 先判断最小影响半径：一次材料或产物留在 Case；可复用方法改 Skill；长期能力面、上下文或产物表面改 Mode；只有用户明确的跨 Mode 身份或治理变化才改 Profile。
2. 修改前检查 Git 状态和受保护路径。不要混入来源不明或与当前目标无关的改动。
3. Skill 删除或移动前检查其他 Skill 的 `requires`、所有 Mode 和活动宿主投影；Mode 删除或移动前检查活动投影。破坏性删除仍需用户逐项授权。
4. 修改最小真源后运行 `workspace.validate`，必要时运行 `workspace.view.sync`，只刷新受影响的 Host Projection，并向用户展示可读 Git diff。Environment 导入、宿主投影与 Preset 导出必须以原子操作完成，失败时恢复旧状态。
5. 校验失败时修复当前修改；找不到事实或操作不可执行时如实记录边界，不把整个任务锁死，也不伪造完成。

## 边界

- 不创建 Workflow、Run、第二 Agent、事件总线或隐藏路由。
- 不把系统维护、能力发现或“第二大脑”包装成业务 Mode；它们属于本入口和 Harness 的确定性代码。
- 不从点击、停留、沉默、耗时或重试推断长期偏好；只有用户明确反馈可以写入 `feedback/`。
- 不把所有 Skill、Case、反馈和历史一次性塞入上下文；按目标逐层读取。
- 不覆盖项目原有 `AGENTS.md`、`CLAUDE.md` 或 Skill；Harness 只能维护自己的标记区域和能够证明属于它的投影。
- Mode 选择不授权发布、付费、登录、消息、私人数据访问、外部写入或破坏性删除；这些继续使用当前 Host 的原生确认边界。

## 完成标准

- 使用的是用户指定或可证明的同一份本地 Environment；
- 常驻摘要与按需材料边界清楚，没有建立第二份记忆或索引真源；
- 任何长期修改都有明确触发信号、最小影响半径、完整来源判断和可读 Git diff；
- 当前 Mode 的 Skill 根、依赖闭包、培养区和 Secret 边界通过校验；
- 需要宿主接入时，原生目录、规则块和投影清单已经生成并通过 `host.verify`；
- 导入/导出记录包含 Git HEAD 与轻量内容指纹，受管说明或复制内容被改动时校验会失败；
- 没有把业务执行责任转移给 Harness，也没有覆盖用户自有文件；
- 未完成或仅结构验证的 DeepSeek 能力被如实说明。
