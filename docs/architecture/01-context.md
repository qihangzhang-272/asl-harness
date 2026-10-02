# View 1 · 系统上下文图

回答：ASL 在整个使用场景中处于什么位置，谁负责执行，什么是真源？

```mermaid
flowchart LR
    USER["用户<br/>Goal · 材料 · 明确反馈 · 高影响授权"]
    HOST["当前 Host · 唯一执行者<br/>Codex App / Claude Code / DeepSeek Harness"]
    HARNESS["ASL Harness<br/>空白框架 · 校验 · 维护保护 · 投影"]
    LIBRARY["Agent Skill Library<br/>装填后的业务 Environment 发行版"]
    ENV[("Personal Environment<br/>用户本地 Git 运行真源")]
    CASE["Case<br/>一次目标、材料、证据、产物与交付"]
    EXTERNAL["外部能力来源<br/>Skill / Prompt / MCP / API / Agent / Model / Script"]
    PROJECTION["Host Projection<br/>可删除、可重建"]

    APP["独立 ASL App · 桌面预览版<br/>查看 / 内容迁移 / 宿主文件应用<br/>连接与培养待补"]
    USER -->|管理自己的工作环境| APP
    APP -->|调用同一底座| HARNESS
    USER -->|提出目标与确认边界| HOST
    HARNESS -->|初始化或维护| ENV
    LIBRARY -->|选择、复制或 Fork| ENV
    ENV -->|Profile + 当前 Mode + Skill Catalog| HOST
    HOST -->|按需读取完整 Skill| ENV
    HOST -->|完成真实工作| CASE
    CASE -->|明确能力缺口或长期反馈| HOST
    EXTERNAL -->|明确指定则直接本地化；不确定时可先 Candidate / Trial| ENV
    ENV -->|确定性生成| PROJECTION
    PROJECTION -->|宿主发现当前 Mode| HOST

    classDef locked fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px;
    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef generated fill:#f3f4f6,stroke:#6b7280,color:#1f2937,stroke-dasharray:4 3;
    classDef source fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95;
    classDef pending fill:#ffedd5,stroke:#ea580c,color:#7c2d12;
    class APP pending;
    class USER,HOST,HARNESS,LIBRARY,ENV locked;
    class CASE done;
    class PROJECTION generated;
    class EXTERNAL source;
```

关键边界：Harness 不替 Host 执行业务 Goal。外部业务能力通过责任 Skill 本地化；宿主已有模型、工具和插件执行机制无需再包一层。用户明确要求“找来并融入”时，可以检查相关来源后直接采用，不必先跑 Trial 或效果 Case。具体阅读范围不由 Harness 统一规定。

---
