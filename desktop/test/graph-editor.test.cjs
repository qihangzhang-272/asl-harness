const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (name) => fs.readFileSync(path.join(__dirname, "..", "src", name), "utf8");

test('metadata-only edits save and library drags add a root; reading uses native Mermaid',()=>{
  const editor=read('ParadigmEditor.jsx');
  assert.match(editor,/metadataDirty \|\| !sameState/);
  assert.match(editor,/!members.includes\(skillId\).*addRootAt\(skillId, position\)/);
  assert.match(editor,/onRemoveNode=\{removeNode\}/);
  const viewer=read('Architecture.jsx');
  assert.match(viewer,/diagramForMode\(mode,skills,scopeId\)/);
  assert.match(viewer,/<MermaidView/);
  assert.doesNotMatch(viewer,/<GraphCanvas/);
});

test("the editor keeps its external contract and never edits App.jsx", () => {
  const source = read("ParadigmEditor.jsx");
  assert.match(source, /export function Placement\(/);
  assert.match(source, /export default function ParadigmEditor\(\{[^}]*mode[^}]*skills[^}]*Dialog[^}]*Field[^}]*onSave[^}]*onClose/);
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
  assert.ok(Number.isFinite(request.architecture.layout.shared.a.x));
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

test("the canvas uses loose magnetic points on all four sides and clickable edge labels", () => {
  const canvas = read("GraphCanvas.jsx");
  assert.match(canvas, /ConnectionMode\.Loose/);
  assert.match(canvas, /const HANDLE_POSITION = \{top: Position\.Top, right: Position\.Right, bottom: Position\.Bottom, left: Position\.Left\}/);
  assert.match(canvas, /HANDLES\.map\(\(side\)/);
  assert.match(canvas, /EdgeLabelRenderer/);
  assert.match(canvas, /graph-edge-label/);
  assert.match(canvas, /onDoubleClick/);
  assert.match(canvas, /zoomOnDoubleClick=\{false\}/);
  assert.match(canvas, /deleteKeyCode=\{null\}/);
  assert.match(canvas, /hideAttribution: true/);
  assert.match(canvas, /useReducedMotion|reducedMotion/);
  assert.match(canvas, /screenToFlowPosition/);
});

test("editor styles stay scoped to the editor and the declared dependencies are exact", () => {
  const css = read("graph-editor.css").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const line of css.split("\n")) {
    if (!line.includes("{")) continue;
    const selector = line.slice(0, line.indexOf("{")).trim();
    assert.ok(/^\.graph[-.]/.test(selector) || selector.startsWith("@"), `unscoped selector: ${selector}`);
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf8"));
  assert.equal(manifest.dependencies["@xyflow/react"], "12.12.0");
  assert.equal(manifest.dependencies["@dagrejs/dagre"], "3.1.1");
});

test("editing lives on existing canvas objects and has no endpoint inspector", () => {
  const editor=read('ParadigmEditor.jsx'),canvas=read('GraphCanvas.jsx');
  assert.doesNotMatch(editor,/function Inspector|关联起点方向|关联终点方向/);
  assert.match(canvas, /<NodeToolbar isVisible=\{selected && !actions\?\.readOnly\}/);
  assert.match(canvas, /selected && !actions\?\.readOnly \? <div/);
  assert.match(canvas, /onNodeContextMenu/);
  assert.match(canvas, /onEdgeContextMenu/);
  assert.match(canvas, /role="menuitem"/);
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

test("conditions get their own canvas badge and drops carry the install source", () => {
  const canvas = read("GraphCanvas.jsx");
  assert.match(canvas, /data\?\.condition/);
  assert.match(canvas, /graph-edge-condition/);
  assert.match(canvas, /application\/x-asl-skill-source/);
  const css = read("graph-editor.css");
  assert.match(css, /\.graph-edge-condition/);
  assert.match(css, /\.graph-skill\.is-conflict/);
});

test("edge meanings wrap and paint above the nodes instead of hiding behind them", () => {
  const canvas = read("GraphCanvas.jsx");
  assert.match(canvas, /useViewport/);
  assert.match(canvas, /scale\(\$\{scale\}\)/);
  const css = read("graph-editor.css");
  assert.match(css, /\.graph-canvas \.react-flow__edgelabel-renderer \{ z-index: 1; \}/);
  assert.match(css, /\.graph-edge-label \{[^}]*overflow-wrap: anywhere/);
  assert.doesNotMatch(css, /\.graph-edge-label \{[^}]*white-space: nowrap/);
});

test("the canvas asks the model where every label goes instead of guessing a width", () => {
  const canvas = read("GraphCanvas.jsx");
  assert.match(canvas, /placeLabels\(\{nodes: displayedNodes, edges, zoom\}\)/);
  assert.match(canvas, /offset: EDGE_OFFSET/);
  assert.match(canvas, /edges=\{displayEdges\}/);
  assert.match(canvas, /maxWidth: at \? at\.width : LABEL\.max/);
});

test("a moved meaning keeps a leader to its anchor and exposes the edge it belongs to", () => {
  const canvas = read("GraphCanvas.jsx");
  assert.match(canvas, /borderRadius: EDGE_RADIUS/);
  assert.match(canvas, /className="graph-edge-leader" data-edge-id=\{id\}/);
  assert.match(canvas, /graph-edge-leader-line/);
  assert.match(canvas, /graph-edge-leader-dot/);
  const ids = canvas.match(/data-edge-id=\{id\}/g) || [];
  assert.ok(ids.length >= 2, "both the label and its leader must carry data-edge-id");
  assert.doesNotMatch(canvas, /routePath|placeOnRoute/);
  const css = read("graph-editor.css");
  assert.match(css, /\.graph-edge-leader \{/);
  assert.match(css, /\.graph-edge-leader-line \{/);
  assert.match(css, /\.graph-edge-leader-dot \{/);
});

test("canvas type stays readable at the zooms people actually work at", async () => {
  const { TEXT, labelScale } = await import("../src/graph-model.mjs");
  const css = read("graph-editor.css");
  // the sheet and the placement model must declare the same type scale, or labels get sized wrong
  assert.match(css, new RegExp(`\\.graph-node-text strong \\{[^}]*font-size: ${TEXT.node}px`));
  assert.match(css, new RegExp(`\\.graph-node-text small \\{[^}]*font-size: ${TEXT.note}px`));
  assert.match(css, new RegExp(`\\.graph-edge-label \\{[^}]*font-size: ${TEXT.edge}px`));
  assert.match(css, new RegExp(`\\.graph-edge-condition \\{[^}]*font-size: ${TEXT.condition}px`));
  // node text scales with the diagram, so it sets the floor for how far fitView may zoom out
  for (const zoom of [0.7, 0.85, 1, 1.4]) {
    assert.ok(TEXT.node * zoom >= 9.8 - 1e-9, `node title falls under reading size at zoom ${zoom}`);
  }
  // edge text is held at its reading size until the 1.5x ceiling
  for (const zoom of [0.7, 0.85, 1]) {
    assert.ok(Math.abs(TEXT.edge * zoom * labelScale(zoom) - TEXT.edge) < 1e-9, `edge label drifts at zoom ${zoom}`);
  }
  assert.equal(labelScale(0.1), 1.5);
  assert.equal(labelScale(2), 1);
});

test("the label box is the sheet's border-box label: padding and border live inside the 224px cap", async () => {
  const { LABEL, labelBox } = await import("../src/graph-model.mjs");
  const css = read("graph-editor.css");
  const rule = (css.match(/\.graph-edge-label \{([^}]*)\}/) || [])[1] || "";
  const padding = rule.match(/padding:\s*(\d+(?:\.\d+)?)px\s+(\d+(?:\.\d+)?)px/);
  const border = rule.match(/border:\s*(\d+(?:\.\d+)?)px/);
  assert.ok(padding && border, "the sheet keeps an explicit padding and border on the label");
  assert.equal(LABEL.padX, Number(padding[2]));
  assert.equal(LABEL.padY, Number(padding[1]));
  assert.equal(LABEL.border, Number(border[1]));
  // `* { box-sizing: border-box }` makes max-width cover both, so the model has to cover them too
  const box = labelBox("交付整理结果", "资料已经核实");
  assert.ok(box.width <= LABEL.max, `label box ${box.width}px overflows the ${LABEL.max}px cap`);
  assert.ok(box.width - (LABEL.padX + LABEL.border) * 2 >= 20, "the text still gets real room");
});

test("a moved meaning's leader keeps a paintable viewport that never takes a click", () => {
  const css = read("graph-editor.css");
  const rule = (css.match(/\.graph-edge-leader \{([^}]*)\}/) || [])[1] || "";
  const width = rule.match(/width:\s*(\d+(?:\.\d+)?)px/);
  const height = rule.match(/height:\s*(\d+(?:\.\d+)?)px/);
  assert.ok(width && height, "the leader declares its own viewport");
  assert.ok(Number(width[1]) > 0 && Number(height[1]) > 0,
    "a zero-sized SVG viewport paints nothing, overflow: visible or not");
  assert.match(rule, /overflow: visible/);
  assert.match(rule, /pointer-events: none/);
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
