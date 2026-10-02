const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

test("ModeWorkspace keeps the node editor contract and owns name, Markdown and discovery", () => {
  const source = read("ModeWorkspace.jsx");
  assert.match(source, /<ParadigmEditor/);
  for (const contract of [
    "mode={currentMode}",
    "skills={librarySkills}",
    "localSkills={candidates}",
    "onLocalSkillAdded={addLocalSkill}",
    "Field={Field}",
    "onSave={handleSave}",
    "onClose={requestClose}",
    "Dialog={WorkspaceFrame}",
  ]) assert.ok(source.includes(contract), `missing ${contract}`);
  assert.match(source, /readModeDocument\(mode\?\.document\)/);
  assert.match(source, /modeDocument\(name, body\)/);
  assert.match(source, /read\('mode-workspace-local'/);
  assert.match(source, /api\('choose', 'skillSearchRoot'\)/);
  assert.match(source, /candidateImportRequest\(entry, existing\)/);
  assert.match(source, /api\('run', 'catalog'/);
  assert.match(source, /onCatalog\?\.\(next\)/);
  assert.ok(!source.includes("window.location.reload"), "an import must not reload the window");
  assert.ok(!source.includes("App.jsx"));
  assert.match(source, /import '\.\/mode-workspace\.css';/);
});

test("App routes new and existing Modes through the workspace and keeps two Mode views", () => {
  const app = read("App.jsx");
  assert.match(app, /import ModeWorkspace from '\.\/ModeWorkspace\.jsx';/);
  assert.match(app, /kind === "mode-workspace"/);
  assert.match(app, /kind: "mode-workspace"/);
  assert.match(app, /kind:'mode-workspace'/);
  assert.ok(app.includes("['mode-workspace','diagram-editor','skill-editor'"));
  assert.match(app, /Dialog=\{EditorPage\}/);
  assert.match(app, /onCatalog=\{next => setCatalog\(next\)\}/);
  assert.match(app, /createModeWithSkill/);
  assert.match(app, /新建模式并使用此技能/);
  assert.ok(app.includes('["map", "逻辑架构", Network]'));
  assert.ok(app.includes('["list", "技能", List]'));
  assert.ok(!app.includes('"技能分类"'), "the category tab is merged into the grouped skill list");
  assert.ok(!app.includes('"技能列表"'), "the list tab is merged into the grouped skill list");
  assert.ok(!app.includes("ModeSkills"), "the duplicate skill-management page is gone");
  assert.ok(!app.includes("CategoryEditor"), "categories are kept as data, not a second entry");
  assert.match(app, /if\(request\.operation === "mode\.save" && request\.id\) showMode\(request\.id\)/);
  // The local-mode list stays on the discover page only, and the sources page leaves one way in.
  assert.match(app, /provider==='local-modes'&&<LocalModes/);
  assert.ok(!app.includes("连接符合 ASL 协议的 GitHub 仓库后"), "the empty sources page keeps only its action");
  assert.equal((app.match(/aria-label="连接云端仓库"/g) || []).length, 1, "one connect entry on the sources page");
});

test("workspace styles stay scoped to the workspace", () => {
  const css = read("mode-workspace.css").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const line of css.split("\n")) {
    if (!line.includes("{")) continue;
    const selector = line.slice(0, line.indexOf("{")).trim();
    assert.ok(/^\.mode-workspace/.test(selector) || selector.startsWith("@"), `unscoped selector: ${selector}`);
  }
  // :has() reached outside the workspace and was removed; keep it out.
  assert.ok(!css.includes(":has("), "mode-workspace.css must not use :has()");
});

test("a new Mode folder uses the core rule and explains an invalid or empty name", () => {
  const source = read("ModeWorkspace.jsx");
  // Same rule as workspace.SAFE_ID, not the narrower skill/paradigm id rule.
  assert.match(source, /const MODE_FOLDER = '\[A-Za-z0-9\]\[A-Za-z0-9\._-\]\*'/);
  assert.match(source, /const idValid = MODE_FOLDER_VALID\.test\(id\)/);
  assert.match(source, /metadataValid=\{[^}]*idValid/);
  assert.ok(!source.includes("[a-z0-9][a-z0-9-]{0,79}"), "the Mode folder must not reuse the paradigm id rule");
  assert.match(source, /pattern=\{MODE_FOLDER\}/);
  // An invalid or empty folder name is a visible hint, not a silently disabled save.
  assert.match(source, /isNew && !idValid[\s\S]*role="alert"/);
  assert.match(source, /文件夹名需以字母或数字开头/);
});

test("candidate dedup uses the real package source, not just the skill id", async () => {
  const { localSkillCandidates, sourceKey } = await import("../src/presentation.mjs");
  assert.equal(sourceKey("C:\\skills\\writer"), sourceKey("file:///C:/skills/writer"));
  const library = [{ id: "writer", title: "写作", fingerprint: "fp1", source: "file:///C:/skills/writer" }];
  const candidates = localSkillCandidates(library, [
    { id: "writer", title: "写作", source: "C:\\skills\\writer" },
    { id: "writer", title: "写作 v2", source: "D:\\other\\writer-v2" },
    { id: "writer", title: "写作", source: "C:/skills/writer" },
  ]);
  // The same folder found twice is one row; a second folder keeps its own source choice.
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].state, "installed");
  assert.equal(candidates[1].state, "reuse");
  assert.notEqual(candidates[0].sourceKey, candidates[1].sourceKey);
  assert.equal(candidates[0].id, "writer");
  assert.equal(candidates[1].id, "writer");
  // Same id from two folders stays distinguishable in the install list.
  assert.match(candidates[1].title, /writer-v2/);
});

test("a same-name library version is reused instead of silently overwritten", async () => {
  const { candidateImportRequest } = await import("../src/presentation.mjs");
  assert.equal(candidateImportRequest({ id: "writer", source: "D:\\other\\writer" }, { id: "writer" }), null);
  assert.equal(candidateImportRequest({ id: "writer", source: "" }, null), null);
  assert.deepEqual(
    candidateImportRequest({ id: "new-skill", source: "D:\\other\\new-skill", origin: "https://github.com/a/b" }, null),
    { operation: "skill.import", id: "new-skill", source: "D:\\other\\new-skill", sourceOrigin: "https://github.com/a/b" },
  );
});

test("filterArchitecture keeps pruned layout and the v0.4 edge fields", async () => {
  const { filterArchitecture } = await import("../src/presentation.mjs");
  const architecture = {
    nodes: [],
    shared: ["s"],
    paradigms: [{ id: "one", title: "One", description: "d", skills: ["a", "b", "c"], edges: [
      { from: "a", to: "b", label: "往来", condition: "需要复核时", sourceHandle: "right", targetHandle: "left", junk: 1 },
      { from: "b", to: "c", label: "越界" },
    ] }],
    layout: { shared: { s: { x: 1, y: 2 } }, one: { a: { x: 3, y: 4 }, b: { x: 5, y: 6 }, c: { x: 9, y: 9 } }, gone: { a: { x: 1, y: 1 } } },
  };
  const pruned = filterArchitecture(architecture, new Set(["s", "a", "b"]));
  assert.deepEqual(pruned.paradigms[0].edges, [{ from: "a", to: "b", label: "往来", condition: "需要复核时", sourceHandle: "right", targetHandle: "left" }]);
  assert.deepEqual(pruned.layout, { shared: { s: { x: 1, y: 2 } }, one: { a: { x: 3, y: 4 }, b: { x: 5, y: 6 } } });
  assert.equal(architecture.paradigms[0].edges[0].condition, "需要复核时", "the source architecture is untouched");
  const legacy = filterArchitecture({ nodes: [], edges: [{ from: "a", to: "b" }], layout: { shared: { a: { x: 1, y: 1 } } } }, new Set(["a"]));
  assert.deepEqual(legacy, { nodes: [], edges: [] });
});

test("restoreView collapses legacy category and list views into one skill view", async () => {
  const { restoreView } = await import("../src/presentation.mjs");
  const catalog = { modes: [{ id: "m", skills: ["a"] }], skills: [{ id: "a" }] };
  assert.equal(restoreView(catalog, { mode: "m", view: "categories" }).view, "list");
  assert.equal(restoreView(catalog, { mode: "m", view: "list" }).view, "list");
  assert.equal(restoreView(catalog, { mode: "m", view: "skills" }).view, "list");
  assert.equal(restoreView(catalog, { mode: "m", view: "map" }).view, "map");
  assert.equal(restoreView(catalog, { mode: "m" }).view, "map");
});

test("the Mode document round-trips the name and the Markdown body", async () => {
  const { modeDocument, readModeDocument } = await import("../src/presentation.mjs");
  const document = modeDocument("内容创作", "先研究，再成稿。\n\n- 交付可检查");
  assert.match(document, /^# 内容创作\n\n先研究/);
  assert.deepEqual(readModeDocument(document), { name: "内容创作", body: "先研究，再成稿。\n\n- 交付可检查" });
  assert.deepEqual(readModeDocument(""), { name: "", body: "" });
});

test("the fixed shell does not cross-fade while the content keeps its short transition", () => {
  const css = read("product.css").replace(/\/\*[\s\S]*?\*\//g, "");
  // The root snapshot is the top bar and sidebar: it switches instantly instead of cross-fading.
  assert.match(css, /::view-transition-old\(root\)\s*\{\s*display:\s*none;?\s*\}/);
  assert.match(css, /::view-transition-new\(root\)\s*\{\s*animation:\s*none;?\s*\}/);
  // The content area keeps its 100/180ms transition and the overlay stays click-through.
  assert.match(css, /::view-transition-old\(asl-content\)\s*\{\s*animation-duration:\s*100ms;?\s*\}/);
  assert.match(css, /::view-transition-new\(asl-content\)\s*\{\s*animation-duration:\s*180ms;?\s*\}/);
  assert.match(css, /::view-transition\s*\{\s*pointer-events:\s*none;?\s*\}/);
  assert.ok(!/::view-transition\s*\{[^}]*animation:\s*none/.test(css), "only the root is disabled, not the content motion");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});
