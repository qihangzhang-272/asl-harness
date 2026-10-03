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

### 候选验收通过 · 2026-10-03 · App 0.5.9 阅读与使用连续性（待发布）

- **零配置路径：**空偏好、无工作库及无 Agent 账号配置的隔离 Electron 中，常用目录的技能可发现并按 Markdown 阅读；选择本地库目录后可打开真实 Mode 和技能。实际公共 GitHub 仓库 `emilkowalski/skills` 的 README、14 项技能及详情可直接阅读，正常关闭重开后连接与仓库介绍恢复。未复现“所有预览记录重开必然丢失”，不把用户举例当故障。
- **已修复状态问题：**仓库读取不再隐式登记连接，后台读取不能恢复已移除来源；显式连接失败后重试可继续登记。云端导航不覆盖本地位置，返回保留本地技能与搜索条件；云端技能用仓库相对路径定位，避免快照路径改变或技能同名导致刷新跳错内容。
- **已修复阅读问题：**发现的本机技能直接显示图文，文件与依赖按需展开；图示默认可视化、原文显式进入，正文/脚本双击编辑保留。修复“编辑原文”进入错误页、README 目录链接失效、GitHub 附件图片被错误改址，以及 Markdown 重渲染清空 Mermaid、无连线节点无法点击的问题；云端 Mode 默认不重复展开同一架构图。
- **验证：**Node **175 passed / 0 failed**，架构文档 **3 passed**；原有 13 组画板流程及 9 组结构编辑回归通过，新增 4 项 Electron 连贯性测试通过，无 renderer 错误。最终 **0.5.9 EXE** 重新通过全部上述 GUI 验收；新增测试覆盖本地/云端切换与刷新、失败重试、空环境发现与选库、图文阅读及显式编辑，并接入 Windows CI；远端 CI 尚未运行本轮代码。开发截图在 `.local/validation/asl-continuity-20261002/`，最终包截图在 `.local/validation/asl-release-0.5.9-20261003/`，测试源在 `desktop/e2e/continuity.cjs`。
- **候选发行完整性：**App **0.5.9 / CLI 0.4.5**；ZIP 与最终候选 **402 个文件逐项 SHA-256 一致**，不含构建目录。ZIP 为 **175,285,402 字节**，SHA-256 `162F17A2B1198EA75934273156A4BD3C07BB1B514B3CE0DE8D62FAAB2417C812`。尚未切换桌面或上传发行资产，不把候选验收当成交付。
- **收敛与边界：**Ponytail 及只读并行复审复用原有偏好、扫描与 Mermaid 渲染，不新增依赖、数据库、服务或全盘扫描。首次网络读取仍依赖网络，跨重启离线快照回退与精确子页/滚动位置恢复未实现。不改业务库、宿主账号或已安装 App，不清理用户目录；桌面及已公开版本仍为下方 0.5.8，开发改动尚未机械同步或推送。

### 已交付版本 · 2026-10-02 · Windows App 0.5.8 / CLI 0.4.5

- **桌面已更新并打开：**用户保存确认及最终 EXE 验收后，快捷方式切到 `%LOCALAPPDATA%\Programs\ASL Workspace\0.5.8\ASL Workspace.exe`；核对进程路径、主窗口和唯一本地库。切换时旧窗口已退出，无强制终止。0.5.7、历史包及原快捷方式备份保留；没有修改技能或 Agent 账号配置。
- **结构编辑：**沿用原生 Mermaid、原位文字编辑和既有保存门控。时序参与者左右重排、同一条件分支内消息调整顺序，消息/备注/条件改字；思维导图完整子树移动、Shift 同级重排、右键添加子技能及移除分支；状态图显式节点名称可原位修改。工作台保留撤销重做。拖拽改变原文结构，由 Mermaid 自动排版，不新增自由坐标副本，细分范围见 [View 2D](architecture/02d-app-navigation.md) 与 [View 6](architecture/06-mode-skill-architecture.md)。
- **稳定性与收敛：**修复后台刷新替换回调导致拖拽取消、刷新提示推动画板约 70 像素、编辑后缩放复位；删除已退出主视图的旧右侧技能栏组件及专属样式。Ponytail 审查复用现有渲染、历史和校验链，不新增依赖、服务或第二画布引擎；未扩大删除到缓存、备份和业务文件。
- **本地验收：**Python **229 passed / 5 skipped**、Node **173 passed / 0 failed**；开发与最终 EXE 均通过原有 13 组及新增 9 组 GUI 操作，无 renderer 错误。覆盖原文回读、坏图拒写、分支边界、重复标签、CRLF、根节点/祖先环保护与动态参与者限制。Python 初跑因测试临时路径过长失败，改用短临时根后完整通过；5 项跳过是 Windows 符号链接权限与 POSIX 权限位差异。两次 EXE 截图在背景刷新期间超时，未计为通过；测试等待刷新及回位动效完成后最终回归通过，证据为 `.local/validation/asl-release-0.5.8-20261002/asl-e2e-ZNHMoB/`、`asl-e2e-VRWJnn/`。
- **GitHub 与 CI：**实现 `2b7af38` 已推送，[Windows / Linux CI](https://github.com/qihangzhang-272/asl-harness/actions/runs/37088941523) 均通过：两平台 Python 232 通过 / 2 跳过，Windows Node 173 通过，Linux Node 171 通过 / 2 跳过，Windows 两套 GUI 通过；依赖审计 0 告警，不代表全系统安全认证。[0.5.8 预览发行](https://github.com/qihangzhang-272/asl-harness/releases/tag/app-v0.5.8)已公开，标签指向上述已验收实现；远端 ZIP 的 digest 与字节数均和本地最终包一致。
- **发行完整性：**候选、ZIP 与安装目录 **402 个文件逐项 SHA-256 一致**。`deliverables/ASL-Workspace-0.5.8-Windows-x64.zip` 为 **175,285,159 字节**，SHA-256 `8A0911B874D006FDC3B6A3E980A95642020475154B72F3D605BF08226B85835A`。Windows x64 未签名便携预览版，保留整个解压文件夹。
- **内容与账号边界：**唯一活动库仍为 `libraries/agent-skill-library`，冻结 CLI 校验 **37 Skills / 4 Modes / 6 张图实际渲染，生成视图一致**；保留既有 3 个云端连接。公共来源与本地 Mode 分离，不自动覆盖本地。用户明确引入的 `humanizer-zh` 已在 Creator Studio，本轮不删除、不自动上传业务修改。“账号设置”指宿主登录凭据、API Key 和模型端点，不是技能内容；本轮均未更改。
- **未宣称完成的范围：**任意 Mermaid 图型的全语法可视编辑仍未实现；跨条件分支移动、动态参与者/激活状态相关结构调整及其他无法准确映射的语法保留原文编辑。状态图当前只增加显式名称编辑，不支持任意拖动改转移。大型库/冷启动/真实网络性能、Linux GUI、宿主登录及真实业务运行不在本轮验收范围。此前性能测量和清理回执见历史，不重复套用为本轮提升。

<!-- ASL:PROJECT STATUS END -->

## 历史记录

旧交付、迁移前状态与当时的方案移至[历史交付记录](history/asl-delivery-history.md)，不与当前状态并列。
