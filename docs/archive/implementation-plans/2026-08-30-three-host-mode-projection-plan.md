# ASL 三宿主 Mode 投影实施计划

> 历史实施记录。当前实现已经完成本计划，并由 v0.3 SPEC、ADR-0020、23 项测试和实时 Environment 校验继续维护。

## 1. 重建 Mode-only 领域模型

- 删除 v0.1/v0.2、Workflow、Run、sidecar contract 与旧 manifest 分支。
- 重写 `Workspace.open()`、Skill/Mode 扫描、依赖闭包、来源指纹。
- 先用失败测试覆盖旧结构回流、缺失依赖、循环依赖与非最小 Mode 字段。
- 验证：`pytest` 中 Workspace 单元测试全部通过，源文件不再出现旧 API 版本与 Workflow 类型。

## 2. 收敛宿主投影

- 把 Adapter 收敛为一个公共投影算法和三个原生 layout。
- 实现当前 Mode 切换、受管理表面保护、同 HEAD 来源漂移检查。
- 验证：Codex、Claude、DeepSeek 三种 layout 的投影与验证参数化测试通过。

## 3. 实现 DeepSeek Agent Preset 导出

- 从用户指定的 base preset 复制完整目录。
- 只替换唯一 Persona 与 skill-filesystem 配置；Skill package 作为自包含副本写入 Preset。
- 使用临时目录和 ASL 标记保护刷新，不覆盖未知目录。
- 验证：生成的 `agent.cordis.yml` 保留 base 的其他插件行，Mode 只看见目标 Skill 闭包；错误 base 明确失败。

## 4. 收敛 CLI 与文档

- CLI 只保留 `workspace.validate`、`workspace.view.sync`、`host.project`、`host.verify`、`deepseek.preset.export`。
- README 改写为 v0.3 当前能力、整体架构图、目录、命令、宿主差异、失败边界与尚未实现事项。
- 更新协议 README/SPEC 中的实现状态，删除 Mode 维护权限字段。
- 验证：帮助文本与 README 一致，协议文档校验通过。

## 5. 真实最小验收

- 在临时目录建立一个含两个有依赖 Skill、两个 Mode 的 Environment。
- 分别完成三宿主投影、Mode 切换、漂移检测和 DeepSeek Preset 导出。
- 运行 `pytest`、`git diff --check`、协议 `validate_docs.py`。
- 只有全部通过后，README 才把状态从“设计稿”改为“v0.3 可运行核心”；不宣称真实复杂 Case 已成熟。
