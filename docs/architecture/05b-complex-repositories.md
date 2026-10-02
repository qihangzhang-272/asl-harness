# View 5B · 复杂外部仓库拆解图（系统规则已实现，实例迁移按需）

回答：类似 Agent Reach 这种同时包含 Runtime、路由、安装器、多个后端和 Skill 入口的仓库，怎样融入 ASL 而不复制整仓、不污染所有 Mode？

> 本图的系统规则已经进入 Environment Steward。`environment.sync` 只负责在两个已合法的本地 Environment 之间显式同步完整 Skill，不负责搜索来源、自动拆仓或代替 Host 做语义关系判断。具体外部仓库是否迁移，不影响这套架构机制成立。

```mermaid
flowchart TB
    SOURCE["外部仓库 / 本机已有工具 / 官方插件<br/>来源真相，不是本地运行真源"]
    ACQUIRE["Source Acquisition<br/>用户明确指定：立即获取<br/>Host 主动发现：按缺口搜索"]
    INVENTORY["完整仓库盘点<br/>能力入口 · Runtime · scripts/assets<br/>依赖 · 安装副作用 · 登录/Secret · 许可 · 更新方式"]
    SHAPE{"仓库的能力形状"}

    ONE["单一责任<br/>一个完整本地 Skill"]
    UNIFIED["复杂 Runtime，但对 Agent 是统一责任<br/>一个 Owner Skill<br/>内部保留路由与多个后端"]
    MULTI["多个可独立调用、完成标准不同的责任<br/>拆成多个正式 Skill<br/>共同来源，但不复制方法正文"]
    ADAPTER["业务语义相同，仅宿主接线不同<br/>一个 Skill + 运行依赖说明"]
    ABSORB["与现有 Skill 重合<br/>吸收 / 合并 / requires / 明确变体"]

    RUNTIME["Runtime Installation<br/>按宿主只安装一份<br/>版本和命令写入来源/使用说明"]
    SECRETS["Host-owned State<br/>Cookie · API Key · 浏览器登录态 · Proxy<br/>永不复制进 Skill 或 Mode"]
    POOL[("Formal Skill Pool<br/>每项责任只保存一份本地真源")]
    MODE["指定或当前 Mode<br/>只增加 Skill 根引用"]
    OTHER["其他 Mode<br/>不会因为安装而自动获得能力"]
    PROJECT["Host Projection<br/>投影 Skill 闭包，不重复安装 Runtime"]

    SOURCE --> ACQUIRE --> INVENTORY --> SHAPE
    SHAPE -->|一个责任| ONE
    SHAPE -->|统一入口 + 多后端| UNIFIED
    SHAPE -->|多个独立责任| MULTI
    SHAPE -->|仅接线不同| ADAPTER
    SHAPE -->|本地已有 Owner| ABSORB
    ONE --> POOL
    UNIFIED --> POOL
    MULTI --> POOL
    ADAPTER --> POOL
    ABSORB --> POOL
    INVENTORY --> RUNTIME
    RUNTIME -.读取但不持有.-> SECRETS
    POOL -->|显式绑定| MODE
    POOL -.不自动绑定.-> OTHER
    MODE --> PROJECT

    classDef locked fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px;
    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef generated fill:#f3f4f6,stroke:#6b7280,color:#1f2937,stroke-dasharray:4 3;
    classDef source fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95;
    class SOURCE source;
    class POOL,MODE,OTHER locked;
    class ACQUIRE,INVENTORY,SHAPE,ONE,UNIFIED,MULTI,ADAPTER,ABSORB,RUNTIME done;
    class SECRETS,PROJECT generated;
```

### Agent Reach 应该怎样映射

| 外部仓库里的内容 | ASL 中的位置 | 原因 |
| --- | --- | --- |
| Python CLI / library、channel 路由、doctor、installer | 一份宿主 Runtime；由 `agent-reach` Skill 说明如何安装和检查 | 这是统一的网络访问底座，不应复制到每个 Mode |
| 面向 Agent 的使用入口、平台选择、失败与回退规则 | `skills/agent-reach/SKILL.md` | 对 Agent 是一项完整的“公开网络发现与读取”能力 |
| 上游地址、观察到的 commit、许可、本地改动 | `skills/agent-reach/SOURCE.md` | 本地 Skill 是运行真源，上游只用于追溯和升级 |
| Twitter、GitHub、YouTube、小红书等后端 | `agent-reach` 内部路由，不拆成 Mode，也默认不拆成十几个 Skill | 它们共享同一责任和统一入口，只是访问表面不同 |
| Cookie、API Key、Proxy、浏览器登录态 | Codex / Claude / DeepSeek 的宿主设施 | Secret 和用户登录状态不能进入 Skill、Mode 或 Git |
| 四个业务 Mode 的使用权 | 每个 Mode 各自显式引用同一份 `agent-reach` | 一份能力、多处复用；Mode 不复制代码，也不隐式继承 |

如果复杂仓库确实包含多个可以独立交付、完成标准不同的能力，才拆成多个正式 Skill。仓库目录多、脚本多或支持平台多，本身都不是拆分理由。

---
