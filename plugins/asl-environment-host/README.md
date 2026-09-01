# ASL Environment Host plugin

同一份管理 Skill 与 Hook 的 Codex App / Claude Code 宿主包装。它只调用 ASL Harness 当前公开的确定性检查，不携带个人业务 Skill，也不保存第二份 Environment。

先安装 Harness CLI：

```bash
python -m pip install -e /path/to/asl-harness
```

然后把本仓库注册为宿主的本地 Marketplace：

```bash
# Codex：注册后在 Codex App 的 Plugins 中安装 ASL Environment Host
codex plugin marketplace add /path/to/asl-harness

# Claude Code
claude plugin marketplace add /path/to/asl-harness
claude plugin install asl-environment-host@asl-harness
```

Plugin 的 `hooks/hooks.json` 在会话启动、明确文件写入完成和本轮停止时调用 `asl-harness-hook`。没有 ASL 投影的项目会静默跳过；Hook 缺失也不影响已经投影的 Mode 正常工作。安装或更新 Plugin 后，从新会话进入目标项目。

DeepSeek Harness 不安装这份 Codex / Claude Marketplace 包装；其业务入口是项目 `.dsh/skills` 投影与 Mode 专属 Agent Preset。`deepseek.preset.export` 会把同一命令 Hook 写进 Preset，并通过 DeepSeek 官方 `@deepseek-ai/dsh-hooks-codex` 接到 Cordis 生命周期。这样只维护一份检查逻辑，也不要求 DeepSeek 伪装成 Codex 宿主。
