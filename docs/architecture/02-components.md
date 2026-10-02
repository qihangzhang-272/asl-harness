# View 2 · Harness 与 Environment 组件图

回答：空白 Harness 内有什么，个人 Environment 内有什么，两者怎样分工？

```mermaid
flowchart TB
    subgraph SYSTEM["Harness System · 始终存在 · 不是业务 Mode"]
        CORE["Deterministic Core / CLI<br/>同源契约、完整文件读写与宿主适配<br/>隔离候选 / 实际渲染 / 协作锁 / 指纹"]
        STEWARD["Environment Steward · 已实现系统契约<br/>按任务检查 / 关系判断 / 本地化 / 最小影响半径<br/>Runtime 边界 / 单 Mode 绑定 / CRUD 保护"]
        ACCESS["Environment Access · 已实现最小访问面<br/>常驻摘要 / 按需读取 / WORKSPACE 视图"]
        GUARDS["Deterministic Guards · 已实现<br/>结构 / 依赖 / 生命周期 / Secret 文件名 / 路径<br/>旧布局 / 用户文件碰撞 / 来源漂移"]
        CORE --> GUARDS
        STEWARD --> GUARDS
    end

    subgraph ENV["Personal Environment · 唯一运行真源"]
        PROFILE["PROFILE.md<br/>跨 Mode 精简长期边界"]
        SKILLS[("skills/<skill-id><br/>完整正式 Skill Pool")]
        MODES[("modes/<mode-id><br/>业务工作场 / Skill 子图")]
        LEARNING["candidates / trials / feedback / archive<br/>培养与追溯证据，不进入活动能力面"]
        VIEW["WORKSPACE.md<br/>确定性派生的人机共读地图"]
        GIT["Git<br/>历史、diff 审计和恢复"]
        SKILLS -->|requires 硬依赖| SKILLS
        MODES -->|显式 Skill 根| SKILLS
        PROFILE -.摘要.-> VIEW
        SKILLS -.能力地图.-> VIEW
        MODES -.Mode 地图.-> VIEW
        LEARNING -.状态摘要.-> VIEW
        PROFILE --> GIT
        SKILLS --> GIT
        MODES --> GIT
        LEARNING --> GIT
    end

    CORE --> ENV
    ACCESS -->|同一机器契约与文件读取| CORE
    STEWARD -->|最小候选修改与错误修正| CORE

    classDef locked fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px;
    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d;
    class CORE,STEWARD,ACCESS,GUARDS,PROFILE,SKILLS,LEARNING,VIEW,GIT done;
    class MODES locked;
```

这里没有管理 Mode。能力发现、培养、增删改查保护和记忆访问属于 Harness 系统层；内容创作、产品分析和投资研究才属于业务 Mode。

CLI 是既有 Core 的机器接口，不是新增服务或业务调度层。App 与 Agent 的完整读写链和边界见 [View 2G](02g-agent-cli.md)；各内容 Environment 共用实现，但保持独立所有权。

Harness 的 Hook / Guard 只处理可确定的边界，不接管业务判断：

| 级别 | 处理方式 | 典型对象 |
| --- | --- | --- |
| 硬阻断 | 拒绝相应写入或投影，返回具体错误 | 结构非法、正式 Skill / Candidate 无来源、依赖缺失/循环、Trial 不完整、Secret 文件名、路径逃逸、覆盖非受管文件、受管内容指纹不符、固定 Workflow/Run 回流 |
| 软提醒 | 任务可继续，只提示应刷新或检查 | 缓存或可重建依赖、`WORKSPACE.md` 过期、宿主投影漂移、Candidate 未决定、上游出现新版本、两个 Skill 可能重合 |
| Host + 用户判断 | 不伪装成确定性规则；当前 Host 起草方案，高影响动作由用户授权 | 是否需要新 Mode、候选是否值得采用、Skill 应合并还是独立、是否发布或外部写入 |

这样既防止 Environment 漂移，也不会因为一个缺失字段、过期视图或语义不确定就阻断用户的普通 Goal。

---
