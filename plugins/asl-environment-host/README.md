# ASL Environment Host plugin

同一份管理 Skill 的 Codex App 与 Claude Code 插件包装。它只调用 ASL Harness 当前公开的确定性 CLI，不携带个人业务 Skill，也不保存第二份 Environment。

DeepSeek Harness 不安装这份薄插件；其原生入口是项目 `.dsh/skills` 投影与 Mode 专属 Agent Preset。
