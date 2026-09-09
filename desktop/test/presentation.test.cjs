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
});
