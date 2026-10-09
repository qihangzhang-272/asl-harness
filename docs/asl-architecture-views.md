# ASL 总体架构与专项视图

> **唯一架构与项目状态真源。** 本总览与 `architecture/` 专项文件共同组成唯一权威架构文档集；项目状态只维护在本总览 View 9。事实依据仍是代码与可复现的运行证据，不能用文档声明代替验证。发现实现、README、其他文档或图示不一致时，修正后优先更新本文件，再同步引用和发布检出；不得把待实现或待验收事项标成完成。开发仓库维护此文件，公开仓库只机械同步。

> **核心产品决策（2026-09-29，最终口述）：** ASL 是连接个人工作环境与 AI 应用的中间平台。**公共 GitHub 库以云端为真源，可直接在线呈现；采用到本地的 Mode 以本地持续使用和培养的版本为唯一真源，不被上游更新直接覆盖。** 文件和已有数据库的业务数据都向用户及 Agent 开放受控读写，协议校验后生效；不为开放而新增数据库。Mode 可独立发布到 GitHub。目标兼容 Codex、Claude Code、DeepSeek Harness、WorkBuddy、千问办公、豆包工作、OpenCode、Cursor；目标不等于已验证接入。口述决策按最新在前记录于 [核心产品决策](product-decisions.md)，本文件仍是唯一实现状态真源。

本总览导航到不同专项文件，用标准架构图解释 ASL。先看 Master 理解独立 App、可迁移环境和宿主的关系，再看 View 2D / 2E / 2F 理解使用、导入与模型配置，最后看 View 7C 的培养机制及 View 9 的真实状态。其余专项图展开已有底座，不把方案当成已发布功能。

> **2026-10-07 授权澄清：**以现有 CLI 作为 Agent 协作入口，默认维护 Mode 组织；不保留完整提示词编辑／复制主路径。修改 Skill 正文、说明、脚本、资料或资产前，当前 Host 必须说明具体文件和影响并取得用户明确同意。受控编辑能力保留，不把须确认解释成永久禁止；其他接入和培养设想仍为目标。

> 更新：2026-10-09。专项视图分块维护；当前状态只看 View 9，旧交付进入历史。图使用原生 Mermaid，与 Agent 共编本地文本并通过实际渲染门控；鼠标交互范围见 View 2D。开发通过、候选包通过与正式发布分别记录。

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

## View 7C · 工作环境怎样培养：EvoMap 的借鉴与边界（偏好与反馈记录已有，自动培养待实现）

见[View 7C 专项视图](architecture/07c-learning.md)。

## View 8 · 三宿主部署与投影图

见[View 8 专项视图](architecture/08-host-projections.md)。

## View 9 · 当前项目状态

<!-- ASL:PROJECT STATUS START -->

### Windows 0.5.13 已交付、Mac 修复后待验收 · 2026-10-09 · 仓库逐项组织与 CLI 共用指引

- **新增入口：**仓库预览直接选择新建或已有 Mode，复用原画板逐项阅读、拖入、连接和保存。仓库来源不被后台扫描替换，同名来源可读且加入时确认使用本地版本；不静默覆盖 Skill。采用与保存分别反馈，取消 Mode 不假称撤销已采用包。仅自动生成的无边集合改为可编辑 flowchart，不转换作者图。
- **Agent：**`cli.describe.organization` 与 `environment.guide` 共用一份整理方法；当前 Host 依据用户目标与完整技能内容组织关系，CLI 提供读取、采用、写入与真实渲染门控。没有新建调度器、业务 Skill 或行业规则引擎，修改技能内容仍须具体授权。
- **Windows 最终包：**App **0.5.13**／核心 **0.4.8**。核心 **347 通过、7 条平台条件跳过**；Node **236 通过**；最终原生包完整桌面 **43/43 通过**（约 233 秒），隔离退出复验仍为 **43/43**（约 255 秒），最终鼠标落点与退出保护复验 **43/43**（约 257 秒）；26 张专项 Mermaid 图真实渲染通过。新增实机链覆盖首个 Mode／已有 Mode、阅读不写盘、取消、同名版本、完整脚本保留及保存后定位。App 内外真实 CLI 图预检另通过，原文件不变。已人工检查实际画板和阅读截图。日志见 `.local/validation/release-0.5.13-*`、`windows-disposal-regression.log` 与 `windows-final-after-pointer-fixture.log`。
- **内容交付边界：**内容版与框架版共用同一程序；只取已公开提交 `8dc3e269f5fd933421558cb3c96a5010651418ed`，不读本地未确认业务变化。内容包解压后冻结 CLI 检查通过，派生视图当前且无告警；Skill／Mode 原字节不改。包不含个人 Git 历史，后续演进记录仍需本机 Git 与仓库／作者配置。
- **Windows 交付：**[Harness](https://github.com/qihangzhang-272/asl-harness/releases/tag/app-v0.5.13) 与 [内容版](https://github.com/qihangzhang-272/agent-skill-library/releases/tag/app-v0.5.13)均已公开上传，GitHub 资产 SHA-256 与本地一致。框架 ZIP 为 `c58deab8d62797eeec720962ef5acc328b797d62c5532f6130feb0d96d93b781`，内容 ZIP 为 `79f81e4aa2fab023ba64690a4e34388d1f51a1e5ee784ddd8824df154abe7f81`。桌面入口已正常切换到 0.5.13 并启动，406 个安装文件与候选逐字节一致；保留旧版文件，未改真实 Skill、Mode、账号或投影。内容库只推送入口文档，78 项既有业务变化未发布；协议 8 项仍保留。
- **Mac 与依赖边界：**已修正主程序名、plist、冻结渲染路径与内容包启动脚本；[37957208791](https://github.com/qihangzhang-272/asl-harness/actions/runs/37957208791)的原生构建、核心 **352 通过／2 跳过**、Node **234 通过／2 跳过**及 App 内外实际渲染预检 **1/1** 通过，完整桌面 **42/43**（约 234 秒）。条件组鼠标拖动已通过，目录滚轮未产生预期滚动仍在核验；尚未发布 Mac，失败日志与截图已保留。测试窗口同高度复现并修正被遮挡的拖拽落点，自有隔离进程与失败采集有界退出，不放松产品校验或操作断言。Mac 包限 Apple Silicon，ad-hoc 签名，不是开发者签名／公证。构建期 `source-map-js` 高危已用兼容小版本升级修复；KaTeX／Mermaid 关联两项低危仍为兼容升级待办，不宣称零风险。完整证据见[本轮计划](plans/2026-10-08-repository-mode-and-release.md)。

### 历史验收记录 · 2026-10-08 · Mode 演进、归档与 Agent 体验

以下保留交付前的验收事实和限制；当前交付版本以本区域最上方记录为准。

- **范围与产品取舍：**按[本轮计划](plans/2026-10-08-history-archive-product.md)接入既有 Git、归档目录与 CLI，不新建日志引擎、事件总线、数据库或另一套 Harness。用户只看同一张架构画板、底部细演进轴与变化说明；没有历史缩略图墙或 Git 提交列表主界面。复用原生 Mermaid 与现有浅蓝样式，Ponytail 限制新增层次，Impeccable 用于简洁文案和连续操作收束。
- **演进与回退：**Mode 保存自动为 `MODE.md`／`mode.yaml` 留下独立原生 Git 记录，不移动主分支或用户暂存区、不包含 Skill 正文。时间轴支持拖动回看、主动回放、图型切换、从旧结构继续编辑和明确恢复；恢复走现有指纹／协议／实际渲染门控并产生新记录。说明用 Git notes，当前 Agent 先读相关历史再补有依据的外显决定，不后台启动模型、不采集内部推理。缺失历史 Skill 时不借当前成员伪造旧结构，也不直接恢复。
- **归档与配置：**本地库“归档”复用可调阅读面，可浏览明确归档、冲突保护恢复及逐项原生回收站确认；未知或不完整包只读。独立复核修复畸形包误认、凭据读取、清理指纹歧义。Agent 配置以缺项与下一步呈现，技术详情折叠，原宿主处理原操作，失败重试不保留旧成功状态。
- **交互保护：**目录结果返回时重验新建草稿，画板保存作废在途旧读取；“读取新版本”的取消和确认不抢先离焦保存。适应宽度在发起同源重绘时立即暂停旧 SVG，图与操作绑定同时就绪。仓库阅读位置与页面切换同步保存，返回列表后立即刷新不退回旧技能。恢复中的离页也受保护，不只保护文字草稿。
- **最终验收：**核心源码冻结测试 **330 通过、6 条平台条件跳过**，Node **235 通过、0 失败／跳过**，完整隔离桌面 **41 通过、0 失败／跳过**，约 206 秒；前端构建成功，26 张专项图实际渲染通过。实测覆盖时间轴、恢复、归档、鼠标画板、在途读取保护及返回列表后立即刷新；119 个测试运行时前端／主进程文件与当前开发产物逐项一致。证据在 `.local/validation/`：`archive-history-reviewed-final2-core-20261008.xml`、`history-archive-final-node7.log`、`history-archive-final-desktop5.log`、`history-archive-final-build6.log`、`history-archive-architecture.json`。首轮 38／40、错误 IPC 测试取消、两轮 40／41 暴露的重绘与阅读位置竞态及修复过程均保留在计划和日志。
- **性能与未验收边界：**小型样例的已读版本切换约 8–12 ms；40 条历史的列表／详情中位 276／834 ms，保存前后 Git 操作约 867 ms，不含渲染，不宣称冷启动或保存瞬时完成。仅 Mode 两个组织文件自动留痕；独立资料、外部直接写盘和整包采用未统一捕获。无 Git／作者不自动初始化或伪造成功；说明契约不能强制任意 Agent 遵守。回收站核对与原生移动不对任意外部进程保证原子性。既有通用包指纹的编码歧义需另作兼容评估，本轮不静默更换宿主投影。
- **交付边界：**按用户最新要求先完成原功能，未提交、推送、发布或替换桌面；正式安装仍为 **0.5.11**。Windows 验证运行时来自正式安装的隔离复制，接入当前源码冻结核心；默认开发 Electron 的运行问题与 macOS 包均未据此冒称通过。真实 Skill／Mode、账号和投影未改，协议 8 项与内容库 80 项既有变化保持；机械发布检出仍干净。跨平台包和 GitHub 同步留待交付阶段。

### 开发接入已验收、未交付 · 2026-10-08 · 阅读、配置、偏好与仓库续读

- **范围：**按[实施计划](plans/2026-10-08-harness-app-integration.md)修复读取与配置问题，接入既有 Profile／反馈文件及仓库跨次续读；复用同一 CLI、文件和门控。Ponytail 约束新增实现，Impeccable 保持原有浅蓝界面与一致的离页、失败和重试操作；没有新建数据库、调度器、模型后端或依赖。
- **阅读与配置：**`environment.catalog`、`skill.files`、`mode.files` 显式使用只读隔离：有效内容可打开，坏条目以 `issues` 定位，被坏依赖影响的 Mode 不冒充正常；正式写入、导出与投影继续严格检查。WorkBuddy 操作指引不再混用 DeepSeek，运行说明同时覆盖 SKILL／SOURCE，结果保留告警、配置位置和原始诊断。Hook 显示项目／模式／未覆盖范围，找到命令仍标为未实测；运行说明打开对应库内原文件。
- **偏好与记录：**App 总览与本地库右键进入同一主阅读编辑面，支持工作偏好、反馈新建／编辑／显式归档、目录调宽与未保存提醒。`environment.documents` 和 `environment.edit` 的 `environment.file.save/archive` 共用原有文件、协作写锁、指纹、路径及实际渲染门控；外部修改、无效图、保留标记和归档失败均不覆盖有效内容。这里只记录用户明确内容，不自动分析私人对话、修改 Skill 或启动培养；分享默认不携带 PROFILE 与根目录反馈。
- **仓库续读：**有界持久缓存保存 ZIP 和来源元数据，重开先读上次结果；显式或原有周期刷新才核对云端，失败保留旧内容和重试入口。50 个地址／256 MB 上限，满时跳过新增持久化，不自动删文件；读取和采用仍复用已有解包与校验，快照不成为本地 Mode 真源。A→B→A 刷新、不同 URL 别名、离线重开及在途缓存读取与显式刷新竞争均已回归。
- **新鲜验收：**核心 **285 通过、6 条平台条件跳过**（5 条符号链接权限、1 条 POSIX 执行位）；Node **214 通过、0 失败／跳过**；前端构建成功。最终源码冻结核心与隔离桌面 **38 通过、0 失败／跳过**，约 223 秒；测试运行时 76 个核心文件与冻结构建逐项一致。最终 **26 张专项 Mermaid 图真实渲染通过**。Impeccable 检测无命中，已查看实际偏好／记录页面。证据：`.local/validation/harness-app-integration-core.xml`、`harness-app-integration-node-final2.log`、`harness-app-integration-desktop-final2.log`、`harness-app-integration-design.json`、`harness-app-integration-architecture.json`。
- **失败事实与限制：**首次新增桌面发现 `.gitkeep` 被误报为坏记录，修复后通过；完整桌面首轮 37／38，测试等待旧按钮而未等待异步核对完成，改为等待明确状态后整轮 38／38。独立复审先复现两项缓存错误再修复。完整过程保留在计划，不把最终通过抹去失败。大型库冷启动、真实网络质量、真实 Host 登录／任务／Hook 触发仍未验收；原 Mermaid／ELK 大块构建提示保留。
- **交付与后续：**没有修改真实 Skill／Mode、账号或宿主投影，也没有提交、推送、发布、替换桌面；正式安装仍为 **0.5.11**，机械发布检出保持干净。协议仍为既有 8 项变化、内容库仍为既有 80 项；不把既有脏工作树归入本轮。自动培养、Candidate／Trial 完整管理、逐事件追溯、更多专用宿主适配仍是待实现目标；不以偏好和反馈入口代替整套培养闭环。

### 开发修复已验收、未交付 · 2026-10-07 · 两小时审查事项收束

- **范围：**审查确认的 14 项中，13 项功能／入口／性能问题已修复并验证；剩余 1 项是开发成果尚未正式交付桌面。未把 11 项后续建议一并扩张。计划与失败过程见[本轮修复计划](plans/2026-10-07-product-review-repairs.md)，Harness 与 App 的实际覆盖见 [View 2G](architecture/02g-agent-cli.md#harness-与-app-的覆盖边界)。
- **协作与首用：**外部修改实时回读 Skill；正在写的文件和原位图文字阻止刷新拆面板，外部归档也不丢稿；明确放弃只确认一次。过期指纹拒绝覆盖；仅图外说明变化时可显式重试合并，同图变化先处理旧稿。普通完整 Skill 可以在无 Agent 的空环境建立首个 Mode、重开、阅读和分享；`mode.create` 使用已有包门控，机器字段由 `cli.describe` 返回。完整正文、脚本与资料不被改写，来源只补在采用副本。
- **阅读、反馈与性能：**旧阅读记录改走同一主阅读面；旧合法 ID 可见且生成别名不碰撞，新协议不放宽。保存反馈可见，关键画板不再被快照转场吞掉第一下操作；读取错误保留完整 CLI 诊断，产品短中文一致。Skill 已采用、Mode 失败时明确反馈部分结果，并复用已有包重试。catalog 每 Mode 闭包只算一次、有序查重使用集合；同源进行中 MCP 读取复用且消费者取消隔离。1000 项同样暖机三次中位约 **7846→3319 ms**，约下降 58%；60／300 项不宣称明显改善，冷启动与真实网络仍未验收。
- **新鲜验收：**前端构建成功；Node **195 通过、0 失败／跳过**；核心 **250 通过、6 条环境条件跳过**（合计 256）；最终源码冻结核心与隔离桌面 **35 通过、0 失败／跳过**，约 199 秒；26 张专项 Mermaid 图真实渲染成功。首个 Mode 分享与坏图原始定位另有定向回归。Impeccable 检测无命中，并查看实际首用及分栏页面；其影响限于状态可感知、单次确认及现有阅读面收束，未替换视觉体系。证据：`.local/validation/product-review-repairs-node-final.log`、`product-review-repairs-core-final2.xml`、`product-review-repairs-desktop-final2.log`、`product-review-repairs-architecture.json`。
- **失败事实与交付边界：**首次打包冒烟的渲染程序返回 `0x80000003`，不是图语法错误；没有改运行权限或沙箱。实际回归使用正式安装运行时的隔离复制、当前前端和本轮源码冻结核心，不把它称作默认构建路径已恢复。首次核心身份顺序回归及桌面 33／35 的失败保留在计划中，修正后整轮通过。没有启动真实模型、修改真实账号／投影、发布 App、替换桌面、提交或推送；正式桌面仍是下述 **0.5.11**。候选与安装核心摘要不同，不能声称桌面已含这些修复。
- **内容与架构：**本轮只改 Harness／App、测试、两库中英文入口及架构文档；没有修改真实 Skill／Mode，原业务未提交内容保留。协议仍为基线 8 项，内容库由 78→80 项只新增两份 README 修改；机械发布检出仍干净，未同步。App 尚缺完整 Profile 编辑、培养反馈追溯、完整逐事件状态呈现及更多专用宿主适配；这些仍按目标管理，不因底层目录、协议或 CLI 已有就标为前端完成。

### 开发验收通过、未发布 · 2026-10-07 · CLI 优先与授权边界

- **第一轮收束：**复用现有 CLI、原生会话启动器及同一 App 页面；退役完整提示词编辑、重新生成、复制与冗余资料侧栏。可选目标交给已发现的 Codex CLI／Claude Code 原生会话，其他 Agent 可发现同一 CLI。未发送目标继续受离页保护；无 Agent 不阻断阅读，打开或退出会话不冒充整理完成。没有新增服务、模型账号、数据库、调度器或依赖。计划及验收见 [CLI 优先计划](plans/2026-10-07-cli-first-mode-management.md)。
- **关系与授权：**已有 `MODE.md` Mermaid 时，Host 不再追加旧 YAML 连线；没有作者图才回退到既有关系。成员、分类及合法范式信息保留，未改业务图。`cli.describe`、内部整理材料与宿主指令统一说明：默认组织 Mode，改 Skill 内容前由当前 Host 取得用户明确同意；不添加可伪造的“已批准”字段，也不声称 CLI 能独立证明人类确认或阻止任意磁盘写入。对应 [View 2G](architecture/02g-agent-cli.md)、[View 4](architecture/04-content-changes.md)、[View 6](architecture/06-mode-skill-architecture.md)已同步。
- **新鲜验收：**前端构建成功；Node **188 通过、0 失败／跳过**；核心使用当前源码与隔离的真实渲染器 **244 通过、6 条环境条件跳过**；完整桌面 **29 通过、0 失败／跳过**，约 203 秒；26 张专项架构图实际渲染成功，Impeccable 检测无命中并查看实际页面。桌面证据：`.local/validation/cli-first-mode-20261007-desktop.log`；覆盖来源记录、无 Agent、未发送目标、启动失败重试及原有画板与阅读链路。原生启动在进程边界测试，未启动真实模型或验收登录、业务调用。
- **验收限制与复核：**默认开发 Electron 的直接核心回归出现 15 项 `MERMAID_RENDERER_UNAVAILABLE` 失败；改用已安装运行时的隔离复制进行真实渲染后完整通过，不改生产渲染路径、权限或沙箱，不将其写成开发运行时已恢复。首次桌面整轮为 27／28 通过；云端场景的测试直接改偏好文件与启动写入争用，改为复用既有串行写入队列后，单项及完整 29 项均通过。保留失败事实，不用单项代替整轮。
- **交付与内容边界：**仅修改 Harness／App、测试及上述文档；真实 Skill、Mode、账号及投影没有在本轮改动。活动内容库 Git 状态仍为既有 78 项，协议仍为既有 8 项；机械发布检出保持干净，未同步、提交、推送或替换桌面，已交付仍为下述 0.5.11。内容库旧 README／下载入口与其余存量文档后续按顺序收束；未验收宿主和培养能力不急于补实现。

### 开发复验通过、未发布 · 2026-10-07 · 画板恢复与阅读复用

- R01–R06 已实施：结构拖动失焦／取消不提交，原位保存失败保留编辑文字并给出跨页结果，直接画板右键撤销／重做，完整文件有界复用并支持刷新，跨 README 保留章节定位，原生关窗默认继续编辑、明确放弃才关闭。继续使用原有 Mermaid 与写入门控，没有改真实 Skill／Mode、账号或投影。原因、证据和步骤见[操作一致性计划](plans/2026-10-05-interaction-consistency.md#六项整改实施用户已授权)，交互规则见 [View 2D](architecture/02d-app-navigation.md)。
- 2026-10-05 的前端构建、Node 195 项通过；可见 SVG 拖动绑定晚一帧和暖阅读挂载／退出滚动问题已修复。此次未新增产品代码，先完成七项隔离场景，再完成完整桌面回归 **28 项通过、0 失败／跳过**，耗时约 195 秒，renderer 无异常。覆盖画板、结构编辑、右键层级、未保存确认、阅读恢复、云端重试、50 条以上连接及无 Agent 配置的首启发现。证据：`.local/validation/recovery-scenes-20261007.log`、`recovery-full-20261007.log`；不以旧单项结果替代整轮结果。
- 超时复查：补齐已有隔离副本中缺失的运行文件，仅机械复制已安装运行时及当前桌面 CJS；EXE 摘要与正式安装一致，原生 Mermaid 校验资源与开发构建一致。安装版单图校验约 3.7 秒、隔离副本约 1.4 秒；将上轮同一份五图文档交给有效临时示例库的 CLI 预检，两次约 1.26／1.85 秒、实际渲染 5 图通过且原文件未变，见 `recovery-five-diagram-content-20261007.log`。旧临时库的 Profile 已缺失，不能当成完整环境再次验收。上轮 55 秒渲染和 180 秒启动失败本次未复现，根因仍未确认；不声称永久解决，也未改沙箱、系统权限或写入门控。原失败日志继续保留。
- 当前暖机小图写入约 0.85–1.43 秒；完整技能文件首次约 662 毫秒，后续三次约 19–28 毫秒，四次共一条读取请求，刷新可见外部修改。安全回归的完成等待仍为既有核心的 120 秒契约，不把放宽测试等待当作提速。大型真实库、冷启动、真实网络及任意 Mermaid 全语法拖动仍未验收。
- 未提交、推送、发布、替换桌面或改发布检出。真实交付仍为下述 0.5.11；测试只使用安装版的隔离副本、开发前端、已有冻结开发核心和示例库。故障、云端内容与原生确认选择在对应边界构造，不声称真实账号或网络任务已验证。

### 开发已验收、未发布 · 2026-10-05 · 操作一致性

- **保护与记录：**MCP 和整理表单复用离页确认，覆盖返回、导航、右键导航、切换、刷新及关窗。未修改不询问；取消保持草稿，确认才放弃，不自动保存表单。连接不再截断为 12 条，也不因目录暂时离线被遗忘；本地库与独立云端来源合计直接显示 50 条，其余折叠，记录不受缓存淘汰影响。
- **操作与阅读：**本地库右键打开、新建同级 Mode、新建独立库；Mode 右键编辑、复制、归档复用现有流程和门控。独立库从用户选定的有效 Mode 复制完整包，不伪造空 Skill，不覆盖目标目录。分类、图、文件、筛选、中文 README 及滚动位置按对象身份恢复；技能表格和节点共用完整阅读面板。云端原文失败原位重试，简介不能冒充全文。异常配置提供检查来源与重新检查，不绕过保护擅自修复未知配置。
- **加载与布局：**MCP 同范围复用有效快照与进行中读取，刷新失败保留内容；真实刷新和保存仍核验。Mode 保存直接返回同一已校验工作区的目录，省掉正常画板保存后的额外 `catalog` 进程；实际渲染、锁及指纹保留。整理资料栏加入共用调宽组件；表格按实际可用宽度回流并移除冲突的旧窗口断点。
- **分栏与排版：**主导航、全部技能导览、技能文件目录、模式编辑器及整理资料栏共用调宽组件；支持宽度记忆、双击复原、失焦取消与窄窗口约束。名称左对齐、计数右对齐且等宽数字，长名称不挤压数量或用途。窄窗口浮图避让编辑入口，技能正文与目录独立滚动；没有新增依赖或另一套视觉体系。规则见 [View 2D](architecture/02d-app-navigation.md)。
- **验收证据：**前端构建、Node 188 项、Python 241 项通过／6 条条件跳过、最终完整桌面交互 22 项通过，Renderer 无异常。测试复制安装版 EXE，加载开发前端与本轮源码冻结核心，并隔离用户配置及示例内容；故障和云端报告在 IPC 边界构造，不声称真实账号已验证。容量、完整重启、草稿确认、右键新建、原文重试、125% 缩放文字边界、布局命中及原有画板均覆盖。证据：连接 `%TEMP%\asl-e2e-nQgiI2`、离页 `%TEMP%\asl-e2e-Xy9pPX` / `asl-e2e-YCkstE`、右键 `asl-e2e-jswF1L`、阅读 `asl-e2e-4MwkzZ`、云端 `asl-e2e-KRCi9h`、分栏 `asl-e2e-VWh8sO`；核心报告 `.local/validation/consistency-core-verified.xml`。最初巡查为 `%TEMP%\asl-e2e-c4hpRI\audit.json`；原因和验收标准见[操作一致性计划](plans/2026-10-05-interaction-consistency.md#产品共性巡查与后续整改)。
- **测量边界：**原小图 7 次保存约 1.58–1.67 秒，其中 `edit` 约 1.14–1.20 秒、`catalog` 约 0.32–0.35 秒。本次正常保存只发 `edit`，最终隔离暖机小图约 1.05–1.19 秒；不宣称全部增删改查瞬时、大型库或冷机已经达标。失败／显式重读仍可调用 `catalog`。永久无法拖动仍未复现，不能把减少等待当成该问题的根因修复。
- **边界：**本轮仅改 App／框架、测试及项目文档，未修改真实 Skill／Mode、账号或投影，未提交、推送、替换桌面或同步发布检出；已交付版本仍为下述 0.5.11。独立测试使用安装版的隔离复制、开发前端和由本轮源码冻结的核心，不算新正式安装包验收。

### 已交付版本 · 2026-10-05 · Windows App 0.5.11 / CLI 0.4.6

- **发行与桌面：**[0.5.11 预览发行](https://github.com/qihangzhang-272/asl-harness/releases/tag/app-v0.5.11)已公开，标签为通过验收的 `b533b99`。App ZIP 与校验文件已上传，CLI 核心仍为 0.4.6。按用户保存确认正常关闭 0.5.10，桌面入口切到 `%LOCALAPPDATA%\Programs\ASL Workspace\0.5.11\ASL Workspace.exe` 并打开，已核对真实进程及主窗口。候选、ZIP、安装目录 405 个文件逐项一致，远端 ZIP 摘要及大小一致；旧安装和入口备份保留。
- **本次纠正：**流程图不再把声明排序当成直接拖动：节点实时跟手、关联线随动，保存和重开保留位置；四面端口近点吸附并保留起止方向，写入期间保留新连线预览。平行及反向边分开命中，右键“删除连线”不会删错另一条。缩放、全屏、取消和写入失败回滚均覆盖。关系仍是标准 Mermaid，位置／端口为同图 `%% asl-layout` 注释，无新增依赖、数据库或第二画布引擎。边界见 [View 2D](architecture/02d-app-navigation.md)、[View 6](architecture/06-mode-skill-architecture.md)及[直接操作计划](plans/2026-10-04-canvas-direct-manipulation.md)。
- **验收：**最终 EXE 桌面 14 项、本地 Node 186 项通过；Python 指向候选 EXE 的真实渲染器为 241 通过／6 条条件跳过。[Windows／Linux CI](https://github.com/qihangzhang-272/asl-harness/actions/runs/37261614225)均通过：Python 各 245 通过／2 跳过，Windows Node 186、Linux Node 184 通过，Windows 桌面 14 项通过。独立审查复现的平行／反向边误删已修复并以真实指针复验。没有用写回成功代替视觉位置和命中测试。
- **真实内容边界：**唯一活动库仍为 `libraries/agent-skill-library`；只读验收时为 60 Skills／4 Modes／10 张图，生成视图一致。安装后以原用户偏好验证“公司画像”四个端口、打开技能和返回画板，原工作库及 3 个云端连接保留，无 renderer 错误。本轮不修改或发布真实 Skill／Mode；其他 Agent 的并行业务修改保留，不能声称全部业务文件摘要未变。按共享安排继续暂停内容库与 Mode 更新，不改 Agent 账号。
- **保留限制：**时序图和思维导图仍按结构语义编辑；任意 Mermaid 全语法自由拖动、动态生命期及未知复杂语句不冒称支持。普通 Mermaid 阅读器忽略手工布局注释并自动排版。开发 Electron 的既有 Low 完整性标签问题未擅自改权限；首次网络读取、大型库／冷机、Linux GUI、真实宿主登录和业务调用不在本轮通过范围。缓存、旧包及未知文件不删除。详见[交付回执](history/asl-delivery-history.md#2026-10-05-画板修复交付回执)。

<!-- ASL:PROJECT STATUS END -->

## 历史记录

旧交付、迁移前状态与当时的方案移至[历史交付记录](history/asl-delivery-history.md)，不与当前状态并列。
