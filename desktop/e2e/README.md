# 桌面验收

在仓库根安装 Python 测试依赖 `python -m pip install -e ".[test]"`，然后在 `desktop/` 执行 `npm ci`、`npm run test:e2e`。非默认 Python 可用 `ASL_PYTHON` 指定可执行文件。

使用公开示例生成临时库与独立用户目录，不访问个人技能内容，不配置真实 Agent。实际启动 Electron、操作界面、经过 Python 写入门控，保存截图和回读结果。覆盖原生创建、技能依赖、撤销重做、右键添加、离开草稿保护、保存回读、完整技能、坏图拒写、时序/状态/思维导图、旧格式范式切换及返回列表；旧格式仅打开不写盘。来源读取、同名库身份、非受管文件保护另由 `npm test` 中的真实核心/边界测试覆盖。

`structure.cjs` 另验收时序参与者与消息拖拽、名称/消息/备注/条件原位编辑、备注移除、思维导图完整子树移动与移除/撤销/重做、状态名称编辑及技能打开。操作后回读 MODE.md，不以 SVG 临时位置代替保存结果；放大后继续编辑，后台刷新不能取消拖拽或挤动画板。

Windows CI 自动运行；Linux 的 GUI 尚未在本轮验收。截图及结果放在系统临时目录的 `asl-e2e-*`，可以用 `ASL_E2E_OUTPUT` 指定已存在的输出目录。失败保留截图，不自动删除证据。

验收便携包：设置 `ASL_TEST_EXE` 为待验收 EXE 的绝对路径，然后执行 `node --test --test-concurrency=1 e2e/workspace.cjs e2e/structure.cjs`。开发 GUI 通过不代表最终打包文件已验收。

性能对照：先保留改动前 `dist/`，构建新代码，将 `ASL_PERF_BASELINE` 指向旧目录，执行 `npm run test:performance`。`ASL_PERF_OUTPUT` 指定结果 JSON。脚本交替测量 A/B 各十轮，使用相同核心与示例，计时前分别预热选中的前端资源；它测前端重载，不冒充操作系统冷启动或真实 GitHub 网络性能。
