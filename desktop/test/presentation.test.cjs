const { test } = require("node:test");
const assert = require("node:assert/strict");

test("capability map preserves every skill and only draws declared dependency edges", async () => {
  const { capabilityGroups, graphForMode } =
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
  const graph = graphForMode(mode, skills, new Set(groups.map((g) => g.id)));
  assert.equal(graph.nodes.filter((n) => n.data.kind === "skill").length, 3);
  assert.equal(
    graph.edges.filter((e) => e.data?.kind === "requires").length,
    1,
  );
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
  const { capabilityGroups, graphForMode } = await import("../src/presentation.mjs");
  const skills = [{ id: "writer", title: "写作", requires: [] }, { id: "search", title: "研究", requires: [] }];
  const categories = [{ title: "我的类别", skills: ["writer"] }, { title: "空类别", skills: [] }];
  const groups = capabilityGroups(skills, categories);
  assert.deepEqual(groups.map(g => g.title), ["我的类别", "空类别", "未分类"]);
  assert.deepEqual(capabilityGroups(skills, []).map(g => g.title), ["未分类"]);
  const graph = graphForMode({ id: "m", title: "模式", capabilities: categories }, skills);
  assert.ok(graph.nodes.some(n => n.data.title === "我的类别"));
  assert.ok(!graph.nodes.some(n => n.data.title === "写作与表达"));
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
