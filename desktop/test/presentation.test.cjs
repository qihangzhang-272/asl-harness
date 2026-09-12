const { test } = require("node:test");
const assert = require("node:assert/strict");
test('restoration validates mode and skill against the selected local environment',async()=>{
  const {restoreView}=await import('../src/presentation.mjs');
  const catalog={modes:[{id:'research',skills:['lookup']},{id:'writing',skills:['draft']}],skills:[{id:'lookup'},{id:'draft'}]};
  assert.deepEqual(restoreView(catalog,{mode:'writing',page:'skills',view:'list',skill:'draft',query:'中文'}),
    {mode:'writing',page:'skills',view:'list',skill:'draft',query:'中文',provider:'github-import',githubUrl:''});
  const stale=restoreView(catalog,{mode:'deleted',page:'modes',skill:'draft'});
  assert.equal(stale.mode,'research');
  assert.equal(stale.skill,'');
});

test('each actual skill is exactly one node and only authored links are shown', async () => {
  const { capabilityGroups, diagramForMode } = await import('../src/presentation.mjs');
  const skills = [{ id: 'a', title: 'A', requires: [] }, { id: 'b', title: 'B', requires: ['a'] }];
  const mode = { id: 'm', title: '工作', capabilities: [{ title: '资料', skills: ['a', 'b'], icon: '🧠', color: '#123456' }],
    architecture: { nodes: [{skill:'a',title:'资料积累'}], edges:[{from:'a',to:'b',label:'参考'}] } };
  const groups = capabilityGroups(skills, mode.capabilities);
  assert.equal(groups[0].icon, '🧠');
  assert.equal(groups[0].color, '#123456');
  const graph = diagramForMode(mode, skills);
  assert.deepEqual(graph.nodes.map(n=>n.id), ['a','b']);
  assert.ok(graph.nodes.every(n=>n.id===n.data.skill.id));
  assert.equal(graph.nodes[0].data.title, '资料积累');
  assert.deepEqual(graph.edges.map(e=>[e.source,e.target,e.label]), [['a','b','参考']]);
  assert.match(graph.source, /n0 -->\|"参考"\| n1/);
  assert.equal((graph.source.match(/n\d+\["/g)||[]).length,2);
  const plain = diagramForMode({id:'m'}, skills);
  assert.equal(plain.nodes.length, 2);
  assert.equal(plain.edges.length, 0);
  assert.match(plain.source,/^block-beta\ncolumns 2/);
  assert.ok(diagramForMode({},[{id:'a',title:'M&A'}]).source.includes('M&A'));
});

test("skill categories retain inventory but never fabricate an architecture", async () => {
  const { capabilityGroups, diagramForMode, filterArchitecture } =
    await import("../src/presentation.mjs");
  const skills = [
    { id: "a", title: "资料检索", description: "研究资料", requires: [] },
    { id: "b", title: "配图", description: "生成插画", requires: ["a"] },
    { id: "c", title: "未知技能", description: "custom", requires: [] },
  ];
  const mode = { id: "mode", title: "创作", skills: ["a", "b", "c"] };
  const groups = capabilityGroups(skills);
  assert.deepEqual(groups.flatMap((g) => g.skills.map((s) => s.id)).sort(), [
    "a",
    "b",
    "c",
  ]);
  assert.equal(diagramForMode(mode, skills).edges.length, 0);
  const architecture = {nodes:[{skill:'a',title:'资料'},{skill:'b'}],edges:[{from:'a',to:'b'}]};
  assert.deepEqual(filterArchitecture(architecture,new Set(['a'])),{nodes:[{skill:'a',title:'资料'}],edges:[]});
  assert.equal(architecture.nodes.length,2);
});

test('Mermaid receives branches, merges and cycles without executable user syntax', async () => {
  const {diagramForMode}=await import('../src/presentation.mjs');
  const skills='abcd'.split('').map(id=>({id,title:id}));
  skills[0].title='"]\nclick n1 "https://evil"\n<script>';
  const edges=[{from:'a',to:'b'},{from:'a',to:'c'},{from:'b',to:'d'},{from:'c',to:'d'},{from:'d',to:'a'}];
  const diagram=diagramForMode({architecture:{edges}},skills);
  assert.equal(diagram.nodes.length,4);assert.equal(diagram.edges.length,5);
  assert.equal(diagram.source.split('\n').length,10);
  assert.ok(!diagram.source.includes('<script>'));
  assert.ok(!diagram.source.includes('\nclick'));
  assert.ok(!diagram.source.includes('style '));
});

test("scope labels never confuse current user with a selected project", async () => {
  const { scopeLabel } = await import("../src/presentation.mjs");
  assert.equal(scopeLabel("project", "我的文章"), "仅项目 · 我的文章");
  assert.equal(scopeLabel("user"), "我的所有项目");
  assert.equal(scopeLabel("preset", "创作"), "仅预设 · 创作");
});
test("names take precedence over incidental description words when grouping", async () => {
  const { capabilityGroups } = await import("../src/presentation.mjs");
  const groups = capabilityGroups([
    {
      id: "topic-research-deposition",
      title: "Topic Research",
      description: "研究公众号发布、视觉表达和排版资料",
      requires: [],
    },
  ]);
  assert.equal(groups[0].id, "research");
});

test("skill format errors explain what to fix without hiding other errors", async () => {
  const { errorText } = await import("../src/presentation.mjs");
  assert.equal(
    errorText("Skill product-analysis has invalid frontmatter"),
    "技能开头的名称和说明格式不完整，请保留原文顶部的 --- 信息区。",
  );
  assert.equal(errorText("文件已被修改，请刷新"), "文件已被修改，请刷新");
  assert.match(errorText("Skill qa-skill must declare matching name and description"), /请保留技能顶部的 name/);
});

test("manual categories override suggestions and deletion leaves unclassified skills", async () => {
  const { capabilityGroups, diagramForMode } = await import("../src/presentation.mjs");
  const skills = [{ id: "writer", title: "写作", requires: [] }, { id: "search", title: "研究", requires: [] }];
  const categories = [{ title: "我的类别", skills: ["writer"] }, { title: "空类别", skills: [] }];
  const groups = capabilityGroups(skills, categories);
  assert.deepEqual(groups.map(g => g.title), ["我的类别", "空类别", "未分类"]);
  assert.deepEqual(capabilityGroups(skills, []).map(g => g.title), ["未分类"]);
  assert.equal(diagramForMode({ id: "m", title: "模式", capabilities: categories }, skills).edges.length, 0);
});

test("adding a discovered skill to another Mode reuses the local version unless replacement is explicit", async () => {
  const { adoptionRequest } = await import("../src/presentation.mjs");
  const catalog = {
    skills: [{ id: "writer", fingerprint: "local-edits" }],
    modes: [{ id: "work", fingerprint: "mode-version", document: "# 工作", roots: ["search"],
      capabilities: [{ title: "写作", skills: [] }] }],
  };
  const form = { id: "writer", mode: "work", source: "/download/writer", origin: "https://github.com/example/repo", category: "写作", useExisting: true };
  assert.deepEqual(adoptionRequest(form, catalog), {
    operation: "mode.save", id: "work", expected: "mode-version", document: "# 工作",
    skills: ["search", "writer"], capabilities: [{ title: "写作", skills: ["writer"] }],
  });
  assert.throws(() => adoptionRequest({ ...form, mode: "" }, catalog), /选择.*Mode/);
  assert.deepEqual(adoptionRequest({ ...form, useExisting: false }, catalog), {
    operation: "skill.import", source: form.source, id: "writer", mode: "work",
    sourceOrigin: form.origin, category: "写作", expected: "local-edits",
  });
  const fresh = adoptionRequest({ ...form, id: "new-skill", useExisting: false,
    inspection: { status: "needs-review", reasons: ["含配套脚本"] } }, catalog);
  assert.equal(fresh.operation, "skill.import");
  assert.equal(fresh.mode, "work");
  assert.ok(!("expected" in fresh));
  assert.deepEqual(catalog.modes[0].capabilities[0].skills, []);
});
