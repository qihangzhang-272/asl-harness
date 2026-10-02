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
  const { normalizeArchitecture, placeSkill, assignedScopes } = await model();
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
  const withSharedLayout = {...draft, layout: {shared: {search: {x: 9, y: 9}}}};
  const placed = placeSkill(withSharedLayout, "search", "one");
  assert.deepEqual(assignedScopes(placed, "search"), ["one"]);
  assert.equal(placed.layout.shared, undefined);
  assert.deepEqual(placed.paradigms[0].skills, ["a", "b", "search"]);
});

test("moving to shared leaves every paradigm and clears the stale layout points", async () => {
  const { normalizeArchitecture, placeSkill, assignedScopes } = await model();
  const draft = normalizeArchitecture({...authored(), layout: {one: {a: {x: 1, y: 2}, b: {x: 3, y: 4}}, two: {b: {x: 5, y: 6}}}}, ["search", "a", "b", "c"]);
  const shared = placeSkill(draft, "b", "shared");
  assert.deepEqual(assignedScopes(shared, "b"), ["shared"]);
  assert.deepEqual(shared.layout.one, { a: { x: 1, y: 2 } });
  assert.equal(shared.layout.two, undefined);
  assert.deepEqual(shared.paradigms[0].skills, ["a"]);
  assert.deepEqual(shared.paradigms[0].edges, []);
});

test("condition stops at 160 characters and layout points stay within ±100000", async () => {
  const { LIMITS, finitePoint, normalizeArchitecture, validateDraft } = await model();
  assert.equal(LIMITS.condition, 160);
  assert.deepEqual(finitePoint({ x: 100000, y: -100000 }), { x: 100000, y: -100000 });
  assert.equal(finitePoint({ x: 100001, y: 0 }), null);
  assert.equal(finitePoint({ x: 0, y: -100001 }), null);
  assert.equal(finitePoint({ x: true, y: 0 }), null);
  assert.equal(finitePoint({ x: 0, y: '1' }), null);
  const members = ["search", "a", "b", "c"];
  const draft = normalizeArchitecture(authored(), members);
  const withCondition = condition => ({...draft, paradigms: draft.paradigms.map(p => p.id==='one' ? {...p, edges: [{...p.edges[0],condition}]} : p)});
  const over = withCondition("x".repeat(161));
  assert.match(validateDraft({ draft: over, members }).errors.map(error => error.code).join(","), /edge\.condition/);
  const exact = withCondition("x".repeat(160));
  assert.equal(validateDraft({ draft: exact, members }).ok, true);
});

test("a blank edge condition is absent, matching the core's 1-160 rule", async () => {
  const { normalizeArchitecture, materializeArchitecture, validateDraft } = await model();
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
  const { normalizeArchitecture, removeParadigm, assignedScopes } = await model();
  const draft = normalizeArchitecture({...authored(),layout:{one:{a:{x:1,y:2}}}}, ["search", "a", "b", "c"]);
  const next = removeParadigm(draft, "one");
  assert.deepEqual(next.paradigms.map(p => p.id), ["two"]);
  assert.deepEqual(assignedScopes(next, "a"), []);
  // b lived in both paradigms, so dropping "one" leaves it safely in "two".
  assert.deepEqual(assignedScopes(next, "b"), ["two"]);
  assert.equal(next.nodes.find(node => node.skill === "a").title, "资料");
  assert.equal(next.layout.one, undefined);
});

test("legacy edge validation refuses duplicates, self links and skills outside the paradigm", async () => {
  const { normalizeArchitecture, validateDraft } = await model();
  const members=["search", "a", "b", "c"];
  const draft=normalizeArchitecture(authored(),members);
  for(const [edge,code] of [
    [{from:'a',to:'b',label:'重复'},'edge.duplicate'],
    [{from:'a',to:'a',label:'自环'},'edge.self'],
    [{from:'a',to:'c',label:'越界'},'edge.outside'],
  ]){
    const invalid={...draft,paradigms:[{...draft.paradigms[0],edges:[...draft.paradigms[0].edges,edge]},draft.paradigms[1]]};
    assert.ok(validateDraft({draft:invalid,members}).errors.some(error=>error.code===code));
  }
});

test("saving validates full coverage, meanings and paradigm text", async () => {
  const { validateDraft, normalizeArchitecture, updateParadigm } = await model();
  const members = ["search", "a", "b", "c"];
  const base = { ...authored(), paradigms: [authored().paradigms[0], { id: "two", title: "发布", description: "发布前检查", skills: ["b"], edges: [] }] };
  const draft = normalizeArchitecture(base, members);
  const result = validateDraft({ draft, members });
  assert.equal(result.ok, false);
  assert.deepEqual(result.unassigned, ["c"]);
  assert.match(result.errors.map(error => error.message).join(" "), /1 个技能待归属/);
  const covered = normalizeArchitecture({ ...base, shared: ["search", "c"] }, members);
  assert.equal(validateDraft({ draft: covered, members }).ok, true);
  const unlabeled = {...covered,paradigms:covered.paradigms.map(p=>p.id==='one'?{...p,edges:[{...p.edges[0],label:''}]}:p)};
  assert.equal(validateDraft({ draft: unlabeled, members }).ok, false);
  assert.match(validateDraft({ draft: unlabeled, members }).errors[0].message, /关联都需要含义/);
  const undescribed = updateParadigm(covered, "one", { description: "  " });
  assert.match(validateDraft({ draft: undescribed, members }).errors.map(error => error.code).join(","), /paradigm\.description/);
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
