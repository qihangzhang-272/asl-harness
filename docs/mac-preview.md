# ASL Workspace：Mac 预览版

本轮 App 为 0.5.18，随包核心为 0.4.11。适用于 Apple Silicon（M 系列）Mac，包内声明系统要求为 macOS 13.0 及以上；不是 Intel 或 Universal 版本。本轮使用 GitHub 的原生 Apple Silicon 运行器构建和验收，未逐一验证所有 macOS 版本。

## 下载与开始使用

按需下载以下其中一个 ZIP，保留同名 `.sha256` 校验文件：

- [只有 App 与 CLI](https://github.com/qihangzhang-272/asl-harness/releases/download/app-v0.5.18/ASL-Workspace-0.5.18-macOS-arm64.zip)：`ASL-Workspace-0.5.18-macOS-arm64.zip`，可创建工作库或导入已有库；校验值见 [Harness 发行页](https://github.com/qihangzhang-272/asl-harness/releases/tag/app-v0.5.18)。
- [App＋公开技能库](https://github.com/qihangzhang-272/agent-skill-library/releases/download/app-v0.5.18/Agent-Skill-Library-0.5.18-macOS-arm64.zip)：`Agent-Skill-Library-0.5.18-macOS-arm64.zip`，适合首次试用；校验值见 [内容版发行页](https://github.com/qihangzhang-272/agent-skill-library/releases/tag/app-v0.5.18)。内容固定来自 `e925ac24fbbfccaba08bcc5f9e0b09826ae766d1`，不含开发者本机草稿、账号或 Git 历史，Skill 与 Mode 文件未改。

不需要安装 Python 或 Node.js。完整解压普通 App 包后，将 `ASL Workspace.app` 拖入「应用程序」，再双击打开。内容包完整解压后打开 `Start.command`，使 App 读取旁边的 `Agent Skill Library`；请保留这两个目录及启动文件的相对位置，放在自己可写的位置。

更新已有 App 前先正常退出旧版本；替换程序不会自动替换自己的工作库。Git 演变记录需要另行安装 Git 并配置仓库与作者；真实 AI 任务仍需要对应 Agent 的安装、登录和依赖。

## 首次打开与系统提示

这是采用 ad-hoc 签名的预览包，没有 Apple Developer ID 发布签名或 Apple 公证。签名完整性校验通过不等于 Apple 已认可发行者。

如果系统提示无法验证开发者或无法检查此 App，请先确认文件来自上面的发行页并核对校验值。尝试打开后，可到「系统设置 → 隐私与安全性」查看针对该 App 的「仍要打开」，再确认打开；按 [Apple 官方说明](https://support.apple.com/en-us/102445) 操作。无需关闭系统整体防护。若提示恶意软件或文件损坏，不套用此步骤，请重新核对下载和反馈问题。

## 本轮变化与验收范围

保留 Mac 的浅色中性工作台与现有操作规范。仓库 README 可在 App 内切换作者提供的语言，技能可阅读完整脚本和资料；加入 Mode 先成为草稿，保存才采用。窄窗口下的画板命中和演进保存反馈已修正。DeepSeek 显示实际同步结果；Codex／Claude Code 可回看由本 App 发起的配置会话状态，结束不等于业务任务已完成。

原生构建、完整桌面回归、随包核心、实际 Mermaid 渲染，以及内容 ZIP 解压后的校验结果见发行说明。此次没有执行真实模型任务、修改真实账号或验证宿主业务任务；会话回执不是模型内部状态。深色模式、完整 VoiceOver 和 Intel Mac 未完成验收。
