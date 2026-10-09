// Skill membership, protocol validation and bounded draft history. No renderer dependency.
import {diagramsIn} from './mermaid-document.mjs';

export const SHARED = 'shared';
export const HANDLES = Object.freeze(['top', 'right', 'bottom', 'left']);
export const LIMITS = Object.freeze({
  title: 80, description: 1200, note: 1200, label: 80, condition: 160,
  coordinate: 100000, paradigms: 24, nodes: 120, edges: 240,
});
const SKILL_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const LIBRARY_SKILL_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const COLOR = /^#[a-fA-F0-9]{6}$/;
const NODE_FIELDS = ['title', 'note', 'icon', 'color'];
const HISTORY_LIMIT = 100;

const unique = (list) => [...new Set(list)];
const round = (value) => Math.round(value * 100) / 100;

export function isSkillId(value) {
  return typeof value === 'string' && SKILL_ID.test(value);
}

export function skillIndex(skills = []) {
  const map = new Map();
  for (const skill of skills || []) if (skill && LIBRARY_SKILL_ID.test(skill.id)) map.set(skill.id, skill);
  return map;
}

/** One install row per source: the same skill id from two folders stays two rows. */
export function installCandidates(localSkills = []) {
  const used = new Set(), rows = [];
  for (const [position, skill] of (localSkills || []).entries()) {
    if (!skill || !isSkillId(skill.id)) continue;
    const base = typeof skill.source === 'string' && skill.source ? skill.source : `${skill.id}#${position}`;
    let sourceKey = base;
    for (let suffix = 2; used.has(sourceKey); suffix += 1) sourceKey = `${base}#${suffix}`;
    used.add(sourceKey);
    rows.push({...skill, sourceKey});
  }
  return rows;
}

/** Union two inventories by id; an existing library entry always beats a fresh install. */
export function mergeInventory(existing = [], incoming = []) {
  const byId = new Map();
  for (const skill of existing || []) if (skill?.id) byId.set(skill.id, skill);
  for (const skill of incoming || []) if (skill?.id && !byId.has(skill.id)) byId.set(skill.id, skill);
  return [...byId.values()];
}

/** Declared Mode roots. An empty list stays empty; it never means "the whole library". */
export function rootIds(mode) {
  const declared = Array.isArray(mode?.roots) ? mode.roots : Array.isArray(mode?.skills) ? mode.skills : [];
  return unique(declared.filter(id=>typeof id==='string'&&LIBRARY_SKILL_ID.test(id)));
}

export function removeRoot(state, id, skills) {
  const roots=state.roots.filter(root=>root!==id);
  const draft=normalizeArchitecture(state.draft,memberIds(roots,skills));
  draft.paradigms=draft.paradigms.filter(paradigm=>paradigm.skills.length);
  return {...state,roots,draft};
}

/** Remove the visible reference, not that skill's work in other paradigms. */
export function removeScopeSkill(state, id, scope, skills) {
  const draft=placeSkill(state.draft,id,'',scope);
  if(assignedScopes(draft,id).length)return {...state,draft};
  if(memberIds(state.roots.filter(root=>root!==id),skills).includes(id))
    throw new Error('其他技能依赖此能力，请保留它的归属');
  return removeRoot({...state,draft},id,skills);
}

/** Skills the architecture must place: declared roots plus the recursive requires closure. */
export function memberIds(roots = [], skills = []) {
  const index = skillIndex(skills);
  const ordered = [];
  const seen = new Set();
  const visit = (id) => {
    if (typeof id!=='string'||!LIBRARY_SKILL_ID.test(id) || seen.has(id)) return;
    seen.add(id);
    ordered.push(id);
    for (const dependency of index.get(id)?.requires || []) visit(dependency);
  };
  for (const id of roots || []) visit(id);
  return ordered;
}

export function finitePoint(value) {
  if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) return null;
  return Math.abs(value.x) <= LIMITS.coordinate && Math.abs(value.y) <= LIMITS.coordinate ? {x: round(value.x), y: round(value.y)} : null;
}

function nodeValue(node) {
  const next = {skill: node.skill};
  for (const key of NODE_FIELDS) if (typeof node[key] === 'string' && node[key]) next[key] = node[key];
  return next;
}

function edgeValue(edge) {
  const next = {from: edge.from, to: edge.to, label: typeof edge.label === 'string' ? edge.label : ''};
  // map_schema rejects a present-but-blank condition, so blank means "no condition".
  if (typeof edge.condition === 'string' && edge.condition.trim()) next.condition = edge.condition;
  for (const key of ['sourceHandle', 'targetHandle']) if (HANDLES.includes(edge[key])) next[key] = edge[key];
  return next;
}

/** Tolerant read of an existing definition, including the pre-paradigm edges shape. */
export function normalizeArchitecture(architecture, members = []) {
  const allowed = new Set((members || []).filter(isSkillId));
  const source = architecture && typeof architecture === 'object' ? architecture : {};
  const nodes = [];
  for (const node of Array.isArray(source.nodes) ? source.nodes : []) {
    if (!node || !allowed.has(node.skill) || nodes.some((kept) => kept.skill === node.skill)) continue;
    nodes.push(nodeValue(node));
  }
  const shared = unique((Array.isArray(source.shared) ? source.shared : []).filter((id) => allowed.has(id)));
  const legacy = Array.isArray(source.edges) ? source.edges : [];
  const authored = Array.isArray(source.paradigms) ? source.paradigms
    : legacy.length ? [{
      id: 'existing', title: '原有技能关系', description: '',
      skills: unique(legacy.flatMap((edge) => [edge?.from, edge?.to])).filter((id) => allowed.has(id)),
      edges: legacy,
    }] : [];
  const paradigms = [];
  for (const paradigm of authored) {
    if (!paradigm || typeof paradigm !== 'object') continue;
    const id = isSkillId(paradigm.id) && paradigm.id !== SHARED ? paradigm.id : `paradigm-${paradigms.length + 1}`;
    if (paradigms.some((kept) => kept.id === id)) continue;
    const skills = unique((Array.isArray(paradigm.skills) ? paradigm.skills : [])
      .filter((skillId) => allowed.has(skillId))).filter((skillId) => !shared.includes(skillId));
    const edges = [];
    for (const edge of Array.isArray(paradigm.edges) ? paradigm.edges : []) {
      if (!edge || typeof edge !== 'object') continue;
      if (!skills.includes(edge.from) || !skills.includes(edge.to) || edge.from === edge.to) continue;
      if (edges.some((kept) => kept.from === edge.from && kept.to === edge.to)) continue;
      edges.push(edgeValue(edge));
    }
    paradigms.push({
      id,
      title: typeof paradigm.title === 'string' ? paradigm.title : '',
      description: typeof paradigm.description === 'string' ? paradigm.description : '',
      skills, edges,
    });
  }
  const scopes = {[SHARED]: shared};
  for (const paradigm of paradigms) scopes[paradigm.id] = paradigm.skills;
  const layout = {};
  for (const [scopeId, positions] of Object.entries(source.layout || {})) {
    const scopeMembers = scopes[scopeId];
    if (!scopeMembers || !positions || typeof positions !== 'object') continue;
    const kept = {};
    for (const [skillId, value] of Object.entries(positions)) {
      if (!scopeMembers.includes(skillId)) continue;
      const point = finitePoint(value);
      if (point) kept[skillId] = point;
    }
    if (Object.keys(kept).length) layout[scopeId] = kept;
  }
  return {nodes, shared, paradigms, layout};
}

export function scopeOf(draft, scopeId) {
  if (!draft) return null;
  if (scopeId === SHARED) return {id: SHARED, title: '通用能力', description: '', skills: draft.shared, edges: []};
  return draft.paradigms.find((paradigm) => paradigm.id === scopeId) || null;
}

/** Does the scope on screen currently hold this skill? Never collapse to "first match". */
export function scopeIncludes(draft, scopeId, skillId) {
  return !!scopeOf(draft, scopeId)?.skills.includes(skillId);
}

/** Every scope that holds the skill, shared first, then in paradigm order. */
export function assignedScopes(draft, skillId) {
  if (!draft) return [];
  const scopes = draft.shared.includes(skillId) ? [SHARED] : [];
  for (const paradigm of draft.paradigms) if (paradigm.skills.includes(skillId)) scopes.push(paradigm.id);
  return scopes;
}

export function nodeOverride(draft, skillId) {
  return draft?.nodes?.find((node) => node.skill === skillId) || null;
}

export function displayTitle(draft, index, skillId) {
  return nodeOverride(draft, skillId)?.title || index?.get(skillId)?.title || skillId;
}

export function edgeKey(edge) {
  return `${edge.from}->${edge.to}`;
}

function cloneDraft(draft) {
  return {
    nodes: draft.nodes.map((node) => ({...node})),
    shared: [...draft.shared],
    paradigms: draft.paradigms.map((paradigm) => ({
      ...paradigm, skills: [...paradigm.skills], edges: paradigm.edges.map((edge) => ({...edge})),
    })),
    layout: Object.fromEntries(Object.entries(draft.layout || {}).map(([scopeId, positions]) => [scopeId, {...positions}])),
  };
}

/** Drop the skill's edges and its now-stale layout point from one scope. */
function dropFromScope(draft, scopeId, skillId) {
  if (scopeId === SHARED) {
    draft.shared = draft.shared.filter((id) => id !== skillId);
  } else {
    const paradigm = draft.paradigms.find((candidate) => candidate.id === scopeId);
    if (!paradigm) return;
    paradigm.skills = paradigm.skills.filter((id) => id !== skillId);
    paradigm.edges = paradigm.edges.filter((edge) => edge.from !== skillId && edge.to !== skillId);
  }
  const positions = draft.layout?.[scopeId];
  if (!positions || !(skillId in positions)) return;
  const kept = {...positions};
  delete kept[skillId];
  const layout = {...draft.layout};
  if (Object.keys(kept).length) layout[scopeId] = kept;
  else delete layout[scopeId];
  draft.layout = layout;
}

// target = paradigm id: leaves shared, joins that paradigm, keeps every other paradigm.
// target = SHARED: the only move that leaves every paradigm; stale layout points are dropped.
// target = '': remove from `from` (the scope on screen) only; removal without a scope is a no-op.
export function placeSkill(draft, skillId, target, from = '') {
  if (!isSkillId(skillId)) return draft;
  let next = cloneDraft(draft);
  if (target === SHARED) {
    for (const paradigm of [...next.paradigms]) dropFromScope(next, paradigm.id, skillId);
    if (!next.shared.includes(skillId)) next.shared.push(skillId);
    return next;
  }
  if (target) {
    const paradigm = next.paradigms.find((candidate) => candidate.id === target);
    if (!paradigm) return draft;
    dropFromScope(next, SHARED, skillId);
    if (!paradigm.skills.includes(skillId)) paradigm.skills.push(skillId);
    return next;
  }
  if (!from) return draft;
  dropFromScope(next, from, skillId);
  return next;
}

export function addParadigm(draft, id, title = '', description = '') {
  if (!isSkillId(id) || id === SHARED || draft.paradigms.some((paradigm) => paradigm.id === id)) return draft;
  const next = cloneDraft(draft);
  next.paradigms.push({id, title, description, skills: [], edges: []});
  return next;
}

export function updateParadigm(draft, id, patch) {
  const next = cloneDraft(draft);
  next.paradigms = next.paradigms.map((paradigm) => (paradigm.id === id ? {...paradigm, ...patch} : paradigm));
  return next;
}

/** Dropping a paradigm never deletes skills: members keep their other scopes. */
export function removeParadigm(draft, id) {
  if (!draft.paradigms.some((paradigm) => paradigm.id === id)) return draft;
  const next = cloneDraft(draft);
  next.paradigms = next.paradigms.filter((paradigm) => paradigm.id !== id);
  const layout = {...next.layout};
  delete layout[id];
  next.layout = layout;
  return next;
}

/** Same rules the core applies on save, phrased for the person editing. */
export function validateDraft({draft, members = []} = {}) {
  const errors = [];
  const push = (code, message, extra) => errors.push({code, message, ...extra});
  const allowed = new Set((members || []).filter(isSkillId));
  if (!draft) {
    return {ok: false, errors: [{code: 'architecture.missing', message: '缺少工作架构'}], unassigned: [...allowed]};
  }
  if (!allowed.size) {
    return {ok: false, errors: [{code: 'mode.empty', message: '这个 Mode 还没有技能：先加入技能，再保存工作架构'}], unassigned: []};
  }
  const covered = new Set();
  if (draft.paradigms.length > LIMITS.paradigms) push('paradigms.limit', `最多保存 ${LIMITS.paradigms} 个工作范式`);
  if (draft.nodes.length > LIMITS.nodes) push('nodes.limit', `最多保存 ${LIMITS.nodes} 个技能节点`);
  for (const node of draft.nodes) {
    if (!allowed.has(node.skill)) push('node.unknown', `节点 ${node.skill} 引用的技能不在当前 Mode`, {skill: node.skill});
    if (node.title && node.title.length > LIMITS.title) push('node.title', `${node.skill} 的显示名称不能超过 ${LIMITS.title} 字`, {skill: node.skill});
    if (node.note && node.note.length > LIMITS.note) push('node.note', `${node.skill} 的备注不能超过 ${LIMITS.note} 字`, {skill: node.skill});
    if (node.color && !COLOR.test(node.color)) push('node.color', `${node.skill} 的颜色需要 #RRGGBB`, {skill: node.skill});
  }
  const shared = new Set();
  for (const id of draft.shared) {
    if (!allowed.has(id)) push('shared.unknown', `通用能力 ${id} 不在当前 Mode`, {skill: id});
    if (shared.has(id)) push('shared.duplicate', `通用能力 ${id} 重复`, {skill: id});
    shared.add(id);
    covered.add(id);
  }
  const seenParadigms = new Set();
  for (const paradigm of draft.paradigms) {
    const label = paradigm.title?.trim() || paradigm.id;
    if (!isSkillId(paradigm.id) || paradigm.id === SHARED) {
      push('paradigm.id', `范式 ID ${paradigm.id} 需要使用小写英文、数字和短横线`, {scope: paradigm.id});
    }
    if (seenParadigms.has(paradigm.id)) push('paradigm.duplicate', `范式 ID ${paradigm.id} 重复`, {scope: paradigm.id});
    seenParadigms.add(paradigm.id);
    if (!paradigm.title.trim()) push('paradigm.title', `范式「${label}」需要名称`, {scope: paradigm.id});
    else if (paradigm.title.length > LIMITS.title) push('paradigm.title', `范式名称不能超过 ${LIMITS.title} 字`, {scope: paradigm.id});
    if (!paradigm.description.trim()) {
      push('paradigm.description', `范式「${label}」需要说明什么时候用、技能怎样配合`, {scope: paradigm.id});
    } else if (paradigm.description.length > LIMITS.description) {
      push('paradigm.description', `范式「${label}」的说明不能超过 ${LIMITS.description} 字`, {scope: paradigm.id});
    }
    if (!paradigm.skills.length) push('paradigm.empty', `范式「${label}」还没有技能`, {scope: paradigm.id});
    if ((paradigm.edges || []).length > LIMITS.edges) {
      push('edges.limit', `范式「${label}」最多保存 ${LIMITS.edges} 条关联`, {scope: paradigm.id});
    }
    const members2 = new Set();
    for (const id of paradigm.skills) {
      if (!allowed.has(id)) push('paradigm.unknown', `范式「${label}」引用的技能 ${id} 不在当前 Mode`, {scope: paradigm.id, skill: id});
      if (members2.has(id)) push('paradigm.duplicate', `范式「${label}」重复包含技能 ${id}`, {scope: paradigm.id, skill: id});
      if (shared.has(id)) push('paradigm.shared', `${id} 已在通用能力中，不应再放入范式「${label}」`, {scope: paradigm.id, skill: id});
      members2.add(id);
      covered.add(id);
    }
    const pairs = new Set();
    for (const edge of paradigm.edges || []) {
      const pair = edgeKey(edge);
      if (edge.from === edge.to) push('edge.self', `范式「${label}」不能把技能连接到自身`, {scope: paradigm.id, edge: pair});
      else if (!members2.has(edge.from) || !members2.has(edge.to)) {
        push('edge.outside', `范式「${label}」的关联两端都需要是该范式的技能`, {scope: paradigm.id, edge: pair});
      }
      if (pairs.has(pair)) push('edge.duplicate', `范式「${label}」的关联 ${pair} 重复`, {scope: paradigm.id, edge: pair});
      pairs.add(pair);
      if (!edge.label?.trim()) {
        push('edge.label', `范式「${label}」的每条关联都需要含义（${edge.from} → ${edge.to}）`, {scope: paradigm.id, edge: pair});
      } else if (edge.label.length > LIMITS.label) {
        push('edge.label', `关联含义不能超过 ${LIMITS.label} 字`, {scope: paradigm.id, edge: pair});
      }
      // map_schema rejects a present-but-blank condition, so flag it here instead of
      // saving a value the reader will drop or the core will refuse.
      if (edge.condition !== undefined && !edge.condition.trim()) {
        push('edge.condition', `范式「${label}」的关联条件不能为空：不需要条件就删除这段文字`, {scope: paradigm.id, edge: pair});
      } else if (edge.condition && edge.condition.length > LIMITS.condition) {
        push('edge.condition', `选择条件不能超过 ${LIMITS.condition} 字`, {scope: paradigm.id, edge: pair});
      }
      for (const key of ['sourceHandle', 'targetHandle']) {
        if (edge[key] && !HANDLES.includes(edge[key])) {
          push('edge.handle', '关联方向只能使用上、右、下、左', {scope: paradigm.id, edge: pair});
        }
      }
    }
  }
  const unassigned = [...allowed].filter((id) => !covered.has(id));
  if (unassigned.length) {
    push('coverage', `${unassigned.length} 个技能待归属：${unassigned.join('、')}`, {skills: unassigned});
  }
  return {ok: !errors.length, errors, unassigned};
}

/** Preserve existing coordinates for compatibility; Mermaid owns new layout. */
export function materializeArchitecture(draft) {
  const architecture = {
    nodes: draft.nodes.map(nodeValue),
    shared: [...draft.shared],
    paradigms: draft.paradigms.map((paradigm) => ({
      id: paradigm.id,
      title: paradigm.title,
      description: paradigm.description,
      skills: [...paradigm.skills],
      edges: paradigm.edges.map(edgeValue),
    })),
  };
  const layout = draft.layout || {};
  if (Object.keys(layout).length) architecture.layout = layout;
  return architecture;
}

/** mode.save request: fingerprint, document and the saved root set are preserved. */
export function saveRequest({mode, draft, roots = []} = {}) {
  // Authored Mermaid owns relationships; membership edits preserve compatible YAML edges.
  if(diagramsIn(mode?.document||'').length)draft={...draft,paradigms:draft.paradigms.map(p=>({...p,
    edges:(mode.architecture?.paradigms?.find(original=>original.id===p.id)?.edges||[])
      .filter(edge=>p.skills.includes(edge.from)&&p.skills.includes(edge.to))}))};
  return {
    operation: 'mode.save',
    id: mode?.id,
    expected: mode?.fingerprint,
    document: mode?.document,
    skills: unique(roots.filter(isSkillId)),
    architecture: materializeArchitecture(draft),
  };
}

export function sameState(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export const createHistory = (present) => ({past: [], present, future: []});

export function commitHistory(history, next) {
  if (sameState(history.present, next)) return history;
  return {past: [...history.past, history.present].slice(-HISTORY_LIMIT), present: next, future: []};
}

export function undoHistory(history) {
  if (!history.past.length) return history;
  return {past: history.past.slice(0, -1), present: history.past[history.past.length - 1], future: [history.present, ...history.future]};
}

export function redoHistory(history) {
  if (!history.future.length) return history;
  return {past: [...history.past, history.present], present: history.future[0], future: history.future.slice(1)};
}
