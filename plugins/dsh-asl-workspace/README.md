# ASL · DeepSeek Harness 工作区

DSH 原生插件。以现有 ASL Environment 为来源，Mode 进入 Mermaid 工作区，技能进入完整文件页面。UI 和 `asl_workspace` Agent 工具使用同一领域服务及现有核心写入检查。

公开分发入口：[dsh-asl](https://github.com/qihangzhang-272/dsh-asl)。包名保持 `dsh-asl-workspace`，避免破坏已有 DSH 配置。对象关系、框架约束与愿景边界见 [插件架构](ARCHITECTURE.md)。

当前版本 0.3.16：沿用已确认的 Stitch 浅色视觉，增加节点单击技能预览、预览内 Markdown 轻量编辑、目录操作，以及基于 DSH 工具回执的执行与产物窗口。新增界面以官方 DSH Web 隔离配置联调；原生桌面鼠标与截图工具目前不可用，不能将浏览器验收当作原生窗口验收。

## 阅读与编辑

直接复用桌面 APP 的 `MermaidEdit`、`MermaidView`、`modeDiagramDocument` 及原生 Mermaid 样式。进入 Mode 即显示现有图，不增加总览图、默认入口筛选、逐层浏览状态或另一份架构真源。

- 双击节点文字原位修改，按住节点拖动，端点连接和右键菜单默认可用。
- 沿用 APP 的范式图切换、缩放、复位、全屏、源文编辑及撤销重做。
- 单击选中并打开右侧技能预览，Shift 多选，空白拖动框选；选中节点旁的「打开技能 ↗」或 Ctrl/⌘+Enter 进入完整文件页。
- V/H 切换选择/平移；空格拖动或中键临时平移，滚轮平移、Ctrl/⌘+滚轮缩放，Shift+1 全图、Shift+0 原始大小。
- Ctrl/⌘+A 全选，C/X/V 复制剪切粘贴，D 创建副本，Delete/Backspace 删除；Z 撤销、Shift+Z 或 Ctrl+Y 重做。
- Enter/F2 改名，方向键移动 1 单位、Shift+方向键移动 10 单位；按住方向键的一次操作对应一次撤销。
- 点击工具栏键盘按钮或按 ? 查看快捷键；编辑文字和使用输入法时不触发画板命令。复制、多节点拖动、微调适用于可编辑流程图；其余 Mermaid 图型保留各自结构编辑方式。
- 旧画板的技能关联注释保持兼容，不拆分或改写旧图。
- 画框把当前图和区域交给右侧原生会话，底部沿用 DSH 输入与批准界面。

图的唯一关系原文是 `MODE.md` 中的 Mermaid。APP 使用的 `skill_技能标识` 自动关联技能；`%% asl-bind 节点ID ["skill-a","skill-b"]` 可将一个节点关联到两个现有技能。没有 Mermaid 时调用 APP 原有 `modeDiagramDocument` 投影既有架构，第一次编辑才写入。

## DeepSeek 直接编辑契约

界面把当前 Mode、文件、图和节点／连线选区同步到对应原生会话。宿主每个模型步骤提供最新上下文，不再向输入框一次性插入引用。Agent 使用 `asl_workspace` 的 `context → read → save`：先核对目标，再读完整原文，保存时同时提交 `contextRevision` 和原文 `fingerprint`。工具的会话身份由 DSH 注入，不能由模型参数指定。

切换目标或选区、未保存草稿、原文变化均拒绝旧写入；进入保存队列后仍会重新检查。关闭界面清理上下文，失去心跳十秒后停止接受写入。保存成功返回实际落盘原文和新指纹，并推动界面修订号刷新；只有成功回执才代表已修改。打开技能后修改当前文件，返回画板后修改 `MODE.md`。

这是共享编辑工具的并发契约，不是对 DSH 其他文件工具的沙箱。原生 Agent 的工作指令要求通过共享工具修改；外部工具直接改文件仍须手动重新读取。

## 本机开发与安装

此包依赖现有 ASL 核心和 Environment，不包含第二份内容库或 Agent 引擎。

```powershell
npm run build
npm pack
dsh plugin --profile desktop add <本地 tgz 路径>
```

商店或 GitHub 直装可先安全挂载插件；首次使用前仍需准备完整 ASL 仓库和 Environment。未配置路径时，工作区和共享工具会返回配置指引，不阻断 DSH 启动。直装不会初始化 `upstream` 子模块，请另行递归克隆公开仓库或使用已有完整 ASL 仓库。

在 DSH profile 的 `cordis.patch.yml` 配置路径后重启 DSH：

```yaml
- id: asl-workspace
  config:
    sourceRoot: C:/path/to/asl-harness
    environment: C:/path/to/agent-skill-library
    coreExecutable: C:/path/to/asl-harness.exe
```

`coreExecutable` 使用带 Mermaid 渲染校验的正式核心。开发时也可配置 `python`。连接和工具权限沿用 DSH，未连接时显示原因及重试入口。

## 技能预览、目录与产物

单击绑定了技能的节点，画板保留在左侧，右侧可以选择该节点的一至两个技能。文件树支持目录展开收起、搜索、方向键、Enter、右键与 Shift+F10；菜单可预览文件、进入完整编辑页、复制路径、在系统中定位以及刷新。预览中的「编辑 Markdown」或双击正文可直接改原文，Ctrl/Cmd+S 保存；有未保存内容时切换文件、节点或 Mode 会提示。

「在 Sidebar 中打开」复用可选的 Better Sidebar 文件页，并切到同一原生会话；没有这个插件时，ASL 自己的预览和编辑仍可使用。为避免宿主尚未挂载导致丢失打开请求，等目标会话挂载后才发送文件地址。

左下悬浮窗读取当前会话的真实工具调用，展示进行中、成功、失败及中断回执；最近读取技能不等同于整个业务节点已执行完成。产物从成功的写文件调用或 `asl_workspace artifact({path})` 回执发现，并确认文件仍存在。支持文本、Markdown 和常见图像预览；HTML 在沙箱中阅读。不会根据画板选择编造节点进度或完成百分比。

正常任务把文章、卡片等保存在会话当前项目；只有明确要修改技能或 Mode 时才写其定义。只读预览通过 inspection 告诉 Agent 看到了什么，进入轻量编辑后才成为当前技能编辑目标，草稿保护与完整页共用现有校验。

## 验证与限制

0.3.10 优化共享 Mermaid 画板的节点边界、文字层级、直接关系高亮和选中连线动效，复杂交互图默认以至少 85% 阅读比例打开。保留原范式、图结构及编辑方式，支持减少动态效果。实测与参考见 [画板视觉与清晰度](../../docs/plans/2026-11-12-画板视觉与清晰度.md)。

0.3.9 已完成真实模型 context → read → save 及 dirty 拒写验收，修复仅接受 JSON 字符串导致模型首次对象调用失败的问题。args 现在直接接收对象，并兼容旧字符串。原生桌面已实际返回消息和 Markdown；原生文件页自动刷新本轮未取得完整操作证据。验收过程和边界见 [真实对话与写回验收](../../docs/plans/2026-11-12-DSH真实对话与写回验收.md)。

0.3.8 使用 DSH 原有 `conversation.content` Factory；不能再次声明它已经拥有的 `conversation.session`、`conversation.composer` 或 `conversation.composer.bar`，否则注册被拒绝并出现空白。Factory 的 `views` 局部组件通过 React Portal 放入右侧回复区，底部保留同一会话的原生 Composer。原生窗口已核对输入框、权限选择、模型选择及发送按钮；真实消息往返和模型直接修改仍须单独验收。

Creator Studio 曾被旧插件追加的单一画板覆盖，并误继承正文最后一个小节标题。2026-11-12 核对 22 个节点与 17 条边均与既有 YAML 相同后，备份并移除这段追加内容，恢复 APP 原有范式标题。没有更改 YAML 架构或对其他旧图进行自动切分。

```powershell
$env:ASL_CORE_EXECUTABLE='C:/path/to/asl-harness.exe'
node --test test/*.test.cjs
```

测试覆盖与 APP 完全一致的完整图来源、旧图兼容、技能关联、真实保存、新技能引用、非法 Mermaid 拒写、过期指纹、并发及 Mode 匹配；同时运行 APP 原有标签和布局编辑测试。插件服务保存或采用后，通过修订号刷新；未保存编辑不会被刷新替换。插件以外直接修改文件需要重新读取。

2026-11-12：0.3.3 直接复用 APP 编辑器及完整图，撤回渐进浏览。原生 DSH 已验证默认画板和双击原位编辑；隔离测试环境使用同一插件组件及正式核心，验证双击改名、按住拖动、保存后撤销和文件回读。修复核心规范化文档后误报“未保存”。21 项相关测试通过。DSH 宿主仍报告 `sessionController` 不可用，原生对话和 Agent 端到端写回未通过验收。

0.3.5：白板交互统一到 APP 与 DSH 共用组件。隔离环境已验证单击选中、双击编辑、Shift 多选、框选、整组拖动、Ctrl+A/C/V/D/Z、Delete、方向键微调、H/V、滚轮缩放、Shift+1/0、Ctrl+Enter 和 ?；文字编辑中的全选与删除不影响图。保存后焦点和节点选择保持。44 项相关测试及 APP 构建通过；空格持续按住组合手势与 macOS 真机尚未实测。原生 DSH 对话服务问题与此次白板交互修复分开记录。
