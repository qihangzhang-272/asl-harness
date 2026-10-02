// Pure projection between a Mode architecture and the node canvas: nodes/edges,
// deterministic layout, validation and history. No DOM rendering, no scheduler.
// The one UI import is getSmoothStepPath, so an edge label sits on the exact path
// the canvas draws instead of on a second copy of that router.
// layout is presentation only (which skill sits where in one scope); it never
// encodes order. One skill may belong to several paradigms; `shared` is exclusive.
import dagre from '@dagrejs/dagre';
import {getSmoothStepPath} from '@xyflow/react';
import {diagramsIn} from './mermaid-document.mjs';

export const SHARED = 'shared';
export const HANDLES = Object.freeze(['top', 'right', 'bottom', 'left']);
export const NODE_SIZE = Object.freeze({width: 184, height: 58});
// How far a route leaves its node before it turns; also the lane a return edge borrows.
export const EDGE_OFFSET = 20;
// Corner radius of the drawn route; the canvas hands the same number to getSmoothStepPath.
export const EDGE_RADIUS = 9;
// Canvas type scale. graph-editor.css declares the same numbers; one test keeps them in step.
export const TEXT = Object.freeze({node: 14, note: 11.5, edge: 12.5, condition: 11, line: 1.45});
// Rough box of one edge label: only ever used to keep a meaning out from under a node. `padX`,
// `padY` and `border` mirror the sheet's padding and 1px border, because `max` is a border-box cap
// and the text only gets what is left inside it. `step` is how far one bounded walk moves per try,
// `reach` how far it may wander, `slack` the clearance a spot must leave around a node so a label
// between two boxes touches neither, and `probe` how far past a magnetic point a fallback anchor
// may step while it is still on the straight stub the canvas really draws. `max` is wide enough for
// a normal meaning and its condition badge to share the one flex row the sheet really draws, instead
// of wrapping to a second row and losing the gap the meaning belongs in. `badgeMax` and `badgePad`
// mirror the badge's own 128px cap and inner padding, the room its text really wraps into once
// flex-wrap drops that row.
export const LABEL = Object.freeze({padX: 7, padY: 2, border: 1, max: 224, step: 4, reach: 288, slack: 2, probe: 4, badgeMax: 128, badgePad: 10});
export const LIMITS = Object.freeze({
  title: 80, description: 1200, note: 1200, label: 80, condition: 160,
  coordinate: 100000, paradigms: 24, nodes: 120, edges: 240,
});
const SKILL_ID = /^[a-z0-9][a-z0-9-]{0,79}$/;
const COLOR = /^#[a-fA-F0-9]{6}$/;
const NODE_FIELDS = ['title', 'note', 'icon', 'color'];
const GRID = Object.freeze({x: NODE_SIZE.width + 52, y: NODE_SIZE.height + 74});
const CELL = Object.freeze({x: NODE_SIZE.width + 20, y: NODE_SIZE.height + 20});
const HISTORY_LIMIT = 100;

const unique = (list) => [...new Set(list)];
const round = (value) => Math.round(value * 100) / 100;

export function isSkillId(value) {
  return typeof value === 'string' && SKILL_ID.test(value);
}

export function skillIndex(skills = []) {
  const map = new Map();
  for (const skill of skills || []) if (skill && isSkillId(skill.id)) map.set(skill.id, skill);
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
  return unique(declared.filter(isSkillId));
}

export function removeRoot(state, id, skills) {
  const roots=state.roots.filter(root=>root!==id);
  const draft=normalizeArchitecture(state.draft,memberIds(roots,skills));
  draft.paradigms=draft.paradigms.filter(paradigm=>paradigm.skills.length);
  return {roots,draft};
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
    if (!isSkillId(id) || seen.has(id)) return;
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

// Auto layout may only initialize a node that has no coordinate yet. Before an edit
// that changes its input (a new or removed edge, a skill joining the scope) write the
// projected positions down, so nothing already on screen moves under the person.
function freezeScope(draft, scopeId) {
  if (scopeId === SHARED) return draft;
  const scope = scopeOf(draft, scopeId);
  if (!scope) return draft;
  const positions = layoutScope({skills: scope.skills, edges: scope.edges, saved: draft.layout?.[scopeId] || {}});
  if (!Object.keys(positions).length) return draft;
  return {...draft, layout: {...draft.layout, [scopeId]: positions}};
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
    next = freezeScope(next, target);
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

export function setNodeOverride(draft, skillId, patch) {
  if (!isSkillId(skillId)) return draft;
  const next = cloneDraft(draft);
  const node = next.nodes.find((candidate) => candidate.skill === skillId) || {skill: skillId};
  for (const [key, value] of Object.entries(patch || {})) {
    if (key === 'skill') continue;
    if (typeof value === 'string' && value.trim()) node[key] = value;
    else delete node[key];
  }
  const rest = next.nodes.filter((candidate) => candidate.skill !== skillId);
  next.nodes = Object.keys(node).length > 1 ? [...rest, node] : rest;
  return next;
}

export function addEdge(draft, scopeId, edge) {
  const scope = scopeOf(draft, scopeId);
  if (!scope || scopeId === SHARED || !edge || edge.from === edge.to) return draft;
  if (!scope.skills.includes(edge.from) || !scope.skills.includes(edge.to)) return draft;
  if ((scope.edges || []).some((existing) => existing.from === edge.from && existing.to === edge.to)) return draft;
  const next = freezeScope(cloneDraft(draft), scopeId);
  const paradigm = next.paradigms.find((candidate) => candidate.id === scopeId);
  paradigm.edges.push(edgeValue(edge));
  return next;
}

export function updateEdge(draft, scopeId, key, patch) {
  const paradigm = draft.paradigms.find((candidate) => candidate.id === scopeId);
  if (!paradigm) return draft;
  const next = cloneDraft(draft);
  const target = next.paradigms.find((candidate) => candidate.id === scopeId);
  target.edges = target.edges.map((edge) => {
    if (edgeKey(edge) !== key) return edge;
    const patched = {...edge};
    for (const [field, value] of Object.entries(patch || {})) {
      if (field === 'from' || field === 'to') continue;
      if (field === 'sourceHandle' || field === 'targetHandle') {
        if (HANDLES.includes(value)) patched[field] = value;
        else delete patched[field];
      } else if (typeof value === 'string') {
        if (value.trim()) patched[field] = value;
        else delete patched[field];
      }
    }
    return patched;
  });
  return next;
}

export function removeEdge(draft, scopeId, key) {
  const paradigm = draft.paradigms.find((candidate) => candidate.id === scopeId);
  if (!paradigm) return draft;
  const next = freezeScope(cloneDraft(draft), scopeId);
  const target = next.paradigms.find((candidate) => candidate.id === scopeId);
  target.edges = target.edges.filter((edge) => edgeKey(edge) !== key);
  return next;
}

export function setPositions(draft, scopeId, positions) {
  const scope = scopeOf(draft, scopeId);
  if (!scope) return draft;
  const next = cloneDraft(draft);
  const kept = {...(next.layout?.[scopeId] || {})};
  for (const [skillId, value] of Object.entries(positions || {})) {
    if (!scope.skills.includes(skillId)) continue;
    const point = finitePoint(value);
    if (point) kept[skillId] = point;
  }
  next.layout = {...next.layout, [scopeId]: kept};
  return next;
}

export function defaultHandles(from, to) {
  const dx = (to?.x || 0) - (from?.x || 0), dy = (to?.y || 0) - (from?.y || 0);
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? {sourceHandle: 'right', targetHandle: 'left'} : {sourceHandle: 'left', targetHandle: 'right'};
  return dy >= 0 ? {sourceHandle: 'bottom', targetHandle: 'top'} : {sourceHandle: 'top', targetHandle: 'bottom'};
}

/** A return edge would draw on top of its twin; the later key borrows a perpendicular lane. */
function returnLane(from, to) {
  const dx = (to?.x || 0) - (from?.x || 0), dy = (to?.y || 0) - (from?.y || 0);
  return Math.abs(dx) >= Math.abs(dy)
    ? {sourceHandle: 'bottom', targetHandle: 'bottom'}
    : {sourceHandle: 'right', targetHandle: 'right'};
}

export function edgeHandles(edge, positions = {}, siblings = []) {
  const fallback = defaultHandles(positions[edge.from], positions[edge.to]);
  const source = HANDLES.includes(edge.sourceHandle) ? edge.sourceHandle : '';
  const target = HANDLES.includes(edge.targetHandle) ? edge.targetHandle : '';
  if (source && target) return {sourceHandle: source, targetHandle: target};
  const twin = (siblings || []).find((other) => other && other !== edge && other.from === edge.to && other.to === edge.from);
  // ponytail: the return edge always takes the same lane; hunting for free space would re-route
  // the diagram while the person drags it, and one lane is enough to tell a round trip apart.
  const lane = twin && edgeKey(edge) > edgeKey(twin) ? returnLane(positions[edge.from], positions[edge.to]) : fallback;
  return {sourceHandle: source || lane.sourceHandle, targetHandle: target || lane.targetHandle};
}

const HANDLE_DIR = Object.freeze({top: {x: 0, y: -1}, right: {x: 1, y: 0}, bottom: {x: 0, y: 1}, left: {x: -1, y: 0}});

/** Centre of one magnetic point, matching the handle xyflow lays on the node box. */
export function handlePoint(position, side) {
  const point = finitePoint(position) || {x: 0, y: 0};
  const dir = HANDLE_DIR[side] || HANDLE_DIR.right;
  return {
    x: point.x + (NODE_SIZE.width * (dir.x + 1)) / 2,
    y: point.y + (NODE_SIZE.height * (dir.y + 1)) / 2,
  };
}

/**
 * The real anchor of one relation: the labelX/labelY @xyflow/react hands back for the same
 * smooth-step path the canvas draws. Two magnetic points in, the exact point on the route out,
 * so a label is tied to its own line instead of to a second copy of the router.
 */
export function edgeAnchor(edge, positions = {}, offset = EDGE_OFFSET) {
  const source = positions[edge.from ?? edge.source];
  const target = positions[edge.to ?? edge.target];
  if (!source || !target) return handlePoint(source, edge.sourceHandle);
  const from = handlePoint(source, edge.sourceHandle);
  const to = handlePoint(target, edge.targetHandle);
  const [, x, y] = getSmoothStepPath({
    sourceX: from.x, sourceY: from.y, sourcePosition: edge.sourceHandle || 'right',
    targetX: to.x, targetY: to.y, targetPosition: edge.targetHandle || 'left',
    borderRadius: EDGE_RADIUS, offset,
  });
  return {x: round(x), y: round(y)};
}

/** Candidates for one label anchor, nearest first: the real midpoint, then one very short step out
 *  of each magnetic point. `probe` keeps that step on the first or last straight run the canvas
 *  draws, so a relation whose midpoint has fallen inside a node still gets a label on its own line.
 *  Three candidates at most: a fallback anchor, not a second router. */
function edgeAnchors(edge, positions = {}, offset = EDGE_OFFSET) {
  const anchors = [edgeAnchor(edge, positions, offset)];
  for (const [id, side] of [[edge.from, edge.sourceHandle], [edge.to, edge.targetHandle]]) {
    if (!positions[id] || !HANDLES.includes(side)) continue;
    const dir = HANDLE_DIR[side];
    const at = handlePoint(positions[id], side);
    anchors.push({x: round(at.x + dir.x * LABEL.probe), y: round(at.y + dir.y * LABEL.probe)});
  }
  return anchors;
}

/** What a reader sees on the line, condition included. */
export function labelText(label, condition) {
  return [label, condition && `条件：${condition}`].filter(Boolean).join(' · ');
}

// The sheet lays a label out as one flex row: text first, then the condition badge. When the
// row does not fit, flex-wrap drops the badge onto its own line, so the box is as tall as two
// rows. Guessing a single tall column instead is what used to push meanings off their lines.
const unitsOf = (value) => {
  let units = 0;
  for (const character of String(value || '')) units += character.codePointAt(0) > 0x2e7f ? 1 : 0.56;
  return units;
};
// The badge caps itself at 128px in the sheet and keeps 10px of inner padding, so its box is the
// text room plus that padding, never less than 20px wide.
const badgeWidth = (condition) => (condition ? Math.min(LABEL.badgeMax, Math.max(20, unitsOf(condition) * TEXT.condition + LABEL.badgePad)) : 0);
const rowsOf = (units, size, room) => Math.max(1, Math.ceil((units * size) / Math.max(1, room)));

/**
 * Rough label box at its natural reading width, measured the way the sheet boxes it: `max` is a
 * border-box cap, so padding and border come out of the room the text may use, and the row count
 * follows what the DOM really renders — the text plus the condition badge, never the "条件：" prefix
 * that only lives in the hint. There are no text metrics here, so it errs a little generous on
 * purpose; the height predicted here is the height the sheet ends up laying out.
 */
export function labelBox(label, condition) {
  const chromeX = LABEL.padX + LABEL.border;
  const inner = LABEL.max - chromeX * 2;
  const text = String(label || '').trim();
  const badge = String(condition || '').trim();
  const textWidth = Math.max(20, unitsOf(text) * TEXT.edge);
  const badgeW = badge ? badgeWidth(badge) : 0;
  const natural = textWidth + (badgeW ? badgeW + 5 : 0);
  const width = Math.min(inner, natural);
  const textRows = rowsOf(unitsOf(text) || 1, TEXT.edge, width);
  // The badge wraps inside its own content room, which is whatever width the flex row really gives
  // it: the badge cap once the row wraps, but the row's leftover while text and badge still share
  // one line. It can therefore be taller than its text even on a one-row label; when the two stack,
  // the sheet's row-gap adds the 2px between them.
  const badgeRoom = Math.max(1, Math.min(badgeW, width) - LABEL.badgePad);
  const badgeH = badgeW ? rowsOf(unitsOf(badge), TEXT.condition, badgeRoom) * TEXT.condition * TEXT.line : 0;
  const textH = textRows * TEXT.edge * TEXT.line;
  // Two stacked flex rows carry the sheet's own row-gap; one row is as tall as its taller item.
  const contentHeight = natural > inner && badgeH ? textH + badgeH + 2 : Math.max(textH, badgeH);
  return {width: width + chromeX * 2, height: contentHeight + (LABEL.padY + LABEL.border) * 2};
}

/** Labels hold their reading size as the diagram zooms out; 1.5x is the ceiling. */
export function labelScale(zoom) {
  const value = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
  return Math.min(1.5, Math.max(1, 1 / value));
}

const labelRect = (x, y, width, height) => ({x: x - width / 2, y: y - height / 2, width, height});
const clearOf = (box, rects) => !rects.some((other) => box.x < other.x + other.width && box.x + box.width > other.x
  && box.y < other.y + other.height && box.y + box.height > other.y);
// Does one straight thread cut through a box? Liang-Barsky slab clip, so a meaning that had to leave
// its line is refused a spot whose thread to that line would run through a node on the way.
const cuts = (a, b, box) => {
  let near = 0, far = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, box.x, box.x + box.width], [a.y, b.y - a.y, box.y, box.y + box.height]]) {
    if (!delta) { if (origin < min || origin > max) return false; continue; }
    near = Math.max(near, Math.min((min - origin) / delta, (max - origin) / delta));
    far = Math.min(far, Math.max((min - origin) / delta, (max - origin) / delta));
    if (near > far) return false;
  }
  return true;
};

// Straight down and up first, so a pushed label still reads as sitting beside its own line.
const SPOTS = [
  (x, y, d) => ({x, y: y + d}), (x, y, d) => ({x, y: y - d}),
  (x, y, d) => ({x: x - d, y}), (x, y, d) => ({x: x + d, y}),
  (x, y, d) => ({x: x - d, y: y + d}), (x, y, d) => ({x: x + d, y: y + d}),
  (x, y, d) => ({x: x - d, y: y - d}), (x, y, d) => ({x: x + d, y: y - d}),
];

/** Nearest spot around one anchor whose box clears every node and label placed before it and whose
 *  thread back to that anchor cuts no node (the slab clip in `cuts`). `nodes` is the node rects
 *  alone: a thread may pass a label, never a node. Returns null when nothing within `reach`
 *  qualifies: an anchor buried inside a node can never be reached without a thread through it, so
 *  the caller has to offer another anchor instead of being handed the blocked one back. */
export function placeLabel({x, y, width, height, rects = [], nodes = [], step = LABEL.step, reach = LABEL.reach}) {
  const fits = (spot) => {
    const box = labelRect(spot.x, spot.y, width, height);
    if (!clearOf(box, rects)) return false;
    const leader = leaderPoint({x, y}, box);
    return !leader || !nodes.some((node) => cuts({x, y}, leader, node));
  };
  if (fits({x, y})) return {x: round(x), y: round(y)};
  // ponytail: a bounded outward walk. It lands the meaning next to its own line instead of
  // jumping a whole node sideways; a real orthogonal router is the upgrade if a scope ever
  // crowds past `reach`.
  for (let distance = step; distance <= reach; distance += step) {
    for (const side of SPOTS) {
      const spot = side(x, y, distance);
      if (fits(spot)) return {x: round(spot.x), y: round(spot.y)};
    }
  }
  return null;
}

/** Nearest point on the label box to its anchor, or null while the anchor is still inside it.
 *  A meaning that had to walk away keeps this thin leader back to its own line. */
function leaderPoint(anchor, box) {
  const inside = anchor.x >= box.x && anchor.x <= box.x + box.width && anchor.y >= box.y && anchor.y <= box.y + box.height;
  if (inside) return null;
  return {
    x: round(Math.min(box.x + box.width, Math.max(box.x, anchor.x))),
    y: round(Math.min(box.y + box.height, Math.max(box.y, anchor.y))),
  };
}

/**
 * Every edge label of one scope, in reading order. The box keeps its natural reading width and
 * starts on the real anchor; placeLabel walks it out only until it clears every node and every
 * label placed before it. A label that had to leave its anchor reports the leader point back to
 * its own route, so the meaning stays tied to its line instead of parking under the nearest node.
 * The real midpoint is tried first; when it is buried in a node, so that every thread from it would
 * cross that node, the label steps onto a stub just outside one magnetic point instead. If even
 * that finds no spot, the meaning stays visible and clear of every node and drops its thread rather
 * than draw one through a node.
 */
export function placeLabels({nodes = [], edges = [], zoom = 1, offset = EDGE_OFFSET} = {}) {
  const positions = {}, rects = [];
  for (const node of nodes) {
    const point = finitePoint(node.position);
    if (!point) continue;
    positions[node.id] = point;
    rects.push({
      x: point.x - LABEL.slack, y: point.y - LABEL.slack,
      width: NODE_SIZE.width + LABEL.slack * 2, height: NODE_SIZE.height + LABEL.slack * 2,
    });
  }
  const scale = labelScale(zoom);
  const taken = [], spots = {};
  for (const edge of edges) {
    if (!positions[edge.source] || !positions[edge.target]) continue;
    const relation = {from: edge.source, to: edge.target, sourceHandle: edge.sourceHandle, targetHandle: edge.targetHandle};
    const box = labelBox(edge.data?.label, edge.data?.condition);
    const width = box.width * scale, height = box.height * scale;
    const room = [...rects, ...taken];
    let anchor = null, spot = null, legal = false;
    for (const candidate of edgeAnchors(relation, positions, offset)) {
      const found = placeLabel({x: candidate.x, y: candidate.y, width, height, rects: room, nodes: rects});
      if (!found) continue;
      anchor = candidate;
      spot = found;
      legal = true;
      break;
    }
    // No candidate can reach a legal spot: keep the meaning off every node and drop the thread
    // rather than draw one that would run through a node.
    if (!spot) {
      anchor = edgeAnchor(relation, positions, offset);
      spot = placeLabel({x: anchor.x, y: anchor.y, width, height, rects: room, nodes: []})
        || {x: round(anchor.x), y: round(anchor.y)};
    }
    const rect = labelRect(spot.x, spot.y, width, height);
    taken.push(rect);
    spots[edge.id] = {...spot, width: box.width, height: box.height, anchor, leader: legal ? leaderPoint(anchor, rect) : null};
  }
  return spots;
}

function collides(point, taken) {
  return taken.some((other) => Math.abs(other.x - point.x) < CELL.x && Math.abs(other.y - point.y) < CELL.y);
}

/** First free cell of the deterministic grid; used when a computed spot is taken. */
export function freeSlot(taken = []) {
  for (let row = 0; row < 60; row += 1) {
    for (let col = 0; col < 60; col += 1) {
      const point = {x: col * GRID.x, y: row * GRID.y};
      if (!collides(point, taken)) return point;
    }
  }
  return {x: 0, y: taken.length * GRID.y};
}

function dagreLayout(ids, edges) {
  const graph = new dagre.graphlib.Graph();
  graph.setGraph({rankdir: 'LR', nodesep: 40, ranksep: 96, marginx: 12, marginy: 12});
  graph.setDefaultEdgeLabel(() => ({}));
  for (const id of [...ids].sort()) graph.setNode(id, {width: NODE_SIZE.width, height: NODE_SIZE.height});
  const seen = new Set();
  for (const edge of edges || []) {
    if (!edge || !graph.hasNode(edge.from) || !graph.hasNode(edge.to) || edge.from === edge.to) continue;
    const key = `${edge.from}\u0000${edge.to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    graph.setEdge(edge.from, edge.to);
  }
  dagre.layout(graph);
  const out = {};
  for (const id of graph.nodes()) {
    const node = graph.node(id);
    if (node && Number.isFinite(node.x) && Number.isFinite(node.y)) {
      out[id] = {x: round(node.x - NODE_SIZE.width / 2), y: round(node.y - NODE_SIZE.height / 2)};
    }
  }
  return out;
}

/** Layout one scope: saved spots win, the rest come from dagre, relocated off collisions. */
export function layoutScope({skills = [], edges = [], saved = {}} = {}) {
  const ids = unique(skills.filter(isSkillId));
  const fixed = {};
  const pending = [];
  for (const id of ids) {
    const point = finitePoint(saved?.[id]);
    if (point) fixed[id] = point;
    else pending.push(id);
  }
  if (pending.length) {
    let computed;
    try {
      computed = dagreLayout(ids, edges);
    } catch {
      computed = {};
    }
    const taken = Object.values(fixed);
    for (const id of pending) {
      let point = computed[id] || {x: 0, y: 0};
      if (collides(point, taken)) point = freeSlot(taken);
      taken.push(point);
      fixed[id] = point;
    }
  }
  const positions = {};
  for (const id of ids) positions[id] = fixed[id] || {x: 0, y: 0};
  return positions;
}

/** xyflow-ready projection of one scope. One node per complete skill, never a step. */
export function projectGraph({draft, scopeId, index = new Map()} = {}) {
  const scope = scopeOf(draft, scopeId);
  if (!scope) return {nodes: [], edges: []};
  const positions = layoutScope({
    skills: scope.skills, edges: scope.edges, saved: draft.layout?.[scopeId] || {},
  });
  const nodes = scope.skills.map((id) => {
    const override = nodeOverride(draft, id) || {};
    return {
      id,
      type: 'skill',
      position: positions[id],
      draggable: true,
      selectable: true,
      data: {
        skill: id,
        title: override.title || index.get(id)?.title || id,
        note: override.note || '',
        icon: override.icon || '',
        color: override.color || '',
      },
    };
  });
  const edges = (scope.edges || []).map((edge) => {
    const handles = edgeHandles(edge, positions, scope.edges);
    return {
      id: edgeKey(edge),
      type: 'skill',
      source: edge.from,
      target: edge.to,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      data: {label: edge.label || '', condition: edge.condition || '', key: edgeKey(edge)},
    };
  });
  return {nodes, edges};
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

function materializeLayout(draft) {
  const layout = {};
  for (const scope of [{id: SHARED, skills: draft.shared, edges: []}, ...draft.paradigms]) {
    const positions = layoutScope({skills: scope.skills, edges: scope.edges, saved: draft.layout?.[scope.id] || {}});
    if (Object.keys(positions).length) layout[scope.id] = positions;
  }
  return layout;
}

/** Freeze every scope so reopening the editor shows the exact same canvas. */
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
  const layout = materializeLayout(draft);
  if (Object.keys(layout).length) architecture.layout = layout;
  return architecture;
}

/** mode.save request: fingerprint, document and the saved root set are preserved. */
export function saveRequest({mode, draft, roots = []} = {}) {
  // Authored Mermaid owns relationships; this older editor only manages its members.
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
