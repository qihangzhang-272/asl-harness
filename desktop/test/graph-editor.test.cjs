const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

test("the editor keeps its external contract and never edits App.jsx", () => {
  const source = read("ParadigmEditor.jsx");
  assert.match(source, /export function Placement\(/);
  assert.match(source, /export default function ParadigmEditor\(\{[^}]*mode[^}]*skills[^}]*Dialog[^}]*onSave[^}]*onClose/);
  assert.match(source, /<Dialog title=/);
  assert.match(source, /saveRequest\(\{mode, draft, roots\}\)/);
  assert.ok(!source.includes("App.jsx"));
  assert.ok(!source.includes("EnvironmentGuide"));
  assert.ok(!source.includes("useReadTasks"));
  assert.match(source, /import '\.\/graph-editor\.css';/);
});

test("saving still goes through mode.save with fingerprint, document and roots", async () => {
  const { saveRequest } = await import("../src/graph-model.mjs");
  const request = saveRequest({ mode: { id: "m", fingerprint: "fp", document: "doc", roots: ["a"] }, draft: { nodes: [], shared: ["a"], paradigms: [], layout: {} }, roots: ["a"] });
  assert.equal(request.operation, "mode.save");
  assert.equal(request.id, "m");
  assert.equal(request.expected, "fp");
  assert.equal(request.document, "doc");
  assert.deepEqual(request.skills, ["a"]);
  assert.deepEqual(request.architecture.nodes, []);
  assert.deepEqual(request.architecture.shared, ["a"]);
  assert.deepEqual(request.architecture.paradigms, []);
  assert.equal(request.architecture.layout,undefined);
});

test('member edits preserve authored Mermaid and cannot replace its relations with canvas draft edges',async()=>{
  const {saveRequest}=await import('../src/graph-model.mjs');
  const document='# Mode\n\n```mermaid\nflowchart LR\n skill_a --> skill_b\n```\n';
  const original={nodes:[],shared:[],paradigms:[{id:'p',title:'P',description:'经验',skills:['a','b'],edges:[{from:'a',to:'b',label:'原关系'}]}]};
  const draft={...original,paradigms:[{...original.paradigms[0],skills:['a','b','c'],edges:[{from:'b',to:'a',label:'不该保存'}]}],layout:{}};
  const request=saveRequest({mode:{id:'m',fingerprint:'fp',document,architecture:original},draft,roots:['a','b','c']});
  assert.equal(request.document,document);
  assert.deepEqual(request.architecture.paradigms[0].skills,['a','b','c']);
  assert.deepEqual(request.architecture.paradigms[0].edges,original.paradigms[0].edges);
});

test("the editor awaits local installs, drags sources and keeps every scope", () => {
  const source = read("ParadigmEditor.jsx");
  assert.match(source, /await onLocalSkillAdded\(/);
  assert.match(source, /installCandidates/);
  assert.match(source, /mergeInventory/);
  assert.match(source, /sourceKey/);
  assert.match(source, /application\/x-asl-skill-source/);
  assert.match(source, /assignedScopes/);
  assert.match(source, /scopeIncludes/);
  assert.match(source, /memberIds\(roots, available\)/);
  assert.match(source, /rootIds\(mode\)/);
  assert.ok(!/assignedScope\(/.test(source), "must not use the single-scope helper anymore");
});

test("narrow windows keep a scrollable skill rail and leave room for direct editing", () => {
  const sheets = ["graph-editor.css", "mode-workspace.css", "guide.css", "product.css", "mcp.css"];
  const declared = new Set([...fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8").matchAll(/--([a-z0-9-]+)\s*:/g)].map(match => match[1]));
  for (const name of sheets) {
    const css = read(name);
    // One token set: a sheet may only reference tokens the root sheet already declares, and it
    // tints from the same brand family instead of inventing a second accent colour.
    for (const [, token] of css.matchAll(/var\(--([a-z0-9-]+)/g)) {
      assert.ok(declared.has(token), `${name} invents --${token} instead of using the shared tokens`);
    }
    assert.match(css, /var\(--brand/, `${name} must tint from the shared brand tokens`);
  }
  // The rail is the only place a skill is added to the canvas, so no breakpoint may hide a pane.
  const editor = read("graph-editor.css");
  assert.doesNotMatch(editor, /\.graph-pane[^{]*\{[^}]*display:\s*none/);
  const narrow = (editor.match(/@media \(max-width: 1000px\) \{([\s\S]*?)\n\}/) || [])[1] || "";
  const rails = narrow.match(/(\d+)px minmax\(0, 1fr\)/);
  assert.ok(rails, "the 900px-class breakpoint keeps the rail and a shrinkable canvas");
  const canvas = 900 - 48 - Number(rails[1]) - 8;
  assert.ok(canvas >= 500, `the skill rail leaves the canvas only ${canvas}px at 900px`);
  const source = read("ParadigmEditor.jsx");
  assert.match(source, /className="graph-pane graph-pane-skills" aria-label="技能清单"/);
  assert.match(source, /aria-label=\{`加入 \$\{skill\.title \|\| skill\.id\}`\}/);
  // The 168px rail cuts a nowrap title down to a few characters, so the name wraps to two lines
  // and keeps the full name on hover instead of widening the rail into the canvas.
  const title = (editor.match(/\.graph-skill-text strong \{([^}]*)\}/) || [])[1] || "";
  assert.match(title, /-webkit-line-clamp: 2/);
  assert.match(title, /overflow-wrap: anywhere/);
  assert.doesNotMatch(title, /white-space: nowrap/);
  assert.match(source, /title=\{row\.note \|\| row\.title\}/);
  for (const name of ["graph-editor.css", "mode-workspace.css", "guide.css", "product.css"]) {
    assert.match(read(name), /@media \(prefers-reduced-motion: reduce\)/, `${name} must go quiet when motion is reduced`);
  }
});
