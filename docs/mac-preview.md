# ASL Workspace：Mac 预览版

本轮 App 为 0.5.16，随包核心为 0.4.9。适用于 Apple Silicon（M 系列）Mac，包内声明系统要求为 macOS 13.0 及以上；不是 Intel 或 Universal 版本。本轮完整回归在本机完成，未逐一验证所有 macOS 版本。

## 下载与开始使用

从 [0.5.16 发行页](https://github.com/qihangzhang-272/asl-harness/releases/tag/app-v0.5.16) 下载以下其中一个 ZIP，保留同名 `.sha256` 校验文件：

- `ASL-Workspace-0.5.16-macOS-arm64.zip`：只有 App 与内置核心，可创建工作库或导入已有库。
- `Agent-Skill-Library-0.5.16-macOS-arm64.zip`：同一 App 加已公开的技能和 Mode，适合首次试用。内容固定来自 `e925ac24fbbfccaba08bcc5f9e0b09826ae766d1`，不含开发者本机草稿、账号或 Git 历史。

不需要安装 Python 或 Node.js。完整解压普通 App 包后，将 `ASL Workspace.app` 拖入「应用程序」，再双击打开。内容包完整解压后打开 `Start.command`，使 App 读取旁边的 `Agent Skill Library`；请保留这两个目录及启动文件的相对位置，放在自己可写的位置。

更新已有 App 前先正常退出旧版本；替换程序不会自动替换自己的工作库。Git 演变记录需要另行安装 Git 并配置仓库与作者；真实 AI 任务仍需要对应 Agent 的安装、登录和依赖。

## 首次打开与系统提示

这是采用本机 ad-hoc 签名的预览包，没有 Apple Developer ID 发布签名或 Apple 公证。签名完整性校验通过不等于 Apple 已认可发行者。

如果系统提示无法验证开发者或无法检查此 App，请先确认文件来自上面的发行页并核对校验值。尝试打开后，可到「系统设置 → 隐私与安全性」查看针对该 App 的「仍要打开」，再确认打开；按 [Apple 官方说明](https://support.apple.com/en-us/102445) 操作。无需关闭系统整体防护。若提示恶意软件或文件损坏，不套用此步骤，请重新核对下载和反馈问题。

## 本轮变化与验收范围

Mac 可进入原生 Agent 整理会话；Mode 和技能用途更清楚，配置完成后有开始使用指引。浅色中性工作台保留蓝色操作强调；图表默认全图概览，支持 100% 阅读与复位；同名冲突可更换项目或技能目录后重新核对，保护原文件。

本机打包、解压、随包核心与相关桌面流程的实际结果会记录在发行说明中。模型任务曾在独立项目中成功读取 Product Lab 技能并完成，但模型连接初期有重试，不能据此宣称长期稳定性。深色模式、完整 VoiceOver 和 Intel Mac 未完成验收。
