# ASL 总体架构与专项视图

> **唯一架构与项目状态真源。** 本总览与 `architecture/` 专项文件共同组成唯一权威架构文档集；项目状态只维护在本总览 View 9。事实依据仍是代码与可复现的运行证据，不能用文档声明代替验证。发现实现、README、其他文档或图示不一致时，修正后优先更新本文件，再同步引用和发布检出；不得把待实现或待验收事项标成完成。开发仓库维护此文件，公开仓库只机械同步。

> **核心产品决策（2026-09-29，最终口述）：** ASL 是连接个人工作环境与 AI 应用的中间平台。**公共 GitHub 库以云端为真源，可直接在线呈现；采用到本地的 Mode 以本地持续使用和培养的版本为唯一真源，不被上游更新直接覆盖。** 文件和已有数据库的业务数据都向用户及 Agent 开放受控读写，协议校验后生效；不为开放而新增数据库。Mode 可独立发布到 GitHub。目标兼容 Codex、Claude Code、DeepSeek Harness、WorkBuddy、千问办公、豆包工作、OpenCode、Cursor；目标不等于已验证接入。口述决策按最新在前记录于 [核心产品决策](product-decisions.md)，本文件仍是唯一实现状态真源。

本总览导航到不同专项文件，用标准架构图解释 ASL。先看 Master 理解独立 App、可迁移环境和宿主的关系，再看 View 2D / 2E / 2F 理解使用、导入与模型配置，最后看 View 7C 的培养机制及 View 9 的真实状态。其余专项图展开已有底座，不把方案当成已发布功能。

> 更新：2026-10-02。专项视图已分块，旧 View 锚点保留为导航。当前验证数字、部署差异和后续执行路线集中在 View 9。中心使用原生 Mermaid 画板，点击技能在主区域打开完整文件，原图缩小后悬浮于右上层；基础流程图双击原位改字、右键添加与四面连接点拖线。图原文在人与 Agent 间共编，写入失败回传重写反馈。v0.4 保留技能归属与范式定义，已有关系可投影为 Mermaid，显式编辑时才写入文档；不把成员工作台当成任意 Mermaid 的可视编辑器。三张生成稿已被用户否决，不采用其布局；开发完成不等于桌面入口或远端已更新。

## 颜色约定

- **蓝色**：用户已经明确确认，后续实现必须保持的架构边界；
- **绿色**：当前代码或真实 Environment 已实现并验证；
- **橙色**：尚未实现、当前生成面需要刷新，或仍有真实宿主运行验收；
- **红色**：当前错误分类或旧结构，迁移后删除；
- **灰色**：可删除重建的宿主生成面，或已经退出活动面的冻结归档；
- **紫色**：外部来源，不是本地运行真源。

颜色表达节点的当前主状态，不表达执行顺序。可重建投影即使已经验证仍保持灰色，并在节点文字中写明“已验证”；外部来源始终保持紫色。动态项目状态、验证数字和未完成项只在 [View 9](#view-9--当前项目状态) 的受管区域维护，README 和其他协议文档只链接这里。

## 怎么读这些图

| 图 | 类型 | 只回答什么问题 |
| --- | --- | --- |
| [Master](architecture/00-master.md) | 总体模块关系图 | 所有模块怎样组成一个系统，哪些关系形成反馈环 |
| [View 1](architecture/01-context.md) | 系统上下文图 | 用户、Host、Harness、Environment、Case 和外部来源分别站在哪里 |
| [View 2](architecture/02-components.md) | 组件图 | Harness System 与 Personal Environment 内部各自包含什么 |
| [View 2B](architecture/02b-runtime-sync.md) | Runtime 边界与同步图 | ASL 不复制哪些 Host 能力，以及两份 Environment 怎样显式同步完整 Skill |
| [View 2C](architecture/02c-host-hooks.md) | Hook 接线图 | 宿主在什么时机调用哪些现有检查，什么时候提醒或阻断 |
| [View 2D](architecture/02d-app-navigation.md) | App 入口与状态图 | 怎样管理工作环境、看见能力，并区分已配置与实际生效 |
| [View 2E](architecture/02e-portable-environment.md) | 环境包与安装图 | 复杂技能、插件和资料怎样分享，怎样在指定 Mode 安装 |
| [View 2F](architecture/02f-model-adaptation.md) | 模型与应用时序图 | Mode 如何关联 Model，怎样应用到不同宿主而不携带秘密 |
| [View 2G](architecture/02g-agent-cli.md) | Agent CLI 与 App 同源管理 | 读取、候选验收、提交及框架/内容版怎样共用同一实现 |
| [View 3](architecture/03-task-execution.md) | 运行时序图 | 一个普通 Goal 从进入到交付怎样发生 |
| [View 4](architecture/04-content-changes.md) | 变更时序图 | Skill / Mode 的增删改查怎样与普通业务内容隔离 |
| [View 5](architecture/05-capability-lifecycle.md) | 生命周期状态图 | 外部能力从发现到采用、合并、依赖、变体、适配或归档怎样流转 |
| [View 5B](architecture/05b-complex-repositories.md) | 复杂仓库拆解图 | 一个外部仓库应该变成一个 Skill、多个 Skill、共享 Runtime 还是 Adapter |
| [View 5C](architecture/05c-installation-binding.md) | 安装与 Mode 绑定时序图 | 用户明确要求引入时，如何直接安装并只绑定指定 Mode |
| [View 6](architecture/06-mode-skill-architecture.md) | 能力图 | Mode 怎样选择 Skill 子图而不退化成固定 Workflow |
| [View 7](architecture/07-change-radius.md) | 决策图 | 用户明确反馈应该落在 Case、Skill、Mode 还是 Environment |
| [View 7B](architecture/07b-mode-evolution.md) | Mode 决策图 | 什么时候新建、修改、合并或退出一个 Mode |
| [View 7C](architecture/07c-learning.md) | 培养循环与研究映射 | 借鉴 EvoMap 的哪些经验机制，哪些不采用，怎样保持轻量 |
| [View 8](architecture/08-host-projections.md) | 部署图 | 同一真源怎样投影到 Codex、Claude Code 与 DeepSeek Harness |
| View 9 | 迁移图 | 当前已经完成什么、还差什么、哪些旧结构必须删除 |

## 核心对象边界

见[对象、产品与运行边界](architecture/boundaries.md)。

## Master · 总架构图

见[Master 专项视图](architecture/00-master.md)。

## View 1 · 系统上下文图

见[View 1 专项视图](architecture/01-context.md)。

## View 2 · Harness 与 Environment 组件图

见[View 2 专项视图](architecture/02-components.md)。

## View 2B · 原生 Harness 边界与 Environment Sync CLI

见[View 2B 专项视图](architecture/02b-runtime-sync.md)。

## View 2C · Host-native Hook 接线架构

见[View 2C 专项视图](architecture/02c-host-hooks.md)。

## View 2D · App 入口与 Mode 可见状态（同步及配置入口已有，完整运行验收与培养待补）

见[View 2D 专项视图](architecture/02d-app-navigation.md)。

## View 2E · 可迁移环境包与复杂能力安装（内容往返已实现，原生安装待实现）

见[View 2E 专项视图](architecture/02e-portable-environment.md)。

## View 2F · 模型配置与跨宿主应用时序（设计，待实现）

见[View 2F 专项视图](architecture/02f-model-adaptation.md)。

## View 2G · Agent CLI 与 App 同源管理

见[CLI、写入门控与框架/内容版边界](architecture/02g-agent-cli.md)。

## View 3 · 普通 Goal 的执行时序

见[View 3 专项视图](architecture/03-task-execution.md)。

## View 4 · Skill / Mode 变更时序

见[View 4 专项视图](architecture/04-content-changes.md)。

## View 5 · 外部能力生命周期状态图

见[View 5 专项视图](architecture/05-capability-lifecycle.md)。

## View 5B · 复杂外部仓库拆解图（系统规则已实现，实例迁移按需）

见[View 5B 专项视图](architecture/05b-complex-repositories.md)。

## View 5C · 外部能力安装与单 Mode 绑定时序图（系统规则已实现，实例迁移按需）

见[View 5C 专项视图](architecture/05c-installation-binding.md)。

## View 6 · Mode 是能力子图，不是 Workflow

见[View 6 专项视图](architecture/06-mode-skill-architecture.md)。

## View 7 · 演化影响半径决策图

见[View 7 专项视图](architecture/07-change-radius.md)。

## View 7B · Mode 新建、修改与退出决策图

见[View 7B 专项视图](architecture/07b-mode-evolution.md)。

## View 7C · 工作环境怎样培养：EvoMap 的借鉴与边界（设计，待实现）

见[View 7C 专项视图](architecture/07c-learning.md)。

## View 8 · 三宿主部署与投影图

见[View 8 专项视图](architecture/08-host-projections.md)。

## View 9 · 当前项目状态

<!-- ASL:PROJECT STATUS START -->

### 已交付版本 · 2026-10-02 · Windows App 0.5.7 / CLI 0.4.5

- **桌面已替换并启动：**用户保存确认后，正常关闭 0.5.6；最终路径修复重新打包、复验并经再次确认后正常重启。桌面快捷方式指向 `%LOCALAPPDATA%\Programs\ASL Workspace\0.5.7\ASL Workspace.exe`，已核对最终包进程和主窗口。旧版本、原快捷方式、中间候选与内容迁移恢复材料保留。没有修改技能内容或 Agent 账号配置。
- **唯一本地库：**活动内容仍为 `libraries/agent-skill-library`，37 Skills / 4 Modes；旧 Personal / 写作检出已归档。云端库是独立来源，本地 Mode 不被上游直接覆盖。本轮只发布框架、App、CLI、测试和入口文档，未批准的业务修改不上传。
- **编辑与导航收敛：**新建、旧格式与原生 Mermaid 共用一个工作台；删除旧 React Flow 画布及其专用布局、三个直接运行依赖。保留技能成员、依赖闭包、范式归属、原文、指纹与写入门控。技能内容在主区域呈现，原图悬浮；库路径参与身份，切库不串库；仓库 Markdown 的同仓语言链接留在 App。二轮删除无效路由包装、未使用参数和不可达样式，不新增框架。
- **验收：**完整 Python **229 passed / 5 skipped**；Node **165 passed / 0 failed**。初次 Python 执行因验收输出父目录未创建而 setup 失败，创建后完整重跑通过；删除无用参数后修正一项旧源码断言，完整 Node 重跑通过。Windows CI 发现真实短路径与规范路径混用导致 README 被误判越界；本地别名目录测试先复现，再在解包入口统一真实路径，未削弱越界保护。生产构建及冻结核心中文写入成功，重打的最终 **0.5.7 EXE** 隔离 GUI **13 组操作**通过、无 renderer 错误；包含新建、撤销重做、右键添加、离页保护、保存回读、完整技能、坏图拒写、时序/状态/思维导图、旧格式归属导航及仅打开不写盘。最终包证据：`.local/validation/asl-release-0.5.7-20261002/asl-e2e-Egg4jx/`。真实本地库冻结 CLI 校验通过，6 张内容图实际渲染、生成视图一致；26 张专项架构图用同一渲染器通过。缓存排除提示仍按事实报告，不删除业务目录中的缓存。
- **发行完整性：**最终候选、ZIP 与安装目录 **402 个文件逐项 SHA-256 一致**。`deliverables/ASL-Workspace-0.5.7-Windows-x64.zip` 为 **175,280,771 字节**，SHA-256 `94237FC4EDE618EF24F6DD4EB06642DCCBACE0A806CA860266619FC0FDD5AE2E`。未签名 Windows x64 便携预览版；保留整个解压文件夹。DOMPurify 升为 3.4.16，本轮 npm audit **0 告警**，不等于全系统安全认证。README 构建命令改为安装项目声明依赖，补齐原先漏掉的依赖链。
- **GitHub 状态：**App / CLI 实现已推送，最终路径修复提交 `02fd1df` 的 [Windows / Linux CI](https://github.com/qihangzhang-272/asl-harness/actions/runs/37019734398) 均通过，Windows 含隔离 GUI 验收；内容库入口与验收依赖提交 `701bcff` 的[仓库门控](https://github.com/qihangzhang-272/agent-skill-library/actions/runs/37019077208)通过。修复了此前先测后构建导致渲染器缺失的问题；Linux 使用 CI 专用 SUID 沙箱与 Xvfb，不绕过沙箱。[0.5.7 预览发行](https://github.com/qihangzhang-272/asl-harness/releases/tag/app-v0.5.7)已公开，标签对应已验收实现 `02fd1df`；远端 ZIP 的 digest、字节数与上述本地最终包一致。
- **性能与清理边界：**此前对称预热的 A/B 各十次测得示例库就绪 p50 **372→358 ms**、p95 **377→374 ms**，图展示基本持平；不是冷机或真实网络承诺。[方法与完整结果](../perf/报告.md)。此前经精确授权清理 21 个旧目录，约 **8.91 GiB 普通文件逻辑长度**；本轮不扩大删除到历史 ZIP、测试残留、迁移备份或业务文件。
- **尚未完成：**任意 Mermaid 图型的全语法双向可视编辑仍未实现，复杂图经原文修改；基础流程图才支持既有无损编辑范围。大型库/冷启动/真实网络性能、Linux GUI、宿主账号登录与真实业务运行不在本轮通过范围。CI 与可复跑桌面入口见[桌面验收](../desktop/e2e/README.md)。

<!-- ASL:PROJECT STATUS END -->

## 历史记录

旧交付、迁移前状态与当时的方案移至[历史交付记录](history/asl-delivery-history.md)，不与当前状态并列。
