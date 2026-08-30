# ASL 三宿主 Mode 投影设计

## 目标

把 `asl-harness` 从旧版 Workflow/Run 工具重建为一个很薄的本地适配层：同一份 Personal Harness Environment 保存 Profile、Skill 与 Mode；Codex App、Claude Code 和 DeepSeek Harness 只读取由它生成的宿主原生投影。当前宿主仍是唯一执行者，Harness 不理解业务 Goal、不排执行顺序、不维护运行状态。

## 成功标准

1. Harness 只识别 v0.3 Environment、完整本地 Skill 和 Mode，不再兼容 `workspace.yaml`、Workflow 或 Run。
2. Mode 显式选择 Skill 根，Harness 只补齐 `metadata.asl.requires` 依赖闭包；列表不是执行顺序。
3. `workspace.validate` 能拒绝缺失 Skill、循环依赖、非法权限、路径逃逸和旧结构回流。
4. 同一个 Mode 可以投影到 Codex App、Claude Code 和 DeepSeek Harness，投影可删除、可重建、不成为真源。
5. `host.verify` 能发现投影缺失、被用户文件占位以及同一 Git HEAD 下的来源变化。
6. DeepSeek Harness 额外支持把一个已有 Agent Preset 复制为 Mode 专属 Preset；工具组合继承已知可运行的起点，Mode 只替换 Persona 与 Skill 可见面。

## 非目标

- 不实现 Mode Router、图执行器、第二 Agent、事件总线或后台学习任务。
- 不把 Goal、Case、Artifact 或对话历史写进 Harness 状态。
- 不自动搜索或安装外部能力；外部内容必须先成为当前 Environment 的正式本地 Skill。
- 不创造 DeepSeek Agent Preset 的继承协议。DeepSeek 官方采用整目录复制，本实现遵守这个边界。
- 不为 Codex 和 Claude 再安装一个管理插件；项目原生 Skill 目录与规则文件已经是最短接入面。

## 真源与生成视图

```text
Personal Harness Environment（唯一真源）
├── WORKSPACE.md              人机共读的总体地图
├── PROFILE.md                跨 Mode 的精简长期边界
├── skills/<skill>/SKILL.md   唯一业务能力单位
└── modes/<mode>/
    ├── MODE.md               工作场语义
    └── mode.yaml             Skill 根与环境修改权

                         host.project
                              │
          ┌───────────────────┼────────────────────┐
          ▼                   ▼                    ▼
 Codex App projection   Claude Code projection   DeepSeek projection
 .agents/skills         .claude/skills           .dsh/skills
 AGENTS.md              CLAUDE.md                AGENTS.md
                                                 + 可选 Agent Preset
```

投影清单只保存宿主、当前 Mode、来源 Git HEAD、确定性来源指纹和生成表面。来源指纹是从 Profile、Mode 与 Skill package 内容计算出的派生校验值，不是手写 revision，也不是新的运行状态。

## Environment 校验

`Workspace.open()` 只做确定性检查：

1. `WORKSPACE.md`、`PROFILE.md` 必须存在且非空；
2. `skills/` 与 `modes/` 只扫描第一层 package；
3. Skill frontmatter 的 `name` 必须等于目录名，`description` 与 `## 完成标准` 必须非空；
4. `metadata.asl.requires` 只能包含唯一的安全 Skill id；
5. Mode 必须使用 `asl-wep/v0.3.0-design`，权限字段只能是 `mutateEnvironment: boolean`；
6. Mode 只能引用正式 `skills/`，依赖必须闭合且无环；
7. 出现 `workspace.yaml`、`workflows/` 或 `.asl/runs/` 时直接拒绝，防止旧架构静默回流；
8. Candidate、Trial、Feedback、Case 与 Archive 不被当作活动 Skill，也不常驻注入宿主。

## 三个宿主的差异

### Codex App

- Skill 发现面：`.agents/skills/<skill>`；
- Mode 边界：`AGENTS.md` 中唯一受管理块；
- 适配方式：目录链接，Windows 下依次退化为 junction、受管理副本；
- 不增加 Codex 专属调度器或入口 Skill。

### Claude Code

- Skill 发现面：`.claude/skills/<skill>`；
- Mode 边界：`CLAUDE.md` 中唯一受管理块；
- 其余语义与 Codex 一致。

### DeepSeek Harness

分为两个原生层面：

1. **项目投影**：`.dsh/skills/<skill>` 与 `AGENTS.md`，不安装任何东西即可被 `dsh-skill-filesystem` 和 `dsh-agent-instructions` 发现；
2. **Agent Preset 导出**：从用户提供的已知可运行 Preset 整目录复制，保留其工具与插件组合，只改两处：
   - `dsh-persona`：注入精简 Profile、Mode 边界和 ASL 不变量；
   - `dsh-skill-filesystem`：只扫描导出 Preset 中的 Mode Skill 闭包。

第二层输出应直接落在 DeepSeek 的 user preset root 或其他已配置 user root。导出目录带 ASL 标记，只有匹配标记的旧投影才允许刷新；未知目录一律拒绝覆盖。

## 切换 Mode

同一宿主项目只保留一个当前 ASL Mode。再次执行 `host.project` 时：

1. 读取上一次受管理清单；
2. 删除只属于旧 Mode 的受管理链接、junction 或副本；
3. 保留用户自有同名目录并拒绝覆盖；
4. 投影新 Skill 闭包；
5. 原位替换规则文件中的一个受管理块；
6. 写入新的生成清单。

这不是运行状态机，只是一次确定性的生成视图刷新。

## CLI

只保留五个命令：

```text
workspace.validate
workspace.view.sync
host.project
host.verify
deepseek.preset.export
```

前四个覆盖日常维护与接入；第五个只负责 DeepSeek 原生 Agent Preset。没有 `run.*`、`feedback.record-explicit` 或 Workflow 参数。

## 失败边界

- 来源不合法：验证阶段失败，不生成半份投影；
- 目标表面被用户文件占用：拒绝覆盖；
- 链接能力受限：只对 Skill 目录退化为受管理副本；
- DeepSeek base preset 缺少唯一 `persona` 或 `skill-filesystem` 行：拒绝导出，不猜测结构；
- DeepSeek Preset 导出中途失败：先写临时目录，成功后原子替换受管理旧投影；
- 来源发生变化：`host.verify` 返回需要重新投影的 warning，不阻断用户继续工作。

## 为什么没有额外兼容层

Codex 与 Claude 已经原生理解 Skill 目录和项目规则；DeepSeek 已经原生理解 Skill filesystem 与 Agent Preset。再造统一插件运行时只会成为第二调度器。ASL 的公共层只定义 Environment、Mode、Skill 与确定性投影，宿主差异留在三个很薄的 Adapter 中。
