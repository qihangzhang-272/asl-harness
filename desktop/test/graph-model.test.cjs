const { test } = require("node:test");
const assert = require("node:assert/strict");

const model = () => import("../src/graph-model.mjs");

test('removing a canvas node affects only its current paradigm, and prunes a last unused root',async()=>{
  const {removeScopeSkill}=await model();
  const state={roots:['search','a','b','c'],draft:authored()};
  const removed=removeScopeSkill(state,'b','one',inventory);
  assert.deepEqual(removed.draft.paradigms[0].skills,['a']);
  assert.deepEqual(removed.draft.paradigms[0].edges,[]);
  assert.deepEqual(removed.draft.paradigms[1].skills,['b','c']);
  assert.deepEqual(removed.roots,state.roots);
  const final=removeScopeSkill(removed,'b','two',inventory);
  assert.ok(!final.roots.includes('b'));
  assert.ok(!final.draft.paradigms.some(p=>p.skills.includes('b')));
  assert.throws(()=>removeScopeSkill(state,'a','one',[...inventory,{id:'b',requires:['a']}]),/依赖/);
});

test('removing a Mode root prunes its display and edges but keeps still-required skills',async()=>{
  const {removeRoot}=await model();
  const inventory=[{id:'a',requires:['b']},{id:'b'},{id:'c'}];
  const state={roots:['a','b','c'],draft:{nodes:[{skill:'c',title:'C'}],shared:[],paradigms:[{id:'one',title:'工作',description:'配合',skills:['a','b','c'],edges:[{from:'a',to:'c',label:'交付'}]}],layout:{one:{c:{x:5,y:6}}}}};
  const retained=removeRoot(state,'b',inventory);
  assert.deepEqual(retained.roots,['a','c']);
  assert.ok(retained.draft.paradigms[0].skills.includes('b'));
  const removed=removeRoot(retained,'c',inventory);
  assert.deepEqual(removed.roots,['a']);
  assert.deepEqual(removed.draft.nodes,[]);
  assert.deepEqual(removed.draft.paradigms[0].edges,[]);
  assert.deepEqual(removed.draft.layout,{});
});

const skill = (id, title = id, description = "") => ({ id, title, description });

function authored() {
  return {
    nodes: [{ skill: "a", title: "资料", note: "先积累" }],
    shared: ["search"],
    paradigms: [
      { id: "one", title: "研究", description: "先查再写", skills: ["a", "b"],
        edges: [{ from: "a", to: "b", label: "证据" }] },
      { id: "two", title: "发布", description: "发布前检查", skills: ["b", "c"],
        edges: [{ from: "b", to: "c", label: "草稿", condition: "有配图时" }] },
    ],
    layout: {},
  };
}

const inventory = [skill("search", "检索"), skill("a", "A"), skill("b", "B"), skill("c", "C")];

test("architecture normalization keeps authored meaning and drops unknown references", async () => {
  const { normalizeArchitecture } = await model();
  const draft = normalizeArchitecture({ ...authored(),
    nodes: [...authored().nodes, { skill: "a" }, { skill: "ghost", title: "假技能" }],
    shared: ["search", "search", "ghost"],
    paradigms: [...authored().paradigms, { id: "shared", title: "x", description: "y", skills: ["a"], edges: [] }],
    layout: { one: { a: { x: 10, y: 20 }, ghost: { x: 1, y: 1 } }, other: { a: { x: 1, y: 1 } }, shared: { search: { x: 4, y: 5 } } },
  }, ["search", "a", "b", "c"]);
  assert.deepEqual(draft.shared, ["search"]);
  assert.deepEqual(draft.nodes.map(node => node.skill), ["a"]);
  assert.equal(draft.nodes[0].title, "资料");
  // the reserved `shared` id is not a paradigm id; its skills survive under a fresh id
  assert.deepEqual(draft.paradigms.map(p => p.id), ["one", "two", "paradigm-3"]);
  assert.deepEqual(draft.paradigms[2].skills, ["a"]);
  assert.deepEqual(draft.layout, { one: { a: { x: 10, y: 20 } }, shared: { search: { x: 4, y: 5 } } });
});

test("a global edges definition can be read as one upgradable paradigm", async () => {
  const { normalizeArchitecture } = await model();
  const draft = normalizeArchitecture({ nodes: [], edges: [{ from: "a", to: "b", label: "旧关系" }] }, ["a", "b"]);
  assert.equal(draft.paradigms.length, 1);
  assert.deepEqual(draft.paradigms[0].skills, ["a", "b"]);
  assert.deepEqual(draft.paradigms[0].edges, [{ from: "a", to: "b", label: "旧关系" }]);
  assert.equal(draft.paradigms[0].description, "");
});

test("one complete skill is exactly one node, never a step, and shared draws no edges", async () => {
  const { normalizeArchitecture, projectGraph, skillIndex } = await model();
  const draft = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  const index = skillIndex(inventory);
  const graph = projectGraph({ draft, scopeId: "one", index });
  assert.deepEqual(graph.nodes.map(node => node.id), ["a", "b"]);
  assert.ok(graph.nodes.every(node => node.id === node.data.skill));
  assert.equal(graph.nodes[0].data.title, "资料");
  assert.equal(graph.nodes[0].data.note, "先积累");
  assert.equal(graph.nodes[1].data.title, "B");
  assert.deepEqual(graph.edges.map(edge => [edge.id, edge.source, edge.target, edge.data.label]), [["a->b", "a", "b", "证据"]]);
  const shared = projectGraph({ draft, scopeId: "shared", index });
  assert.deepEqual(shared.nodes.map(node => node.id), ["search"]);
  assert.deepEqual(shared.edges, []);
});

test("positions come from saved layout first, otherwise a deterministic structured layout", async () => {
  const { layoutScope, projectGraph, normalizeArchitecture, skillIndex } = await model();
  const draft = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  const first = layoutScope({ skills: ["a", "b"], edges: draft.paradigms[0].edges });
  const again = layoutScope({ skills: ["a", "b"], edges: draft.paradigms[0].edges });
  assert.deepEqual(first, again);
  assert.ok(Number.isFinite(first.a.x) && Number.isFinite(first.a.y));
  assert.notDeepEqual(first.a, first.b);
  const saved = layoutScope({ skills: ["a", "b"], edges: draft.paradigms[0].edges, saved: { b: { x: 12, y: 34 } } });
  assert.deepEqual(saved.b, { x: 12, y: 34 });
  const graph = projectGraph({ draft: { ...draft, layout: { one: { a: { x: 5, y: 6 } } } }, scopeId: "one", index: skillIndex(inventory) });
  assert.deepEqual(graph.nodes.find(node => node.id === "a").position, { x: 5, y: 6 });
});

test("cycles stay legal and still receive a layout", async () => {
  const { layoutScope, validateDraft, normalizeArchitecture } = await model();
  const architecture = { nodes: [], shared: [], paradigms: [{ id: "loop", title: "来回", description: "先写再改",
    skills: ["a", "b"], edges: [{ from: "a", to: "b", label: "草稿" }, { from: "b", to: "a", label: "反馈" }] }], layout: {} };
  const draft = normalizeArchitecture(architecture, ["a", "b"]);
  const positions = layoutScope({ skills: draft.paradigms[0].skills, edges: draft.paradigms[0].edges });
  assert.deepEqual(Object.keys(positions).sort(), ["a", "b"]);
  assert.ok(Number.isFinite(positions.a.x) && Number.isFinite(positions.b.x));
  assert.equal(validateDraft({ draft, members: ["a", "b"] }).ok, true);
});

test("the free-slot grid avoids every taken position and is deterministic", async () => {
  const { freeSlot, NODE_SIZE } = await model();
  const taken = [{ x: 0, y: 0 }];
  const slot = freeSlot(taken);
  assert.deepEqual(slot, freeSlot(taken));
  assert.ok(slot.x !== 0 || slot.y !== 0);
  assert.ok(Math.abs(slot.x) >= NODE_SIZE.width || Math.abs(slot.y) >= NODE_SIZE.height);
});

test("magnetic points follow relative placement unless an edge pins them", async () => {
  const { defaultHandles, edgeHandles } = await model();
  assert.deepEqual(defaultHandles({ x: 0, y: 0 }, { x: 200, y: 0 }), { sourceHandle: "right", targetHandle: "left" });
  assert.deepEqual(defaultHandles({ x: 200, y: 0 }, { x: 0, y: 0 }), { sourceHandle: "left", targetHandle: "right" });
  assert.deepEqual(defaultHandles({ x: 0, y: 0 }, { x: 0, y: 200 }), { sourceHandle: "bottom", targetHandle: "top" });
  const positions = { a: { x: 0, y: 0 }, b: { x: 200, y: 0 } };
  assert.deepEqual(edgeHandles({ from: "a", to: "b", sourceHandle: "top", targetHandle: "bottom" }, positions),
    { sourceHandle: "top", targetHandle: "bottom" });
  assert.deepEqual(edgeHandles({ from: "a", to: "b", sourceHandle: "diagonal" }, positions),
    { sourceHandle: "right", targetHandle: "left" });
});

test("removal only clears the scope it is taken from; shared is the only full move", async () => {
  const { normalizeArchitecture, placeSkill, assignedScopes } = await model();
  const original = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  // a scope-less removal is a no-op: nothing silently leaves every paradigm
  assert.equal(placeSkill(original, "b", ""), original);
  const outOfOne = placeSkill(original, "b", "", "one");
  assert.deepEqual(assignedScopes(outOfOne, "b"), ["two"]);
  assert.deepEqual(outOfOne.paradigms[0].skills, ["a"]);
  assert.deepEqual(outOfOne.paradigms[0].edges, []);
  assert.deepEqual(outOfOne.paradigms[1].skills, ["b", "c"]);
  assert.deepEqual(outOfOne.paradigms[1].edges, [{ from: "b", to: "c", label: "草稿", condition: "有配图时" }]);
  const outOfBoth = placeSkill(outOfOne, "b", "", "two");
  assert.deepEqual(assignedScopes(outOfBoth, "b"), []);
  assert.deepEqual(outOfBoth.paradigms[1].skills, ["c"]);
  assert.deepEqual(original.paradigms[0].skills, ["a", "b"]);
  const back = placeSkill(outOfBoth, "b", "two");
  assert.deepEqual(assignedScopes(back, "b"), ["two"]);
  assert.deepEqual(back.paradigms[1].skills, ["c", "b"]);
  const shared = placeSkill(outOfOne, "a", "shared");
  assert.deepEqual(assignedScopes(shared, "a"), ["shared"]);
  assert.ok(!shared.paradigms[0].skills.includes("a"));
});

test("the same skill can stay in several paradigms; removal only touches the scope on screen", async () => {
  const { normalizeArchitecture, placeSkill, assignedScopes, setPositions } = await model();
  const draft = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  // a already belongs to "one"; joining "two" must not pull it out of "one",
  // and must keep "one" edges intact.
  const joined = placeSkill(draft, "a", "two");
  assert.deepEqual(assignedScopes(joined, "a"), ["one", "two"]);
  assert.deepEqual(joined.paradigms[0].skills, ["a", "b"]);
  assert.deepEqual(joined.paradigms[0].edges, [{ from: "a", to: "b", label: "证据" }]);
  assert.deepEqual(joined.paradigms[1].skills, ["b", "c", "a"]);
  // removing from "one" leaves the same skill safely in "two".
  const removed = placeSkill(joined, "a", "", "one");
  assert.deepEqual(assignedScopes(removed, "a"), ["two"]);
  assert.deepEqual(removed.paradigms[0].skills, ["b"]);
  assert.deepEqual(removed.paradigms[0].edges, []);
  assert.deepEqual(removed.paradigms[1].skills, ["b", "c", "a"]);
  // joining a paradigm only leaves shared and drops its stale shared layout point.
  const withSharedLayout = setPositions(draft, "shared", { search: { x: 9, y: 9 } });
  const placed = placeSkill(withSharedLayout, "search", "one");
  assert.deepEqual(assignedScopes(placed, "search"), ["one"]);
  assert.equal(placed.layout.shared, undefined);
  assert.deepEqual(placed.paradigms[0].skills, ["a", "b", "search"]);
});

test("moving to shared leaves every paradigm and clears the stale layout points", async () => {
  const { normalizeArchitecture, placeSkill, assignedScopes, setPositions } = await model();
  let draft = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  draft = setPositions(draft, "one", { a: { x: 1, y: 2 }, b: { x: 3, y: 4 } });
  draft = setPositions(draft, "two", { b: { x: 5, y: 6 } });
  const shared = placeSkill(draft, "b", "shared");
  assert.deepEqual(assignedScopes(shared, "b"), ["shared"]);
  assert.deepEqual(shared.layout.one, { a: { x: 1, y: 2 } });
  assert.equal(shared.layout.two, undefined);
  assert.deepEqual(shared.paradigms[0].skills, ["a"]);
  assert.deepEqual(shared.paradigms[0].edges, []);
});

test("condition stops at 160 characters and layout points stay within ±100000", async () => {
  const { LIMITS, finitePoint, normalizeArchitecture, updateEdge, validateDraft } = await model();
  assert.equal(LIMITS.condition, 160);
  assert.deepEqual(finitePoint({ x: 100000, y: -100000 }), { x: 100000, y: -100000 });
  assert.equal(finitePoint({ x: 100001, y: 0 }), null);
  assert.equal(finitePoint({ x: 0, y: -100001 }), null);
  assert.equal(finitePoint({ x: true, y: 0 }), null);
  assert.equal(finitePoint({ x: 0, y: '1' }), null);
  const members = ["search", "a", "b", "c"];
  const draft = normalizeArchitecture(authored(), members);
  const over = updateEdge(draft, "one", "a->b", { condition: "x".repeat(161) });
  assert.match(validateDraft({ draft: over, members }).errors.map(error => error.code).join(","), /edge\.condition/);
  const exact = updateEdge(draft, "one", "a->b", { condition: "x".repeat(160) });
  assert.equal(validateDraft({ draft: exact, members }).ok, true);
});

test("a blank edge condition is absent, matching the core's 1-160 rule", async () => {
  const { normalizeArchitecture, materializeArchitecture, addEdge, validateDraft } = await model();
  const members = ["a", "b"];
  const architecture = { nodes: [], shared: [], paradigms: [{ id: "one", title: "工作", description: "配合",
    skills: ["a", "b"], edges: [{ from: "a", to: "b", label: "证据", condition: "   " }] }], layout: {} };
  const draft = normalizeArchitecture(architecture, members);
  assert.deepEqual(draft.paradigms[0].edges, [{ from: "a", to: "b", label: "证据" }]);
  assert.equal("condition" in materializeArchitecture(draft).paradigms[0].edges[0], false);
  assert.equal(validateDraft({ draft, members }).ok, true);
  // Tolerant reading drops a blank condition; a raw draft that still carries one is
  // flagged before save, because the core schema rejects present-but-blank too.
  const raw = { ...draft, paradigms: [{ ...draft.paradigms[0], edges: [{ from: "a", to: "b", label: "证据", condition: "   " }] }] };
  assert.match(validateDraft({ draft: raw, members }).errors.map(error => error.code).join(","), /edge\.condition/);
  const spaced = normalizeArchitecture({ nodes: [], shared: [], paradigms: [{ id: "one", title: "工作", description: "配合",
    skills: ["a", "b"], edges: [{ from: "a", to: "b", label: "证据", condition: " x " }] }], layout: {} }, members);
  assert.equal(spaced.paradigms[0].edges[0].condition, " x ");
  const added = addEdge(draft, "one", { from: "b", to: "a", label: "反馈", condition: "" });
  assert.deepEqual(added.paradigms[0].edges[1], { from: "b", to: "a", label: "反馈" });
});

test("members are the recursive requires closure of the declared roots only", async () => {
  const { memberIds, rootIds } = await model();
  const inventory = [
    { id: "a", requires: ["b"] },
    { id: "b", requires: ["c"] },
    { id: "c" },
    { id: "z" },
  ];
  assert.deepEqual(memberIds(["a"], inventory), ["a", "b", "c"]);
  assert.deepEqual(memberIds(["a", "z"], inventory), ["a", "b", "c", "z"]);
  assert.deepEqual(memberIds([], inventory), []);
  // an empty roots list never falls back to the whole library
  assert.deepEqual(rootIds({ roots: [], skills: ["a", "b"] }), []);
  assert.deepEqual(rootIds({ skills: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(rootIds({ roots: ["a"], skills: ["a", "b"] }), ["a"]);
});

test("an empty Mode stays a draft and cannot be saved", async () => {
  const { normalizeArchitecture, validateDraft } = await model();
  const empty = validateDraft({ draft: { nodes: [], shared: [], paradigms: [], layout: {} }, members: [] });
  assert.equal(empty.ok, false);
  assert.equal(empty.errors[0].code, "mode.empty");
  const draft = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  assert.equal(validateDraft({ draft, members: ["search", "a", "b", "c"] }).ok, true);
});

test("install candidates keep one row per source and never overwrite the library", async () => {
  const { installCandidates, mergeInventory } = await model();
  const rows = installCandidates([
    { id: "a", title: "one", source: "C:/x/a" },
    { id: "a", title: "two", source: "C:/y/a" },
    { id: "a", title: "three", source: "C:/x/a" },
    { id: "bad id", source: "z" },
  ]);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map(row => row.sourceKey), ["C:/x/a", "C:/y/a", "C:/x/a#2"]);
  assert.equal(new Set(rows.map(row => row.sourceKey)).size, 3);
  const merged = mergeInventory(
    [{ id: "a", title: "library" }],
    [{ id: "a", title: "install" }, { id: "b", title: "new" }],
  );
  assert.deepEqual(merged, [{ id: "a", title: "library" }, { id: "b", title: "new" }]);
});

test("removing a paradigm returns its skills to unassigned without touching display overrides", async () => {
  const { normalizeArchitecture, removeParadigm, assignedScopes, setPositions } = await model();
  const draft = setPositions(normalizeArchitecture(authored(), ["search", "a", "b", "c"]), "one", { a: { x: 1, y: 2 } });
  const next = removeParadigm(draft, "one");
  assert.deepEqual(next.paradigms.map(p => p.id), ["two"]);
  assert.deepEqual(assignedScopes(next, "a"), []);
  // b lived in both paradigms, so dropping "one" leaves it safely in "two".
  assert.deepEqual(assignedScopes(next, "b"), ["two"]);
  assert.equal(next.nodes.find(node => node.skill === "a").title, "资料");
  assert.equal(next.layout.one, undefined);
});

test("edges refuse duplicates, self links and skills outside the paradigm", async () => {
  const { normalizeArchitecture, addEdge, updateEdge, removeEdge } = await model();
  const draft = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  assert.equal(addEdge(draft, "one", { from: "a", to: "b", label: "重复" }), draft);
  assert.equal(addEdge(draft, "one", { from: "a", to: "a", label: "自环" }), draft);
  assert.equal(addEdge(draft, "one", { from: "a", to: "c", label: "越界" }), draft);
  const added = addEdge(draft, "one", { from: "b", to: "a", label: "", condition: "有反馈", sourceHandle: "top", targetHandle: "bottom" });
  assert.deepEqual(added.paradigms[0].edges[1], { from: "b", to: "a", label: "", condition: "有反馈", sourceHandle: "top", targetHandle: "bottom" });
  const patched = updateEdge(added, "one", "b->a", { label: "反馈", condition: "" });
  assert.deepEqual(patched.paradigms[0].edges[1], { from: "b", to: "a", label: "反馈", sourceHandle: "top", targetHandle: "bottom" });
  assert.deepEqual(removeEdge(added, "one", "b->a").paradigms[0].edges.length, 1);
});

test("saving validates full coverage, meanings and paradigm text", async () => {
  const { validateDraft, normalizeArchitecture, updateEdge, updateParadigm } = await model();
  const members = ["search", "a", "b", "c"];
  const base = { ...authored(), paradigms: [authored().paradigms[0], { id: "two", title: "发布", description: "发布前检查", skills: ["b"], edges: [] }] };
  const draft = normalizeArchitecture(base, members);
  const result = validateDraft({ draft, members });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unassigned, ["c"]);
  assert.match(result.errors.map(error => error.message).join(" "), /1 个技能待归属/);
  const covered = normalizeArchitecture({ ...base, shared: ["search", "c"] }, members);
  assert.equal(validateDraft({ draft: covered, members }).ok, true);
  const unlabeled = updateEdge(covered, "one", "a->b", { label: "" });
  assert.equal(validateDraft({ draft: unlabeled, members }).ok, false);
  assert.match(validateDraft({ draft: unlabeled, members }).errors[0].message, /关联都需要含义/);
  const undescribed = updateParadigm(covered, "one", { description: "  " });
  assert.match(validateDraft({ draft: undescribed, members }).errors.map(error => error.code).join(","), /paradigm\.description/);
});

test("save keeps fingerprint, document, roots and writes a reopenable layout", async () => {
  const { normalizeArchitecture, saveRequest, materializeArchitecture, projectGraph, skillIndex, setPositions } = await model();
  const roots = ["a", "b", "c", "search"];
  const draft = normalizeArchitecture(authored(), roots);
  const moved = setPositions(draft, "one", { a: { x: 40, y: 60 } });
  const request = saveRequest({ mode: { id: "work", title: "工作", fingerprint: "fp-1", document: "# 工作", roots: ["a", "b"] }, draft: moved, roots });
  assert.equal(request.operation, "mode.save");
  assert.equal(request.id, "work");
  assert.equal(request.expected, "fp-1");
  assert.equal(request.document, "# 工作");
  assert.deepEqual(request.skills, ["a", "b", "c", "search"]);
  assert.deepEqual(request.architecture.paradigms.map(p => p.id), ["one", "two"]);
  assert.equal(request.architecture.edges, undefined);
  assert.deepEqual(request.architecture.layout.one.a, { x: 40, y: 60 });
  assert.ok(Object.keys(request.architecture.layout.one).includes("b"));
  assert.ok(!Object.keys(request.architecture.layout.one).includes("c"));
  const reopened = normalizeArchitecture(request.architecture, roots);
  assert.deepEqual(reopened.layout.one.a, { x: 40, y: 60 });
  // reopening and saving again is stable: the frozen layout is what the person saw
  assert.deepEqual(materializeArchitecture(reopened), request.architecture);
  const graph = projectGraph({ draft: reopened, scopeId: "one", index: skillIndex(inventory) });
  assert.deepEqual(graph.nodes.find(node => node.id === "a").position, { x: 40, y: 60 });
});

test("undo and redo move between complete drafts and ignore no-op commits", async () => {
  const { createHistory, commitHistory, undoHistory, redoHistory, normalizeArchitecture, placeSkill } = await model();
  const draft = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  let history = createHistory({ draft, roots: ["a", "b", "c", "search"] });
  assert.equal(commitHistory(history, history.present), history);
  history = commitHistory(history, { draft: placeSkill(draft, "a", "two"), roots: history.present.roots });
  assert.equal(history.past.length, 1);
  // "a" joins "two" but keeps its place and edge in "one".
  assert.deepEqual(history.present.draft.paradigms[0].skills, ["a", "b"]);
  assert.deepEqual(history.present.draft.paradigms[0].edges, [{ from: "a", to: "b", label: "证据" }]);
  assert.deepEqual(history.present.draft.paradigms[1].skills, ["b", "c", "a"]);
  history = undoHistory(history);
  assert.deepEqual(history.present.draft.paradigms[0].skills, ["a", "b"]);
  assert.deepEqual(history.present.draft.paradigms[1].skills, ["b", "c"]);
  history = redoHistory(history);
  assert.deepEqual(history.present.draft.paradigms[1].skills, ["b", "c", "a"]);
  const fresh = createHistory(history.present);
  assert.equal(undoHistory(fresh), fresh);
  assert.equal(redoHistory(fresh), fresh);
});

test("editing relations never rearranges nodes that are already on screen", async () => {
  const { addEdge, normalizeArchitecture, projectGraph, removeEdge, setNodeOverride, skillIndex } = await model();
  const index = skillIndex(inventory);
  const draft = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  const shown = (value) => Object.fromEntries(
    projectGraph({ draft: value, scopeId: "one", index }).nodes.map(node => [node.id, node.position]),
  );
  // No saved layout yet: these are the auto positions the person is looking at.
  const before = shown(draft);
  const connected = addEdge(draft, "one", { from: "b", to: "a", label: "反馈" });
  assert.deepEqual(shown(connected), before);
  const noted = setNodeOverride(connected, "a", { note: "改备注" });
  assert.deepEqual(shown(noted), before);
  const dropped = removeEdge(connected, "one", "a->b");
  assert.deepEqual(shown(dropped), before);
});

test("a skill joining a scope does not shuffle the nodes already placed there", async () => {
  const { normalizeArchitecture, placeSkill, projectGraph, skillIndex } = await model();
  const index = skillIndex(inventory);
  const draft = normalizeArchitecture(authored(), ["search", "a", "b", "c"]);
  const before = projectGraph({ draft, scopeId: "one", index }).nodes.map(node => [node.id, node.position]);
  const joined = placeSkill(draft, "c", "one");
  const graph = projectGraph({ draft: joined, scopeId: "one", index });
  assert.deepEqual(graph.nodes.filter(node => node.id !== "c").map(node => [node.id, node.position]), before);
  assert.ok(Number.isFinite(graph.nodes.find(node => node.id === "c").position.x));
});

// The real editor failure: four skills crowded into one row, a round trip between the middle
// pair, and a corpus node parked underneath. Coordinates are the ones the person dragged to.
const CREATOR_MEMBERS = [
  "reference-video-analysis", "topic-research-deposition", "public-account-writing-style",
  "wechat-account-corpus-research", "editorial-visual-storytelling", "baoyu-article-illustrator",
  "baoyu-comic", "baoyu-cover-image", "baoyu-diagram",
];

const creatorStudio = () => ({
  nodes: [], shared: [],
  paradigms: [
    { id: "research-writing", title: "从材料到文章", description: "先查再写",
      skills: ["reference-video-analysis", "topic-research-deposition", "public-account-writing-style", "wechat-account-corpus-research"],
      edges: [
        { from: "reference-video-analysis", to: "topic-research-deposition", label: "视频线索与可核查材料" },
        { from: "wechat-account-corpus-research", to: "public-account-writing-style", label: "账号表达与读者参考" },
        { from: "topic-research-deposition", to: "public-account-writing-style", label: "研究材料与选题依据" },
        { from: "public-account-writing-style", to: "topic-research-deposition", label: "反馈待补证据" },
      ] },
    { id: "visual-storytelling", title: "围绕内容做视觉", description: "先设计视觉任务",
      skills: ["editorial-visual-storytelling", "baoyu-article-illustrator", "baoyu-comic", "baoyu-cover-image", "baoyu-diagram"],
      edges: [
        { from: "editorial-visual-storytelling", to: "baoyu-article-illustrator", label: "按画面任务选择形式" },
        { from: "editorial-visual-storytelling", to: "baoyu-comic", label: "按画面任务选择形式" },
        { from: "editorial-visual-storytelling", to: "baoyu-cover-image", label: "按画面任务选择形式" },
        { from: "editorial-visual-storytelling", to: "baoyu-diagram", label: "按画面任务选择形式" },
      ] },
  ],
  layout: { "research-writing": {
    "reference-video-analysis": { x: 0, y: 0 },
    "topic-research-deposition": { x: 300, y: 60 },
    "public-account-writing-style": { x: 521, y: 60 },
    "wechat-account-corpus-research": { x: 300, y: 150 },
  } },
});

const overlaps = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

// Liang-Barsky slab clip: does the straight leader from `a` to `b` cut through this node rectangle?
const segmentCuts = (a, b, box) => {
  let near = 0, far = 1;
  for (const [origin, delta, min, max] of [[a.x, b.x - a.x, box.x, box.x + box.width], [a.y, b.y - a.y, box.y, box.y + box.height]]) {
    if (!delta) { if (origin < min || origin > max) return false; continue; }
    near = Math.max(near, Math.min((min - origin) / delta, (max - origin) / delta));
    far = Math.min(far, Math.max((min - origin) / delta, (max - origin) / delta));
    if (near > far) return false;
  }
  return true;
};

async function labelBoxes(graph, zoom) {
  const { placeLabels, labelBox, labelScale } = await model();
  const spots = placeLabels({ nodes: graph.nodes, edges: graph.edges, zoom });
  const scale = labelScale(zoom);
  return graph.edges.map((edge) => {
    const spot = spots[edge.id];
    assert.ok(spot, `every relation keeps a label spot at zoom ${zoom}: ${edge.id}`);
    const box = labelBox(edge.data.label, edge.data.condition);
    return {
      id: edge.id,
      x: spot.x - (box.width * scale) / 2, y: spot.y - (box.height * scale) / 2,
      width: box.width * scale, height: box.height * scale,
    };
  });
}

test("a round trip is drawn as two lanes, never one line on top of the other", async () => {
  const { normalizeArchitecture, projectGraph, edgeAnchor, skillIndex } = await model();
  const draft = normalizeArchitecture(creatorStudio(), CREATOR_MEMBERS);
  const graph = projectGraph({ draft, scopeId: "research-writing", index: skillIndex([]) });
  const forward = graph.edges.find((edge) => edge.id === "topic-research-deposition->public-account-writing-style");
  const back = graph.edges.find((edge) => edge.id === "public-account-writing-style->topic-research-deposition");
  assert.ok(forward && back);
  assert.notDeepEqual([forward.sourceHandle, forward.targetHandle], [back.sourceHandle, back.targetHandle]);
  const positions = Object.fromEntries(graph.nodes.map((node) => [node.id, node.position]));
  const left = edgeAnchor(forward, positions), right = edgeAnchor(back, positions);
  assert.notDeepEqual(left, right);
  // the lanes sit a node half-height apart, so neither line can be mistaken for the other
  assert.ok(Math.abs(left.y - right.y) >= 29, `lanes only ${Math.abs(left.y - right.y)} apart`);
});

test("a vertical round trip separates sideways instead of doubling", async () => {
  const { normalizeArchitecture, projectGraph, edgeAnchor, skillIndex } = await model();
  const draft = normalizeArchitecture({ nodes: [], shared: [], paradigms: [{ id: "pair", title: "来回", description: "先写再改",
    skills: ["a", "b"], edges: [{ from: "a", to: "b", label: "草稿" }, { from: "b", to: "a", label: "反馈" }] }],
    layout: { pair: { a: { x: 40, y: 0 }, b: { x: 40, y: 120 } } } }, ["a", "b"]);
  const graph = projectGraph({ draft, scopeId: "pair", index: skillIndex([]) });
  const [forward, back] = graph.edges;
  assert.notDeepEqual([forward.sourceHandle, forward.targetHandle], [back.sourceHandle, back.targetHandle]);
  const positions = { a: { x: 40, y: 0 }, b: { x: 40, y: 120 } };
  const anchors = graph.edges.map((edge) => edgeAnchor(edge, positions));
  assert.ok(Math.abs(anchors[0].x - anchors[1].x) >= 40, "the two lanes share one line");
});

test("no label hides under a node or under another label, in a row or in a fan", async () => {
  const { normalizeArchitecture, projectGraph, NODE_SIZE, skillIndex } = await model();
  const draft = normalizeArchitecture(creatorStudio(), CREATOR_MEMBERS);
  const index = skillIndex([]);
  for (const scopeId of ["research-writing", "visual-storytelling"]) {
    const graph = projectGraph({ draft, scopeId, index });
    assert.ok(graph.nodes.length >= 4);
    const rects = graph.nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y, width: NODE_SIZE.width, height: NODE_SIZE.height }));
    for (const zoom of [0.7, 1, 1.4]) {
      const boxes = await labelBoxes(graph, zoom);
      for (const box of boxes) for (const rect of rects) {
        assert.ok(!overlaps(box, rect), `${scopeId}: ${box.id} covers ${rect.id} at zoom ${zoom}`);
      }
      for (let i = 0; i < boxes.length; i += 1) for (let j = i + 1; j < boxes.length; j += 1) {
        assert.ok(!overlaps(boxes[i], boxes[j]), `${scopeId}: ${boxes[i].id} covers ${boxes[j].id} at zoom ${zoom}`);
      }
    }
  }
});

test("re-routing a dragged node never rewrites the coordinates the person saved", async () => {
  const { normalizeArchitecture, projectGraph, setPositions, skillIndex } = await model();
  const draft = normalizeArchitecture({ nodes: [], shared: [], paradigms: [{ id: "pair", title: "来回", description: "先写再改",
    skills: ["a", "b"], edges: [{ from: "a", to: "b", label: "草稿" }, { from: "b", to: "a", label: "反馈" }] }],
    layout: { pair: { a: { x: 40, y: 0 }, b: { x: 40, y: 120 } } } }, ["a", "b"]);
  const handles = (value) => value.edges.map((edge) => `${edge.sourceHandle}->${edge.targetHandle}`);
  const before = handles(projectGraph({ draft, scopeId: "pair", index: skillIndex([]) }));
  const saved = JSON.stringify(draft.layout);
  projectGraph({ draft, scopeId: "pair", index: skillIndex([]) });
  assert.equal(JSON.stringify(draft.layout), saved, "projecting a graph moved a saved node");
  // dragging b to the other side flips the pair onto the other lane, and keeps them apart
  const moved = setPositions(draft, "pair", { b: { x: 400, y: 0 } });
  assert.deepEqual(moved.layout.pair.b, { x: 400, y: 0 });
  const after = handles(projectGraph({ draft: moved, scopeId: "pair", index: skillIndex([]) }));
  assert.notDeepEqual(after, before);
  assert.equal(new Set(after).size, 2);
});

// The canvas draws the route with @xyflow/react, so the model is checked against that same
// function: a label sits on the real anchor, and a label that had to move keeps a leader back.
test("labels sit on the route xyflow really draws, and a moved label keeps a leader", async () => {
  const { normalizeArchitecture, projectGraph, skillIndex, placeLabels, labelBox, labelScale, handlePoint, EDGE_OFFSET, EDGE_RADIUS, NODE_SIZE } = await model();
  const { getSmoothStepPath } = await import("@xyflow/react");
  const draft = normalizeArchitecture(creatorStudio(), CREATOR_MEMBERS);
  const index = skillIndex([]);
  let leaders = 0;
  for (const scopeId of ["research-writing", "visual-storytelling"]) {
    const graph = projectGraph({ draft, scopeId, index });
    const nodeRects = graph.nodes.map((node) => ({ id: node.id, x: node.position.x, y: node.position.y, width: NODE_SIZE.width, height: NODE_SIZE.height }));
    const positions = Object.fromEntries(graph.nodes.map((node) => [node.id, node.position]));
    for (const zoom of [0.7, 1, 1.4]) {
      const spots = placeLabels({ nodes: graph.nodes, edges: graph.edges, zoom });
      const scale = labelScale(zoom);
      const boxes = [];
      for (const edge of graph.edges) {
        const spot = spots[edge.id];
        assert.ok(spot && spot.anchor, `${scopeId}: ${edge.id} has no anchor at zoom ${zoom}`);
        const source = handlePoint(positions[edge.source], edge.sourceHandle);
        const target = handlePoint(positions[edge.target], edge.targetHandle);
        const [, wantX, wantY] = getSmoothStepPath({
          sourceX: source.x, sourceY: source.y, sourcePosition: edge.sourceHandle,
          targetX: target.x, targetY: target.y, targetPosition: edge.targetHandle,
          borderRadius: EDGE_RADIUS, offset: EDGE_OFFSET,
        });
        const anchor = { x: Math.round(wantX * 100) / 100, y: Math.round(wantY * 100) / 100 };
        assert.deepEqual(spot.anchor, anchor, `${scopeId}: ${edge.id} is not on the route xyflow draws`);
        const box = labelBox(edge.data.label, edge.data.condition);
        const rect = {
          id: edge.id,
          x: spot.x - (box.width * scale) / 2, y: spot.y - (box.height * scale) / 2,
          width: box.width * scale, height: box.height * scale,
        };
        const inside = anchor.x >= rect.x && anchor.x <= rect.x + rect.width && anchor.y >= rect.y && anchor.y <= rect.y + rect.height;
        if (inside) {
          assert.equal(spot.leader, null, `${scopeId}: ${edge.id} drew a leader while still on its anchor`);
        } else {
          leaders += 1;
          assert.ok(spot.leader, `${scopeId}: ${edge.id} left its anchor without a leader`);
          // the leader ends on the box it belongs to, not inside it and not on another box
          assert.ok(spot.leader.x >= rect.x - 1e-6 && spot.leader.x <= rect.x + rect.width + 1e-6
            && spot.leader.y >= rect.y - 1e-6 && spot.leader.y <= rect.y + rect.height + 1e-6,
            `${scopeId}: ${edge.id} leader misses its own box`);
          assert.ok(Math.hypot(spot.leader.x - anchor.x, spot.leader.y - anchor.y) > 0, `${scopeId}: ${edge.id} leader has no length`);
        }
        for (const nodeRect of nodeRects) {
          assert.ok(!overlaps(rect, nodeRect), `${scopeId}: ${edge.id} covers ${nodeRect.id} at zoom ${zoom}`);
        }
        for (const other of boxes) {
          assert.ok(!overlaps(rect, other), `${scopeId}: ${edge.id} covers ${other.id} at zoom ${zoom}`);
        }
        boxes.push(rect);
      }
    }
  }
  assert.ok(leaders > 0, "no label ever needed a leader, so the leader path is untested");
});

// The real editor after the person dragged the research node by (60, 40): the canvas shows the
// frozen dagre row with that one node moved, and the middle of "账号表达与读者参考" now lands inside
// the dragged node, so every walk from that midpoint would thread through it. The anchor has to step
// out to the short stub beside its own magnetic point, and the meaning must stay off every node.
test("a midpoint buried in a dragged node steps onto its own line stub, never under a node", async () => {
  const {
    LABEL, NODE_SIZE, normalizeArchitecture, projectGraph, setPositions, placeLabels, labelBox, labelScale,
    edgeAnchor, handlePoint, skillIndex,
  } = await model();
  const index = skillIndex([]);
  // The real mode carries no saved layout, so the canvas first shows the dagre row; the drag freezes
  // exactly that row with the one node moved, the same way onNodeDragStop writes every position back.
  const draft = normalizeArchitecture({ ...creatorStudio(), layout: {} }, CREATOR_MEMBERS);
  const start = Object.fromEntries(projectGraph({ draft, scopeId: "research-writing", index }).nodes.map((node) => [node.id, node.position]));
  const dragged = setPositions(draft, "research-writing", {
    ...start,
    "topic-research-deposition": { x: start["topic-research-deposition"].x + 60, y: start["topic-research-deposition"].y + 40 },
  });
  const graph = projectGraph({ draft: dragged, scopeId: "research-writing", index });
  const positions = Object.fromEntries(graph.nodes.map((node) => [node.id, node.position]));
  const rects = graph.nodes.map((node) => ({ id: node.id, ...node.position, width: NODE_SIZE.width, height: NODE_SIZE.height }));
  const edge = graph.edges.find((item) => item.id === "wechat-account-corpus-research->public-account-writing-style");
  const midpoint = edgeAnchor(edge, positions);
  const holder = rects.find((rect) => midpoint.x > rect.x && midpoint.x < rect.x + rect.width && midpoint.y > rect.y && midpoint.y < rect.y + rect.height);
  assert.equal(holder?.id, "topic-research-deposition", "the dragged node must be the one the midpoint falls into");
  // Every relation keeps a label, and no label box lands on a node or on another label.
  const spots = placeLabels({ nodes: graph.nodes, edges: graph.edges, zoom: 1 });
  const scale = labelScale(1);
  const boxes = [];
  for (const item of graph.edges) {
    const spot = spots[item.id];
    assert.ok(spot, `every relation keeps a label spot: ${item.id}`);
    const box = labelBox(item.data.label, item.data.condition);
    const rect = {
      id: item.id,
      x: spot.x - (box.width * scale) / 2, y: spot.y - (box.height * scale) / 2,
      width: box.width * scale, height: box.height * scale,
    };
    for (const node of rects) assert.ok(!overlaps(rect, node), `${item.id} covers ${node.id}`);
    for (const other of boxes) assert.ok(!overlaps(rect, other), `${item.id} covers ${other.id}`);
    boxes.push(rect);
  }
  // The buried relation left the midpoint for a point still on the route: a short step out of its own
  // magnetic handle, never a second router.
  const spot = spots[edge.id];
  const direction = { top: { x: 0, y: -1 }, right: { x: 1, y: 0 }, bottom: { x: 0, y: 1 }, left: { x: -1, y: 0 } };
  const stubs = [[edge.source, edge.sourceHandle], [edge.target, edge.targetHandle]].map(([id, side]) => {
    const at = handlePoint(positions[id], side), dir = direction[side];
    return { x: at.x + dir.x * LABEL.probe, y: at.y + dir.y * LABEL.probe };
  });
  assert.ok([midpoint, ...stubs].some((point) => Math.hypot(point.x - spot.anchor.x, point.y - spot.anchor.y) < 1e-6),
    `the label anchor ${JSON.stringify(spot.anchor)} left its own route`);
  assert.ok(Math.hypot(midpoint.x - spot.anchor.x, midpoint.y - spot.anchor.y) > 0, "the label stayed on the buried midpoint");
  // Leaving the anchor means a leader, and that leader must not cross a node interior.
  assert.ok(spot.leader, "a label that left its anchor keeps a leader");
  for (const node of rects) assert.equal(segmentCuts(spot.anchor, spot.leader, node), false, `${edge.id}: the leader crosses ${node.id}`);
});

// The review screenshot: two stacked nodes, one relation, "交付整理结果" with the condition
// "资料已经核实". The sheet draws that as a single flex row inside a 224px border-box; the model
// must box it the same way, and must not count the "条件：" prefix the DOM never renders.
test("a label box matches the sheet's real flex row and keeps the two-node meaning on its line", async () => {
  const { LABEL, TEXT, labelBox, labelText, placeLabels, labelScale } = await model();
  const label = "交付整理结果", condition = "资料已经核实";
  const oneRow = TEXT.edge * TEXT.line + (LABEL.padY + LABEL.border) * 2;
  const box = labelBox(label, condition);
  assert.ok(box.width <= LABEL.max, `box ${box.width}px must stay inside the ${LABEL.max}px cap`);
  assert.equal(box.height, oneRow, "text and badge share the one row the sheet really draws");
  // the hint keeps the prefix; only the box estimate has to ignore it
  assert.equal(labelText(label, condition), `${label} · 条件：${condition}`);
  assert.ok(labelText(label, condition).length > label.length + condition.length);
  // A long text wraps over real rows and drops the long badge to its own row. That badge row is laid
  // out inside the badge's own 128px cap (minus its padding), so it is taller than a text row; the
  // old estimate charged it a text-row height instead. The box must add that real badge height.
  const longText = `${label}${label}${label}`;
  const longBadge = `${condition}${condition}${condition}${condition}`;
  const badgeH = Math.ceil((24 * TEXT.condition) / (LABEL.badgeMax - LABEL.badgePad)) * TEXT.condition * TEXT.line;
  assert.ok(badgeH > TEXT.edge * TEXT.line, "the badge row is taller than a text row, so the two are not interchangeable");
  // once the badge drops below the text rows, the sheet's own 2px row-gap sits above it as well
  assert.ok(Math.abs((labelBox(longText, longBadge).height - labelBox(longText, "").height) - (badgeH + 2)) < 1e-9,
    "the wrapped badge keeps its own height, plus the row-gap it was dropped past");
  // an over-wide meaning still grows the box instead of being flattened back to one row
  assert.ok(labelBox(`${label}${label}${label}`, condition).height >= oneRow);
  // two nodes 40px apart with right -> left handles: the meaning belongs in the gap, not below it
  const nodes = [{ id: "a", position: { x: 12, y: 12 } }, { id: "b", position: { x: 12, y: 110 } }];
  const edges = [{ id: "a->b", source: "a", target: "b", sourceHandle: "right", targetHandle: "left", data: { label, condition } }];
  // the same meaning at zoom 1, 1.1 and 0.8 keeps one reading box and stays on its own line
  for (const zoom of [1, 1.1, 0.8]) {
    const spot = placeLabels({ nodes, edges, zoom })["a->b"];
    assert.equal(spot.anchor.y, 90, `the anchor sits in the gap the review screenshot showed at zoom ${zoom}`);
    assert.equal(spot.y, spot.anchor.y, `the meaning floated off the line between its two nodes at zoom ${zoom}`);
    assert.equal(spot.leader, null, `a meaning back on its own line needs no leader at zoom ${zoom}`);
    assert.equal(spot.width, box.width, `the reading box changed width at zoom ${zoom}`);
    assert.equal(spot.height, box.height, `the reading box changed height at zoom ${zoom}`);
  }
  // a short condition alone must not wrap: a second row would push the meaning off its line
  assert.equal(labelBox("反馈", "有配图").height, oneRow, "a short condition wrapped for no reason");
});

// The planned minimal case, phrased on placeLabel itself: two node rectangles leave a 30px gap at
// y = 0, wider than the label, so a free spot exists exactly sideways and the leader back to the
// anchor runs through that gap. No dagre, no route: just the placement maths.
test("a label refused the spot under a node takes a side spot whose leader crosses no node", async () => {
  const { placeLabel } = await model();
  const anchor = { x: 0, y: 0 }, width = 80, height = 40;
  const blocking = [
    { id: "above", x: -100, y: -95, width: 200, height: 80 },
    { id: "below", x: -100, y: 15, width: 200, height: 80 },
  ];
  const spot = placeLabel({ x: anchor.x, y: anchor.y, width, height, rects: blocking, nodes: blocking });
  assert.notDeepEqual([spot.x, spot.y], [anchor.x, anchor.y], "the label stayed on the blocked spot");
  assert.ok(Math.abs(spot.x) >= 140, `no side spot far enough out: ${spot.x}`);
  assert.equal(spot.y, 0, "the free row is the gap between the two nodes");
  const rect = { id: "label", x: spot.x - width / 2, y: spot.y - height / 2, width, height };
  // the anchor must end up outside the box, otherwise its own spot was never really refused
  assert.ok(anchor.x < rect.x || anchor.x > rect.x + rect.width || anchor.y < rect.y || anchor.y > rect.y + rect.height,
    "the anchor is still inside the box, so the spot was never refused");
  for (const node of blocking) {
    assert.ok(!overlaps(rect, node), `${node.id}: the label sits on a node`);
    // keep the intersection check: the leader from the anchor to its box crosses no node interior
    const leader = {
      x: Math.min(rect.x + rect.width, Math.max(rect.x, anchor.x)),
      y: Math.min(rect.y + rect.height, Math.max(rect.y, anchor.y)),
    };
    assert.equal(segmentCuts(anchor, leader, node), false, `${node.id}: the leader crosses the node interior`);
  }
});
