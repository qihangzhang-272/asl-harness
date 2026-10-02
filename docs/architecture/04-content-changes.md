# View 4 · Skill / Mode 变更时序

回答：Mode 和 Skill 的增删改查如何与普通内容分开，谁负责起草、校验和授权？

```mermaid
sequenceDiagram
    autonumber
    actor U as 用户
    participant H as 当前 Host
    participant E as Environment Steward
    participant W as 隔离变更区
    participant CLI as Harness CLI / Guards
    participant G as 本地 Environment
    participant P as Host Projections

    U->>H: 明确反馈、采用要求或结构变更目标
    H->>E: 判断最小影响半径与责任对象
    alt 用户明确指定外部能力并要求融入
        E->>W: 根据任务检查相关来源并起草正式本地 Skill
        Note over H,W: 不强制 Candidate、Trial、示例或效果 Case
    else 来源、重合、安全或运行方式仍不确定
        E->>W: 建立可选 Candidate / Trial
        H->>W: 只做解决该不确定性的最小检查
    else 修改现有 Skill
        E->>W: 起草正式 Skill 的最小 diff
    else 修改 Mode
        E->>W: 起草隔离的最小 Mode diff
        H->>W: 用代表性 Case 检查能力面与边界
    end
    E->>CLI: 候选请求与读入时的指纹
    alt 删除、发布、外部写入或其他高影响动作
        CLI-->>H: 返回结构和引用事实，不代替授权
        H->>U: 列出路径、原因和影响
        U-->>H: 授权或拒绝
    end
    CLI->>W: 固定私有候选，不采用之后变化的源字节
    CLI->>CLI: 结构、引用、路径与 Mermaid 实际渲染
    alt 候选不通过
        CLI-->>E: 非零退出码、错误定位与修正信息
        E->>W: 修正候选，重新提交
        Note over CLI,G: 正式文件不改变
    else 候选通过
        CLI->>CLI: 协作写锁内核对版本与落地字节
        CLI->>G: 写入验收过的候选，异常时恢复
        CLI-->>E: 正式结果与最新指纹
        Note over G,P: 内容修改不自动重配宿主
        opt 用户另行要求更新宿主
            E->>CLI: 已确认的宿主投影请求
            CLI->>P: 只更新受影响的受管内容
        end
    end
```

AI 根据任务与具体 Skill 判断阅读深度，并起草完整本地能力包。用户明确指定引入时，可以直接进入正式 Skill Pool；确定性结构校验和高影响授权仍保留，但不再用 Trial、示例或效果测试拖延采用。普通任务材料不能在没有明确长期意图时自动修改正式 Skill 或 Mode。

App 与 Agent 共用这条内容写入链，具体契约见 [View 2G](02g-agent-cli.md)。协作锁约束遵守 CLI 的写入者，异常恢复不等于断电恢复或多文件原子可见性；绕过接口直接改磁盘不属于已验收提交。Git 保存历史的操作由用户或获得授权的 Agent 决定，不因一次保存自动提交。

---
