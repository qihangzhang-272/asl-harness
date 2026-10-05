# ASL 总体架构与专项视图

> **唯一架构与项目状态真源。** 本总览与 `architecture/` 专项文件共同组成唯一权威架构文档集；项目状态只维护在本总览 View 9。事实依据仍是代码与可复现的运行证据，不能用文档声明代替验证。发现实现、README、其他文档或图示不一致时，修正后优先更新本文件，再同步引用和发布检出；不得把待实现或待验收事项标成完成。开发仓库维护此文件，公开仓库只机械同步。

> **核心产品决策（2026-09-29，最终口述）：** ASL 是连接个人工作环境与 AI 应用的中间平台。**公共 GitHub 库以云端为真源，可直接在线呈现；采用到本地的 Mode 以本地持续使用和培养的版本为唯一真源，不被上游更新直接覆盖。** 文件和已有数据库的业务数据都向用户及 Agent 开放受控读写，协议校验后生效；不为开放而新增数据库。Mode 可独立发布到 GitHub。目标兼容 Codex、Claude Code、DeepSeek Harness、WorkBuddy、千问办公、豆包工作、OpenCode、Cursor；目标不等于已验证接入。口述决策按最新在前记录于 [核心产品决策](product-decisions.md)，本文件仍是唯一实现状态真源。

本总览导航到不同专项文件，用标准架构图解释 ASL。先看 Master 理解独立 App、可迁移环境和宿主的关系，再看 View 2D / 2E / 2F 理解使用、导入与模型配置，最后看 View 7C 的培养机制及 View 9 的真实状态。其余专项图展开已有底座，不把方案当成已发布功能。

> 更新：2026-10-04。专项视图分块维护；当前状态只看 View 9，旧交付进入历史。图使用原生 Mermaid，与 Agent 共编本地文本并通过实际渲染门控；鼠标交互范围见 View 2D。开发通过、候选包通过与正式发布分别记录。

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

### 已交付版本 · 2026-10-04 · Windows App 0.5.10 / CLI 0.4.6

- **发行与桌面：**[0.5.10 预览发行](https://github.com/qihangzhang-272/asl-harness/releases/tag/app-v0.5.10)已公开，标签对应通过验收的 `0d6426c`；App ZIP、校验文件与 CLI wheel／源码包均已上传。桌面入口已切到 `%LOCALAPPDATA%\Programs\ASL Workspace\0.5.10\ASL Workspace.exe` 并打开，核对真实进程与主窗口。候选、ZIP、安装目录 405 个文件逐项摘要一致，远端 ZIP 摘要及大小一致。旧安装和入口备份保留。
- **鼠标画板：**右键新建流程／思维／时序模板，普通节点和真实技能分别添加；原位改字、拖拽结构排序、条件与分支增减、消息端点点选及撤销重做继续回写同一 Mermaid 原文。Agent 经 CLI 预检→写入→App 继续编辑的往返已验证，不代表启动了模型。沿用原生渲染和协议门控，没有第二画布引擎、坐标真源、依赖或数据库。交互范围见 [View 2D](architecture/02d-app-navigation.md)，成员边界见 [View 6](architecture/06-mode-skill-architecture.md)，实施依据见[本轮计划](plans/2026-10-04-mouse-first-mermaid.md)。
- **验收与读取收敛：**本地 Python 241 通过／6 项平台条件跳过，前端 182 通过；最终 EXE 桌面用例及小窗口鼠标复验通过。[Windows／Linux CI](https://github.com/qihangzhang-272/asl-harness/actions/runs/37256854759)均通过：各 Python 245 通过／2 跳过，Windows Node 182、Linux Node 180 通过，Windows 桌面 13 项通过。草稿保护、来源取消／重试、目录遍历、Git 查询和真实渲染打包门控一并交付；性能原始测量及早期失败保留于[历史记录](history/asl-delivery-history.md)，不扩大为冷机或真实网络提速承诺。
- **内容与 Agent 约束：**唯一活动库仍为 `libraries/agent-skill-library`；真实用户库只读校验为 60 Skills／4 Modes／6 张图，生成视图一致，Capital Markets Desk 节点阅读与返回、Creator Studio 渲染、原工作库及 3 个云端连接已核对。本轮开始前的 622 个技能文件摘要不变；另一个 Agent 的新接入已自行补齐来源登记，原文不由维护 Agent 改写。维护范围仅为拉取完整技能、填写引用、节点化及 Mode 组织；其他合规成果保留，既有业务修改不上传。内容库只推送 README 下载入口 `8dc3e26`，[仓库门控](https://github.com/qihangzhang-272/agent-skill-library/actions/runs/37255713755)通过。
- **未完成边界：**任意 Mermaid 全语法可视编辑、动态生命期及未知复杂语句不冒称支持；首次公共仓库读取仍依赖网络。大型库／冷机、Linux GUI、真实宿主登录与业务调用不在本轮通过范围。未改 Agent 账号、业务技能或真实 Mode；缓存、旧包及未知文件不自动删除。安装摘要、失败复验及备份路径见[交付回执](history/asl-delivery-history.md#2026-10-04-交付回执)。

<!-- ASL:PROJECT STATUS END -->

## 历史记录

旧交付、迁移前状态与当时的方案移至[历史交付记录](history/asl-delivery-history.md)，不与当前状态并列。
