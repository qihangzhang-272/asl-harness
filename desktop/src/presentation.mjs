// Categories come only from Mode content, never keyword inference in the renderer.
export const repositorySkillKey = skill => skill.repositoryPath || skill.id;

export function capabilityGroups(skills, authored = null) {
  const groups=(authored||[]).map((g,index)=>({id:`custom-${index}`,title:g.title,
    icon:typeof g.icon==='string'?g.icon:'Box',
    color:/^#[\da-f]{6}$/i.test(g.color||'')?g.color:'#007AFF',
    skills:g.skills.map(id=>skills.find(s=>s.id===id)).filter(Boolean)}));
  const assigned=new Set((authored||[]).flatMap(g=>g.skills));
  const rest=skills.filter(s=>!assigned.has(s.id));
  if(rest.length)groups.push({id:'unclassified',title:'未分类',icon:'Box',skills:rest});
  return groups;
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
      ...(form.placement ? {placement:form.placement} : {}),
      ...(form.category ? { capabilities: mode.capabilities.map(g => ({ ...g,
        skills: [...g.skills.filter(id => id !== form.id), ...(g.title === form.category ? [form.id] : [])] })) } : {}) };
  }
  return { operation: "skill.import", source: form.source, id: form.id, mode: mode.id,
    ...(form.placement ? {placement:form.placement} : {}),
    ...(form.origin ? { sourceOrigin: form.origin } : {}),
    ...(form.category ? { category: form.category } : {}),
    ...(existing ? { expected: existing.fingerprint } : {}) };
}
export function errorText(text,code) {
  const known={MERMAID_RENDER_FAILED:'图未通过验收，请修正后再保存。原有内容未变。',
    MERMAID_RENDERER_UNAVAILABLE:'图的验收工具暂时不可用，请保留草稿后重试。',
    EDIT_STALE:'内容已更新，请重新读取后再保存。未覆盖新内容。',
    MODE_INVALID:'模式结构需要修正，可交给 AI 检查。',
    EDIT_REFERENCED:'技能仍被引用，请先从对应模式中移出。'};
  if(known[code])return known[code];
  const mode=String(text).match(/^Mode (.+) has an invalid definition$/);
  if(mode)return `模式文件需要修正：modes/${mode[1]}/mode.yaml。可交给 AI 检查；若刚更新过模式库，请使用新版 App。`;
  if (text === "DeepSeek preset output directory name must match [a-z0-9][a-z0-9-]*")
    return "DeepSeek 工作模式的文件夹名需要使用小写英文、数字或短横线，例如 asl-writing。";
  if (/^Skill .+ must declare matching name and description$/.test(text))
    return "请保留技能顶部的 name 和 description（name 要与技能标识一致）。";
  return /^Skill .+ has invalid frontmatter$/.test(text)
    ? "技能开头的名称和说明格式不完整，请保留原文顶部的 --- 信息区。"
    : String(text||'操作未完成').split('\n')[0].slice(0,100);
}
export function coreError(reply) {
  return Object.assign(new Error(errorText(reply.error,reply.code)),
    {code:reply.code,details:reply.details,diagnostic:reply.error});
}
export function scopeLabel(scope, target = "") {
  return scope === "user"
    ? "我的所有项目"
    : scope === "preset"
      ? `DeepSeek 中的工作模式 · ${target}`
      : `仅项目 · ${target}`;
}
// ponytail: Mermaid owns layout and routing; this only projects validated local content.
export function diagramForMode(mode, skills, paradigmId) {
  const escape = text => String(text).replace(/["<>#\x60\r\n\u2028\u2029]/g,ch=>`#${ch.codePointAt(0)};`);
  const paradigm=mode.architecture?.paradigms?.find(p=>p.id===paradigmId)||mode.architecture?.paradigms?.[0];
  const visible=paradigm?skills.filter(s=>paradigm.skills.includes(s.id)):mode.architecture?.paradigms?[]:skills;
  const nodes=visible.map((skill,index)=>{
    const entry=mode.architecture?.nodes?.find(n=>n.skill===skill.id)||{};
    return {id:skill.id,alias:`n${index}`,data:{...entry,skill,title:entry.title||skill.title}};
  });
  const aliases=new Map(nodes.map(n=>[n.id,n.alias]));
  const edges=(paradigm?.edges||mode.architecture?.edges||[]).filter(e=>aliases.has(e.from)&&aliases.has(e.to))
    .map(e=>({source:e.from,target:e.to,label:[e.label,e.condition].filter(Boolean).join(' · ')}));
  const heading=edges.length?'flowchart LR':`block-beta\ncolumns ${Math.min(3,Math.max(1,Math.ceil(Math.sqrt(nodes.length))))}`;
  const lines=[heading,...nodes.map(n=>{
    const icon=n.data.icon||'';
    const prefix=icon.startsWith('<svg')?'◈ ':/[^\x00-\x7f]/.test(icon)?icon+' ':'';
    return `${n.alias}["${escape(prefix+n.data.title)}"]`;
  }),...edges.map(e=>`${aliases.get(e.source)} -->${e.label?`|"${escape(e.label)}"|`:''} ${aliases.get(e.target)}`)];
  return {nodes,edges,paradigm,source:lines.join('\n')};
}

export function restoreView(catalog, saved={}) {
  const mode=catalog.modes.find(m=>m.id===saved.mode);
  const page=['modes','skills','discover','updates','agents'].includes(saved.page)?saved.page:'modes';
  const skill=catalog.skills.find(s=>s.id===saved.skill && (page!=='modes'||mode?.skills.includes(s.id)));
  // The Mode page keeps two views: 逻辑架构 (map) and one grouped 技能 list.
  // Legacy 'categories' (and any 'skills') collapse into that single list; missing stays on the map.
  const view=['list','categories','skills'].includes(saved.view)?'list':'map';
  return {mode:mode?.id||'',page,view,
    skill:skill?.id||'',query:saved.query||'',provider:['github-import','local','local-modes','diagrams','dsh','github'].includes(saved.provider)?saved.provider:'github-import',githubUrl:saved.githubUrl||''};
}

const EDGE_HANDLES = ['top', 'right', 'bottom', 'left'];

// Keep authored edge meaning, including the v0.4 condition and endpoint fields, and drop
// anything the core would reject. Mirrors map_schema: endpoints must stay in the saved set.
function filterEdges(edges, included) {
  return (Array.isArray(edges) ? edges : [])
    .filter(edge => edge && included.has(edge.from) && included.has(edge.to))
    .map(edge => {
      const next = {from: edge.from, to: edge.to, label: typeof edge.label === 'string' ? edge.label : ''};
      if (typeof edge.condition === 'string' && edge.condition) next.condition = edge.condition;
      for (const key of ['sourceHandle', 'targetHandle']) if (EDGE_HANDLES.includes(edge[key])) next[key] = edge[key];
      return next;
    });
}

// layout is presentation-only: keep finite coordinates for scopes that still exist and
// members that survive, drop the rest (same rule as map_schema._pruned_layout).
function filterLayout(layout, scopes) {
  const kept = {};
  if (!layout || typeof layout !== 'object') return kept;
  for (const [scopeId, positions] of Object.entries(layout)) {
    const members = scopes[scopeId];
    if (!members || !positions || typeof positions !== 'object') continue;
    const points = {};
    for (const [skillId, point] of Object.entries(positions)) {
      if (!members.has(skillId) || !point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) continue;
      points[skillId] = {x: point.x, y: point.y};
    }
    if (Object.keys(points).length) kept[scopeId] = points;
  }
  return kept;
}

export function filterArchitecture(architecture, included) {
  if(!architecture)return architecture;
  const nodes=(architecture.nodes||[]).filter(n=>included.has(n.skill));
  if(architecture.paradigms){
    const shared=(architecture.shared||[]).filter(s=>included.has(s));
    const paradigms=architecture.paradigms
      .map(p=>({...p,skills:(p.skills||[]).filter(s=>included.has(s)),edges:filterEdges(p.edges,included)}))
      .filter(p=>p.skills.length);
    const pruned={nodes,shared,paradigms};
    if(architecture.layout){
      const scopes={shared:new Set(shared)};
      for(const paradigm of paradigms)scopes[paradigm.id]=new Set(paradigm.skills);
      const layout=filterLayout(architecture.layout,scopes);
      if(Object.keys(layout).length)pruned.layout=layout;
    }
    return pruned;
  }
  // Legacy pre-paradigm shape: there is no scope for layout to belong to, so it is dropped.
  return {nodes,edges:filterEdges(architecture.edges,included)};
}

export function allSkillSection(catalog) {
  return {id:'all',title:'全部技能',skills:[...new Set(catalog.skills.map(s=>s.id))]};
}
export function skillSections(catalog, modeId='') {
  const modes=modeId?catalog.modes.filter(m=>m.id===modeId):catalog.modes;
  const groups=modes.flatMap(mode=>{
    const architecture=mode.architecture;
    const groups=architecture?.paradigms ? [
      ...architecture.paradigms.map(p=>({id:p.id,title:p.title,skills:p.skills})),
      {id:'shared',title:'通用能力',skills:architecture.shared||[]}]
      : (mode.capabilities||[{title:'待定义工作范式',skills:mode.skills}]);
    const assigned=new Set(groups.flatMap(g=>g.skills));
    const remaining=mode.skills.filter(id=>!assigned.has(id));
    if(remaining.length)groups.push({id:'unassigned',title:'待归类',skills:remaining});
    return groups.filter(g=>g.skills.length).map((g,i)=>({...g,id:`${mode.id}/${g.id||i}`,mode:mode.id,modeTitle:mode.title}));
  });
  if(!modeId){const used=new Set(catalog.modes.flatMap(m=>m.skills));const rest=catalog.skills.filter(s=>!used.has(s.id));
    if(rest.length)groups.push({id:'unused',title:'尚未加入工作模式',modeTitle:'本地库',skills:rest.map(s=>s.id)});}
  return groups;
}
export function repositoryKey(value) {
  return (value || '').replace(/^git@github\.com:/i, 'https://github.com/')
    .replace(/\/$/, '').replace(/\.git$/i, '').toLowerCase();
}

// Discovery finds candidates; only explicitly opened libraries belong in the sidebar.
export function libraryGroups(discovered=[],roots=[],workspace=null,currentModes=null) {
  const order=[...new Set([...roots,...(workspace?[workspace]:[])])];
  return order.map(root=>{
    const found=discovered.filter(item=>item.workspace===root);
    const modes=root===workspace&&currentModes!==null?currentModes:found;
    return {root,repository:found.find(item=>item.libraryRepository)?.libraryRepository||null,
      modes:[...new Map(modes.map(item=>[item.id,{...item,workspace:root}])).values()]};
  });
}

export function matchLocalModes(modes, id, repository) {
  return (modes || []).filter(mode => mode.id === id).map(mode => ({ ...mode,
    sameSource: !!repository && repositoryKey(mode.repository || mode.upstream?.repository) === repositoryKey(repository),
  })).sort((a, b) => Number(b.sameSource) - Number(a.sameSource));
}

/* ---------------------------------------------------------------------------
 * Mode workspace: name/Markdown document plus local skill candidates.
 * These stay pure so the install rules are testable without Electron or React.
 * ------------------------------------------------------------------------- */

/** MODE.md for the editor: the name is the H1, the rest is the authored Markdown. */
export function modeDocument(name, body = '') {
  return `# ${(name || '').trim()}\n\n${(body || '').trim()}`;
}

export function readModeDocument(document) {
  const text = typeof document === 'string' ? document : '';
  return {
    name: text.match(/^#\s+(.+)$/m)?.[1]?.trim() || '',
    body: text.replace(/^#\s+.+\r?\n?/m, '').trim(),
  };
}

function localPathKey(value) {
  return value.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

const lastSegment = value => (value || '').replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() || '';

/**
 * Identity of a skill package source, never of its id: a Windows path, a file URI
 * and a repository URL that point at the same place share one key.
 */
export function sourceKey(value) {
  if (typeof value !== 'string') return '';
  const raw = value.trim();
  if (!raw) return '';
  if (/^file:\/\//i.test(raw)) {
    try {
      const pathname = decodeURIComponent(new URL(raw).pathname).replace(/^\/([a-zA-Z]:)/, '$1');
      return localPathKey(pathname);
    } catch { return localPathKey(raw.replace(/^file:\/\//i, '')); }
  }
  if (/^[a-z][\w+.-]*:\/\//i.test(raw)) return repositoryKey(raw);
  return localPathKey(raw);
}

function skillSourceKeys(skill) {
  return [skill?.source, skill?.origin, skill?.path].map(sourceKey).filter(Boolean);
}

/**
 * One install candidate per real source folder, so the same skill id found in two
 * places stays two rows and the user keeps a source choice. A same-name library
 * version is marked `reuse`/`installed` instead of being overwritten, and re-scanning
 * one folder never duplicates a row.
 */
export function localSkillCandidates(library = [], discovered = []) {
  const known = new Map();
  for (const skill of library || []) if (skill?.id) known.set(skill.id, skill);
  const rows = [];
  const seen = new Set();
  for (const item of discovered || []) {
    if (!item || typeof item.id !== 'string' || !item.id) continue;
    const key = sourceKey(item.source) || sourceKey(item.location) || `${item.id}#${rows.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const existing = known.get(item.id);
    const candidateKeys = [item.source, item.location, item.origin].map(sourceKey).filter(Boolean);
    const sameSource = !!existing && skillSourceKeys(existing).some(existingKey => candidateKeys.includes(existingKey));
    rows.push({
      id: item.id,
      title: item.title || item.id,
      description: item.description || '',
      requires: item.requires || [],
      source: item.source || item.location || '',
      location: item.location || '',
      origin: typeof item.origin === 'string' ? item.origin : '',
      inspection: item.inspection || null,
      sourceKey: key,
      state: sameSource ? 'installed' : existing ? 'reuse' : 'install',
      libraryFingerprint: existing?.fingerprint || '',
    });
  }
  // Rows that share an id would look identical, so name the folder they come from.
  const perId = new Map();
  for (const row of rows) perId.set(row.id, (perId.get(row.id) || 0) + 1);
  return rows.map(row => (perId.get(row.id) > 1
    ? {...row, title: `${row.title} · ${lastSegment(row.source) || row.id}`, sourceLabel: lastSegment(row.source) || row.source}
    : row))
    .sort((left, right) => left.id.localeCompare(right.id) || left.sourceKey.localeCompare(right.sourceKey));
}

/**
 * skill.import request for a candidate, or null when the library already owns that
 * id: a same-name version is an explicit reuse, never a silent file replacement.
 * The editor imports into the library only, so an unsaved canvas keeps its mode
 * fingerprint valid until the user saves.
 */
export function candidateImportRequest(candidate, librarySkill = null) {
  if (!candidate || typeof candidate.id !== 'string' || !candidate.id) return null;
  const source = typeof candidate.source === 'string' ? candidate.source.trim() : '';
  if (!source) return null;
  if (librarySkill) return null;
  return {operation: 'skill.import', id: candidate.id, source,
    ...(candidate.origin ? {sourceOrigin: candidate.origin} : {})};
}
