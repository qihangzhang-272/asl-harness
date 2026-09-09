const { test } = require("node:test");
const assert = require("node:assert/strict");
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
