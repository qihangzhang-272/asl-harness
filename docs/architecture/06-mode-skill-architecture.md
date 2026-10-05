# View 6 · Mode 是能力子图，不是 Workflow

### 工作范式的结构与增删边界（v0.4）

Mode 是一个工作环境，范式是环境里积累的常用配合方式。通用能力服务这个 Mode，不是跨 Mode 的隐式召回。全部技能页面按这些真实定义分组，分类和图不再由前端关键词推断。

```mermaid
flowchart LR
    FILE["mode.yaml<br/>技能引用 + 范式 + 通用能力"]:::locked
    HUMAN["App 独立编辑页<br/>目录 / Markdown / 范式编辑"]:::done
    AGENT["当前 Agent<br/>按协议编辑文件或 CLI"]:::locked
    CHECK["确定性校验<br/>归属完整 / 引用有效 / 关系有说明<br/>安全显示字段 / 并发与路径边界"]:::done
    MAP["Mermaid 原文 / 既有关系投影<br/>按工作范式阅读；通用能力独立区"]:::generated
    HOST["宿主投影<br/>范式说明与通用能力清单"]:::generated
    REMOVE["移出成员<br/>清理分类、节点、范式成员和边<br/>不删除 Skill 文件"]:::done
    HUMAN --> CHECK
    AGENT --> CHECK
    CHECK --> FILE
    FILE --> MAP
    FILE --> HOST
    FILE --> REMOVE
    REMOVE --> CHECK
    classDef locked fill:#dbeafe,stroke:#2563eb,color:#1e3a8a;
    classDef done fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef generated fill:#f3f4f6,stroke:#6b7280,color:#1f2937;
```

图中的边只是工作关系；允许分支、汇合、树和反馈环。软件 `requires` 的依赖检查仍独立存在，不能拿软件依赖替代工作经验。没有明确关联时不凭空补线。新增业务范式、修改显示名称、移除分类都只改内容文件，不生成组件、脚本或数据库字段。

作者图以 `MODE.md` 中的 Mermaid 原文为准；时序和思维图拖拽修改顺序或父子关系，再由官方渲染器排版。基础流程图可直接移动节点，手工位置及两端连接点保存在同图的合法注释中，普通 Mermaid 阅读器仍可自动排版，不新增独立坐标真源。成员身份仍由 YAML 定义；图中移出不等于删除技能。各图型的编辑范围与保护见 [View 2D](02d-app-navigation.md)。

v0.4 新建要求覆盖闭包成员；添加成员必须选范式或通用能力。旧 v0.3 可读但标记待定义。删除范式时若使成员无归属，编辑器要求重新归属后再保存；移出技能自动清理失效引用。纯通用工具 Mode 可以没有业务范式。

回答：不同 Mode 如何共享 Skill，又为什么不会跨 Mode 隐式调用？

**范围：**下图只说明成员共享；协作关系由各 Mode 的作者 Mermaid 表达，不从分类树推断。工作场景、上下文或工具使用方法需要沉淀时仍封装为 Skill，不另设场景／上下文对象。普通 Mermaid 的分组、条件、备注不冒充可执行 Skill；真实技能通过稳定 ID 对应已有完整包。

新建图选择轻量模板，Agent 也可写入普通 Mermaid 后交给用户继续结构编辑。三类模板与鼠标操作约束统一见 [View 2D](02d-app-navigation.md)，执行步骤见[当前画板计划](../plans/2026-10-04-mouse-first-mermaid.md)。不得把“能渲染任意原生图型”写成“所有图型已支持全语法可视编辑”。

```mermaid
flowchart TB
    AR["agent-reach<br/>共享底层研究能力"]
    DIAGRAM["baoyu-diagram<br/>共享结构表达能力"]
    VALUATION["investment-valuation-returns<br/>共享估值能力"]

    CREATOR["creator-studio<br/>业务 Mode"]
    PRODUCT["product-lab<br/>业务 Mode"]
    INVEST["investment-desk<br/>业务 Mode"]
    CAPITAL["capital-markets-desk<br/>业务 Mode"]

    WRITING["public-account-writing-style"]
    LAYOUT["qihang-wechat-layout"]
    PUBLISH["baoyu-post-to-wechat"]
    PRODUCT_JUDGMENT["ai-product-analyzer"]
    INVEST_RESEARCH["investment-research"]
    IC_MEMO["investment-ic-memo-writer"]
    COMPANY["financial-company-profile"]
    COVERAGE["public-equity-coverage-writer"]

    CREATOR --> AR
    CREATOR --> WRITING
    CREATOR --> LAYOUT
    CREATOR --> PUBLISH
    PRODUCT --> AR
    PRODUCT --> PRODUCT_JUDGMENT
    PRODUCT --> DIAGRAM
    INVEST --> AR
    INVEST --> INVEST_RESEARCH
    INVEST --> VALUATION
    INVEST --> IC_MEMO
    CAPITAL --> AR
    CAPITAL --> COMPANY
    CAPITAL --> VALUATION
    CAPITAL --> COVERAGE

    classDef mode fill:#dbeafe,stroke:#2563eb,color:#1e3a8a,stroke-width:2px;
    classDef shared fill:#dcfce7,stroke:#16a34a,color:#14532d;
    classDef skill fill:#f3f4f6,stroke:#6b7280,color:#1f2937;
    class CREATOR,PRODUCT,INVEST,CAPITAL mode;
    class AR,DIAGRAM,VALUATION shared;
    class WRITING,LAYOUT,PUBLISH,PRODUCT_JUDGMENT,INVEST_RESEARCH,IC_MEMO,COMPANY,COVERAGE skill;
```

蓝色节点是 Mode，其他节点是完整 Skill。箭头表示“这个 Mode 能看见这项能力”，不表示先后顺序。同一个正式 Skill 可以被多个 Mode 显式选择，但只保存一份正文。

---
