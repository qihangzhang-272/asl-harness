// Native Mermaid syntax examples, not generated workflows for a user's Mode.
export const diagramExamples=[
  {id:'flow',title:'分支与反馈',source:'flowchart LR\n A("材料")\n B{"信息足够？"}\n C("补充检索")\n D("形成判断")\n A --> B\n B -->|否| C\n C --> B\n B -->|是| D'},
  {id:'sequence',title:'时序',source:'sequenceDiagram\n participant U as 用户\n participant A as Agent\n participant S as 技能\n U->>A: 提出任务\n A->>S: 读取方法\n S-->>A: 证据与规则\n A-->>U: 可核对的结果'},
  {id:'mindmap',title:'思维导图',source:'mindmap\n root((工作模式))\n  研究\n   检索\n   证据\n  表达\n   文章\n   图示'},
  {id:'state',title:'状态',source:'stateDiagram-v2\n [*] --> 草稿\n 草稿 --> 核对\n 核对 --> 草稿: 补充\n 核对 --> 可用\n 可用 --> [*]'},
  {id:'architecture',title:'架构',source:'architecture-beta\n group local(cloud)[Workspace]\n service files(disk)[Files] in local\n service app(server)[App] in local\n service agent(server)[Agent]\n files:R -- L:app\n app:R --> L:agent'},
  {id:'class',title:'类型关系',source:'classDiagram\n class Mode {\n  工作目的\n }\n class Skill {\n  方法与内容\n }\n Mode "1" --> "多" Skill : 组织'},
  {id:'er',title:'数据关系',source:'erDiagram\n MODE ||--o{ MEMBERSHIP : contains\n SKILL ||--o{ MEMBERSHIP : belongs'},
  {id:'timeline',title:'时间线',source:'timeline\n title 内容培养\n 收集 : 留下材料\n 整理 : 形成方法\n 使用 : 积累经验\n 更新 : 修订能力'},
  {id:'journey',title:'使用旅程',source:'journey\n title 整理工作环境\n section 查看\n  找到技能: 3: 用户\n section 组织\n  放入模式: 5: 用户, Agent\n  核对结果: 5: 用户'},
  {id:'gantt',title:'计划',source:'gantt\n title 工作安排示例\n dateFormat YYYY-MM-DD\n section 研究\n 收集材料 :a, 2026-09-30, 2d\n 核对证据 :b, after a, 1d\n section 表达\n 形成稿件 :c, after b, 2d'},
  {id:'block',title:'模块',source:'block-beta\n columns 2\n skills["技能"] mode["工作模式"]\n files["本地文件"] agent["Agent"]'},
  {id:'git',title:'版本演化',source:'gitGraph\n commit id: "收集"\n branch refine\n checkout refine\n commit id: "整理"\n checkout main\n merge refine\n commit id: "使用"'},
];
