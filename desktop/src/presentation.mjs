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
export function capabilityGroups(skills, authored = null) {
  if (Array.isArray(authored)) {
    const assigned = new Set(authored.flatMap(g => g.skills));
    const groups = authored.map((g, index) => ({ id: `custom-${index}`, title: g.title,
      icon: typeof g.icon === 'string' ? g.icon : GROUPS.find(row => row[1] === g.title)?.[2] || "Box",
      color: /^#[\da-f]{6}$/i.test(g.color || '') ? g.color : '#007AFF',
      skills: g.skills.map(id => skills.find(s => s.id === id)).filter(Boolean) }));
    const rest = skills.filter(s => !assigned.has(s.id));
    if (rest.length) groups.push({ id: "unclassified", title: "未分类", icon: "Box", skills: rest });
    return groups;
  }
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
export function adoptionRequest(form, catalog) {
  const mode = catalog.modes.find(m => m.id === form.mode);
  if (!mode) throw new Error("请先选择一个 Mode。");
  const existing = catalog.skills.find(s => s.id === form.id);
  if (existing && form.useExisting) {
    return { operation: "mode.save", id: mode.id, expected: mode.fingerprint,
      document: mode.document, skills: [...new Set([...mode.roots, form.id])],
      ...(form.category ? { capabilities: mode.capabilities.map(g => ({ ...g,
        skills: [...g.skills.filter(id => id !== form.id), ...(g.title === form.category ? [form.id] : [])] })) } : {}) };
  }
  return { operation: "skill.import", source: form.source, id: form.id, mode: mode.id,
    ...(form.origin ? { sourceOrigin: form.origin } : {}),
    ...(form.category ? { category: form.category } : {}),
    ...(existing ? { expected: existing.fingerprint } : {}) };
}
export function errorText(text) {
  if (text === "DeepSeek preset output directory name must match [a-z0-9][a-z0-9-]*")
    return "DeepSeek 预设的文件夹名需要使用小写英文、数字或短横线，例如 asl-writing；上级路径可以包含中文。";
  if (/^Skill .+ must declare matching name and description$/.test(text))
    return "请保留技能顶部的 name 和 description（name 要与技能标识一致）。";
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
// ponytail: Mermaid owns layout and routing; this only projects validated local content.
export function diagramForMode(mode, skills) {
  const escape = text => String(text).replace(/["<>#\x60\r\n\u2028\u2029]/g,ch=>`#${ch.codePointAt(0)};`);
  const nodes=skills.map((skill,index)=>{
    const entry=mode.architecture?.nodes?.find(n=>n.skill===skill.id)||{};
    return {id:skill.id,alias:`n${index}`,data:{...entry,skill,title:entry.title||skill.title}};
  });
  const aliases=new Map(nodes.map(n=>[n.id,n.alias]));
  const edges=(mode.architecture?.edges||[]).filter(e=>aliases.has(e.from)&&aliases.has(e.to))
    .map(e=>({source:e.from,target:e.to,label:e.label}));
  const heading=edges.length?'flowchart TB':`block-beta\ncolumns ${Math.min(3,Math.max(1,Math.ceil(Math.sqrt(nodes.length))))}`;
  const lines=[heading,...nodes.map(n=>{
    const icon=n.data.icon||'';
    const prefix=icon.startsWith('<svg')?'◈ ':/[^\x00-\x7f]/.test(icon)?icon+' ':'';
    return `${n.alias}["${escape(prefix+n.data.title)}"]`;
  }),...edges.map(e=>`${aliases.get(e.source)} -->${e.label?`|"${escape(e.label)}"|`:''} ${aliases.get(e.target)}`)];
  return {nodes,edges,source:lines.join('\n')};
}

export function restoreView(catalog, saved={}) {
  const mode=catalog.modes.find(m=>m.id===saved.mode)||catalog.modes[0];
  const page=['modes','skills','discover','updates','agents'].includes(saved.page)?saved.page:'modes';
  const skill=catalog.skills.find(s=>s.id===saved.skill && (page!=='modes'||mode?.skills.includes(s.id)));
  return {mode:mode?.id||'',page,view:['map','categories','list'].includes(saved.view)?saved.view:'map',
    skill:skill?.id||'',query:saved.query||'',provider:['github-import','local','dsh','github'].includes(saved.provider)?saved.provider:'github-import',githubUrl:saved.githubUrl||''};
}

export function filterArchitecture(architecture, included) {
  if(!architecture)return architecture;
  return {nodes:(architecture.nodes||[]).filter(n=>included.has(n.skill)),
    edges:(architecture.edges||[]).filter(e=>included.has(e.from)&&included.has(e.to))};
}
export function repositoryKey(value) {
  return (value || '').replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/\/$/, '').replace(/\.git$/i, '').toLowerCase();
}

export function matchLocalModes(modes, id, repository) {
  return (modes || []).filter(mode => mode.id === id).map(mode => ({ ...mode,
    sameSource: !!repository && repositoryKey(mode.repository || mode.upstream?.repository) === repositoryKey(repository),
  })).sort((a, b) => Number(b.sameSource) - Number(a.sameSource));
}
