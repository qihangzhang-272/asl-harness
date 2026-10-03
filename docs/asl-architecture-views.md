# ASL 总体架构与专项视图

> **唯一架构与项目状态真源。** 本总览与 `architecture/` 专项文件共同组成唯一权威架构文档集；项目状态只维护在本总览 View 9。事实依据仍是代码与可复现的运行证据，不能用文档声明代替验证。发现实现、README、其他文档或图示不一致时，修正后优先更新本文件，再同步引用和发布检出；不得把待实现或待验收事项标成完成。开发仓库维护此文件，公开仓库只机械同步。

> **核心产品决策（2026-09-29，最终口述）：** ASL 是连接个人工作环境与 AI 应用的中间平台。**公共 GitHub 库以云端为真源，可直接在线呈现；采用到本地的 Mode 以本地持续使用和培养的版本为唯一真源，不被上游更新直接覆盖。** 文件和已有数据库的业务数据都向用户及 Agent 开放受控读写，协议校验后生效；不为开放而新增数据库。Mode 可独立发布到 GitHub。目标兼容 Codex、Claude Code、DeepSeek Harness、WorkBuddy、千问办公、豆包工作、OpenCode、Cursor；目标不等于已验证接入。口述决策按最新在前记录于 [核心产品决策](product-decisions.md)，本文件仍是唯一实现状态真源。

本总览导航到不同专项文件，用标准架构图解释 ASL。先看 Master 理解独立 App、可迁移环境和宿主的关系，再看 View 2D / 2E / 2F 理解使用、导入与模型配置，最后看 View 7C 的培养机制及 View 9 的真实状态。其余专项图展开已有底座，不把方案当成已发布功能。

> 更新：2026-10-03。专项视图已分块，旧 View 锚点保留为导航。当前验证数字、部署差异和后续执行路线集中在 View 9。中心使用原生 Mermaid 画板，点击技能在主区域打开完整文件，原图缩小后悬浮于右上层；基础流程图双击原位改字、右键添加与四面连接点拖线。图原文在人与 Agent 间共编，写入失败回传重写反馈。v0.4 保留技能归属与范式定义，已有关系可投影为 Mermaid，显式编辑时才写入文档；不把成员工作台当成任意 Mermaid 的可视编辑器。三张生成稿已被用户否决，不采用其布局；开发完成不等于桌面入口或远端已更新。

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

### 已交付版本 · 2026-10-03 · Windows App 0.5.9 / CLI 0.4.5

- **桌面已更新并打开：**最终 EXE 与 GitHub CI 验收通过后，正常关闭 0.5.8 主窗口，快捷方式切到 `%LOCALAPPDATA%\Programs\ASL Workspace\0.5.9\ASL Workspace.exe`。已核对进程、App 版本、主窗口与原用户偏好目录；真实 Capital Markets Desk 节点能打开公司画像完整文件，再返回 Creator Studio。原唯一本地工作库与 **3 个云端连接**保留；旧版程序、原快捷方式和偏好备份保留，不改技能或 Agent 账号配置。
- **零配置路径：**空偏好、无工作库及无 Agent 账号的隔离最终 EXE 可发现常用目录的本机技能、按 Markdown 阅读，并通过选择目录打开已有 Mode。真实公共仓库 `emilkowalski/skills` 的 README、**14 项技能**及详情在 App 内阅读，正常关闭重开后连接与仓库介绍恢复，无 renderer 错误。未复现“所有预览记录重开必然丢失”，不把用户举例当故障。
- **状态与连接修复：**仓库读取不再隐式登记连接，后台读取不能恢复已移除来源；显式连接失败后重试可继续登记。云端导航不覆盖本地位置，返回保留本地技能与搜索条件；云端技能按仓库相对路径定位，避免快照路径改变或技能同名导致刷新跳错内容。
- **阅读与编辑修复：**发现的本机技能直接显示图文，文件与依赖按需展开；图示默认可视化、原文显式进入，正文/脚本双击编辑保留。修复“编辑原文”进入错误页、README 目录链接失效、GitHub 附件图片被错误改址，以及 Markdown 重渲染清空 Mermaid、无连线节点无法点击；云端 Mode 默认不重复展开同一架构图。
- **结构编辑保持：**沿用原生 Mermaid、原位改字和既有保存门控。流程图右键添加与拖线；时序参与者左右重排、同一条件分支内消息重排及消息/备注/条件改字；思维导图完整子树移动、Shift 同级重排、右键添加子技能及移除分支；状态图显式节点名称编辑；撤销重做保留。拖拽改原文结构，由 Mermaid 自动排版，不新增自由坐标副本，范围见 [View 2D](architecture/02d-app-navigation.md) 和 [View 6](architecture/06-mode-skill-architecture.md)。
- **本地及最终 EXE 验收：**Node **175 passed / 0 failed**，架构文档 **3 passed**。开发与最终 **0.5.9 EXE** 通过原有 **13 组**画板操作、**9 组**结构编辑和新增 **4 项**连续性测试，无 renderer 错误；涵盖本地/云端切换与刷新、失败重试、空环境发现与选库、图文阅读及显式编辑。真实 GitHub 和已安装用户库另行实测。最终截图与证据在 `.local/validation/asl-release-0.5.9-20261003/`；测试源在 `desktop/e2e/continuity.cjs`。未改 Python 核心，不重复套用旧本地全量 Python 数字。
- **GitHub 与 CI：**实现 `4e10e0b` 已推送；[Windows / Linux CI](https://github.com/qihangzhang-272/asl-harness/actions/runs/37103526956) 均通过：两平台 Python **232 通过 / 2 跳过**，Windows Node **175 通过**，Linux Node **173 通过 / 2 跳过**，Windows 三套 GUI 全部通过；npm audit **0 告警**，不代表全系统安全认证。内容库仅发布中英 README 下载入口 `7d2e60c`，[仓库门控](https://github.com/qihangzhang-272/agent-skill-library/actions/runs/37103620997)通过；未上传本地业务修改。[0.5.9 预览发行](https://github.com/qihangzhang-272/asl-harness/releases/tag/app-v0.5.9)已公开，标签指向上述已验收实现；开发与机械发布检出的 **195 个 tracked 文件一致**。
- **发行完整性：**候选、ZIP 与安装目录 **402 个文件逐项 SHA-256 一致**。最终 ZIP 不含构建缓存，为 **175,285,402 字节**，SHA-256 `162F17A2B1198EA75934273156A4BD3C07BB1B514B3CE0DE8D62FAAB2417C812`；远端资产 digest 与字节数均一致。Windows x64 未签名便携预览版，保留整个解压文件夹。备份在 `.local/backups/asl-desktop-entry-0.5.9-20261003/`。
- **收敛与未完成边界：**Ponytail 与只读并行复审复用原有偏好、扫描、历史和渲染器，不新增依赖、数据库、服务或全盘扫描。本轮只发布 App、测试与入口文档；业务技能（含用户引入的 `humanizer-zh`）、缓存和历史资料不删除。首次网络读取仍依赖网络；跨重启离线快照回退及精确子页/滚动位置恢复未实现。任意 Mermaid 全语法可视编辑、跨条件分支移动、动态参与者/激活状态等无法准确映射的调整仍用原文编辑；状态图不支持任意拖动改转移。大型库/冷机/真实网络性能、Linux GUI、宿主登录及真实业务调用不在本轮通过范围。

<!-- ASL:PROJECT STATUS END -->

## 历史记录

旧交付、迁移前状态与当时的方案移至[历史交付记录](history/asl-delivery-history.md)，不与当前状态并列。
