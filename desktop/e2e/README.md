# 桌面验收

在仓库根安装 Python 测试依赖 `python -m pip install -e ".[test]"`，然后在 `desktop/` 执行 `npm ci`、`npm run test:e2e`。非默认 Python 可用 `ASL_PYTHON` 指定可执行文件。

使用公开示例生成临时库与独立用户目录，不访问个人技能内容，不配置真实 Agent。实际启动 Electron、操作界面、经过 Python 写入门控，保存截图和回读结果。覆盖原生创建、技能依赖、撤销重做、右键添加、离开草稿保护、保存回读、完整技能、坏图拒写、时序/状态/思维导图、旧格式范式切换及返回列表；旧格式仅打开不写盘。来源读取、同名库身份、非受管文件保护另由 `npm test` 中的真实核心/边界测试覆盖。

`structure.cjs` 另验收时序参与者与消息拖拽、名称/消息/备注/条件原位编辑、备注移除、思维导图完整子树移动与移除/撤销/重做、状态名称编辑及技能打开。操作后回读 MODE.md，不以 SVG 临时位置代替保存结果；放大后继续编辑，后台刷新不能取消拖拽或挤动画板。

`canvas.cjs` 验收右键创建三类模板、消息与备注增减／端点选择、整个条件组拖动及分支增减、参与者关联清理、无组合键的思维导图同级排序、流程图拖线／排序／方向、全屏、撤销重做、保存重开。再由真实 CLI 预检和写入普通 Mermaid 草稿，App 发现后继续鼠标编辑；没有运行模型，也不访问真实业务库。时序线条边缘的点击命中与原位改字单独检查。

`continuity.cjs` 验收本地与云端的位置隔离、刷新后的技能定位、首次连接失败重试、无 Agent 配置的技能发现及选库、图文阅读和显式原文编辑；另覆盖文件读取失败重试、现有/新建技能的侧栏离页保护、取消后的迟到仓库结果、首次工作库失败后的恢复，以及自选目录与后台扫描竞态。远端更新与临时故障使用确定性 IPC 桩，其余导航、渲染与本地文件操作使用真实 App。

Windows CI 自动运行；Linux 的 GUI 尚未在本轮验收。截图及结果放在系统临时目录的 `asl-e2e-*`，可以用 `ASL_E2E_OUTPUT` 指定已存在的输出目录。失败保留截图，不自动删除证据。

验收便携包：设置 `ASL_TEST_EXE` 为待验收 EXE 的绝对路径，然后执行 `node --test --test-concurrency=1 e2e/workspace.cjs e2e/structure.cjs e2e/canvas.cjs e2e/continuity.cjs`。开发 GUI 通过不代表最终打包文件已验收。

性能对照：先保留改动前 `dist/`，构建新代码，将 `ASL_PERF_BASELINE` 指向旧目录，执行 `npm run test:performance`。`ASL_PERF_OUTPUT` 指定结果 JSON。脚本交替测量 A/B 各十轮，使用相同核心与示例，计时前分别预热选中的前端资源；它测前端重载，不冒充操作系统冷启动或真实 GitHub 网络性能。

核心读取对照：保存改动前 `src/`，将 `ASL_PERF_CORE_BASELINE` 指向其父目录，`ASL_PERF_WORKSPACE` 指向同一份测试库，`ASL_PERF_OUTPUT` 指定结果；在仓库根执行 `node perf/bench/loading.cjs`。两版完整 JSON 必须相同，再报告目录和技能文件读取 p50/p75/p95。只读测量，不生成投影或修改该库。

相同变量也可在 `desktop/` 运行 `npm run test:performance`，测工作库列表、实际 SVG 和点击节点后的 Markdown。测试夹具只替换 Python 子进程的模块路径，不在生产 App 新增核心切换配置。额外使用 `ASL_PERF_BASELINE` 会同时替换前端；隔离核心改动时应不设置它。各组使用独立 App 用户目录，冷缓存/网络/最终 EXE 不在这个口径内。
