// Display groups help reading. They never route skills or invent dependencies.
const GROUPS = [
  [
    "publish",
    "发布与交付",
    "Send",
    /发布|post-to|发布准备|publish|compress-image/i,
  ],
  [
    "layout",
    "排版与文档",
    "PanelsTopLeft",
    /排版|markdown-to-html|format-markdown|layout/i,
  ],
  [
    "visual",
    "视觉表达",
    "Palette",
    /配图|插画|漫画|图表|视觉|信息图|illustrat|infographic|comic|image-gen|diagram|cover-image|chart/i,
  ],
  [
    "writing",
    "写作与表达",
    "PenLine",
    /写作|成稿|writing.style|memo|writer|文案/i,
  ],
  [
    "analysis",
    "分析与判断",
    "ChartNoAxesCombined",
    /估值|财务|投资判断|评分|尽调|产品分析|竞争格局|单位经济|valuation|financial|analy|scorecard|thesis|economics/i,
  ],
  [
    "research",
    "研究与资料",
    "Search",
    /研究|检索|搜索|语料|资料|归档|research|archive|agent-reach|deposition/i,
  ],
];
export function capabilityGroups(skills) {
  const groups = new Map();
  for (const skill of skills) {
    const name = `${skill.title} ${skill.id}`;
    const group = GROUPS.find((row) => row[3].test(name)) ||
      GROUPS.find((row) => row[3].test(skill.description || "")) || [
        "other",
        "其他能力",
        "Box",
      ];
    if (!groups.has(group[0]))
      groups.set(group[0], {
        id: group[0],
        title: group[1],
        icon: group[2],
        skills: [],
      });
    groups.get(group[0]).skills.push(skill);
  }
  return [...groups.values()].sort(
    (a, b) =>
      ((GROUPS.findIndex((g) => g[0] === a.id) + 10) % 10) -
      ((GROUPS.findIndex((g) => g[0] === b.id) + 10) % 10),
  );
}
export function shortText(text, limit = 90) {
  const plain = (text || "").replace(/[#*`]/g, "").replace(/\s+/g, " ").trim();
  return plain.length > limit ? `${plain.slice(0, limit)}…` : plain;
}
export function errorText(text) {
  if (text === "DeepSeek preset output directory name must match [a-z0-9][a-z0-9-]*")
    return "DeepSeek 预设的文件夹名需要使用小写英文、数字或短横线，例如 asl-writing；上级路径可以包含中文。";
  if (/^Skill .+ must declare matching name, description, and 完成标准$/.test(text))
    return "请保留技能顶部的 name 和 description（name 要与技能标识一致），并补全“## 完成标准”。";
  return /^Skill .+ has invalid frontmatter$/.test(text)
    ? "技能开头的名称和说明格式不完整，请保留原文顶部的 --- 信息区。"
    : text;
}
export function scopeLabel(scope, target = "") {
  return scope === "user"
    ? "我的所有项目"
    : scope === "preset"
      ? `仅预设 · ${target}`
      : `仅项目 · ${target}`;
}
export function graphForMode(mode, skills, expanded = new Set()) {
  const groups = capabilityGroups(skills);
  const nodes = [];
  const edges = [];
  let y = 0;
  for (const group of groups) {
    const open = expanded.has(group.id);
    const height = open ? Math.max(76, group.skills.length * 90) : 76;
    nodes.push({
      id: `group:${group.id}`,
      type: "capability",
      position: { x: 270, y: y + (height - 67) / 2 },
      data: {
        kind: "group",
        group,
        open,
        title: group.title,
        count: group.skills.length,
      },
      width: 222,
      height: 67,
    });
    edges.push({
      id: `member:${group.id}`,
      source: "mode",
      target: `group:${group.id}`,
      type: "smoothstep",
      data: { kind: "contains" },
      style: { stroke: "#bec9d5" },
    });
    if (open)
      group.skills.forEach((skill, index) => {
        nodes.push({
          id: `skill:${skill.id}`,
          type: "capability",
          position: { x: 566, y: y + index * 90 },
          data: { kind: "skill", skill, title: skill.title },
          width: 280,
          height: 74,
        });
        edges.push({
          id: `contains:${skill.id}`,
          source: `group:${group.id}`,
          target: `skill:${skill.id}`,
          type: "smoothstep",
          data: { kind: "contains" },
          style: { stroke: "#d7dde5" },
        });
      });
    y += height + 18;
  }
  nodes.unshift({
    id: "mode",
    type: "capability",
    position: { x: 0, y: Math.max(0, (y - 130) / 2) },
    data: { kind: "mode", title: mode.title, count: skills.length },
    width: 210,
    height: 110,
  });
  const visible = new Set(nodes.map((n) => n.id));
  for (const skill of skills)
    for (const required of skill.requires || []) {
      if (visible.has(`skill:${skill.id}`) && visible.has(`skill:${required}`))
        edges.push({
          id: `requires:${skill.id}:${required}`,
          source: `skill:${skill.id}`,
          target: `skill:${required}`,
          type: "smoothstep",
          label: "依赖",
          data: { kind: "requires" },
          style: { stroke: "#9a80c4", strokeDasharray: "4 4" },
        });
    }
  return { nodes, edges };
}
