const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
test("native scopes and custom configuration paths reflect current-user support", async () => {
  const { nativeInventory } = require("../native.cjs");
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "asl-native-scope-"));
  try {
    const custom = path.join(home, "custom-claude");
    await fs.mkdir(custom);
    const report = await nativeInventory(home, { CLAUDE_CONFIG_DIR: custom });
    const claude = report.hosts.find(h => h.id === "claude-code");
    const codex = report.hosts.find(h => h.id === "codex-app");
    assert.deepEqual(claude.scopes, ["project", "user"]);
    assert.equal(claude.skillRoot, path.join(custom, "skills"));
    assert.equal(codex.skillRoot, path.join(home, ".agents", "skills"));
  } finally { await fs.rm(home, { recursive: true, force: true }); }
});
test("native inventory exposes configuration presence, never credentials", async () => {
  const { nativeInventory } = require("../native.cjs");
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "asl-native-test-"));
  try {
    await fs.mkdir(path.join(home, ".claude"));
    await fs.writeFile(
      path.join(home, ".claude.json"),
      JSON.stringify({
        mcpServers: { example: { env: { SECRET: "do-not-return" } } },
        oauthAccount: { token: "hidden" },
      }),
    );
    const data = await nativeInventory(home);
    assert.equal(
      data.hosts.find((h) => h.id === "claude-code").configured,
      true,
    );
    assert.deepEqual(
      data.hosts.find((h) => h.id === "claude-code").connections,
      ["example"],
    );
    assert.ok(!JSON.stringify(data).includes("do-not-return"));
  } finally {
    await fs.rm(home, { recursive: true, force: true });
  }
});
