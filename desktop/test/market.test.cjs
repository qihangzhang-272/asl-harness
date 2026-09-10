const { test } = require("node:test");
const assert = require("node:assert/strict");
const { githubRepository, githubSnapshot } = require("../market.cjs");

test("GitHub import accepts repo and skill links but not arbitrary downloads", () => {
  assert.equal(githubRepository("https://github.com/user/repo.git").repo, "repo");
  assert.deepEqual(githubRepository("https://github.com/user/repo/tree/main/skills/a").tail, ["main", "skills", "a"]);
  for (const value of ["file:///local", "https://github.com@evil.com/u/r", "https://github.com/u/r/issues/1", "https://github.com/u/r?token=secret", "https://github.com/u/r/tree/main/%2e%2e%2fprivate"])
    assert.throws(() => githubRepository(value));
});

test("GitHub snapshot pins content and supports branches containing slashes", async () => {
  const calls = [];
  const sha = "a".repeat(40);
  const result = await githubSnapshot("https://github.com/u/r/tree/feature/writing/skills/a", async url => {
    calls.push(url);
    return { ok: url.endsWith("/feature%2Fwriting"), status: 404, text: async () => JSON.stringify({ sha }) };
  });
  assert.equal(result.subpath, "skills/a");
  assert.equal(result.archive, `https://codeload.github.com/u/r/zip/${sha}`);
  assert.equal(calls.length, 3);
});
test("market entries keep native compatibility and never return executable install text", () => {
  const { parseDshCatalog } = require("../market.cjs");
  const entries = parseDshCatalog({
    plugins: [
      {
        name: "a",
        url: "https://github.com/test/a",
        description: { zh: "插件" },
        npm: "pkg",
        install: "rm -rf ~",
      },
    ],
  });
  assert.equal(entries[0].compatibility, "deepseek-harness");
  assert.equal(entries[0].kind, "plugin");
  assert.ok(!JSON.stringify(entries).includes("rm -rf"));
});
test("catalog rejects links that are not public HTTPS pages", () => {
  const { parseDshCatalog } = require("../market.cjs");
  assert.equal(
    parseDshCatalog({
      plugins: [
        { name: "bad", url: "file:///private", description: { zh: "x" } },
      ],
    }).length,
    0,
  );
});
test("market descriptions remain strings even when upstream metadata changes", () => {
  const { parseDshCatalog } = require("../market.cjs");
  const [entry] = parseDshCatalog({
    plugins: [
      {
        name: "test",
        url: "https://github.com/a/b",
        description: { zh: { text: "changed schema" } },
      },
    ],
  });
  assert.equal(typeof entry.description, "string");
});
