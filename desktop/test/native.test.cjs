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

test("empty host folders are not reported as configuration and modern WorkBuddy is found", async (t) => {
  const { nativeInventory } = require("../native.cjs");
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "asl-native-real-layout-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  for (const name of [".codex", ".claude", ".workbuddy", ".workbuddy-ai", ".dsh"])
    await fs.mkdir(path.join(home, name));
  await fs.writeFile(path.join(home, ".workbuddy-ai", "settings.json"), "{}");
  await fs.writeFile(path.join(home, ".workbuddy-ai", ".mcp.json"), JSON.stringify({ mcpServers: { search: { token: "private" } } }));
  const preset = path.join(home, ".dsh", ".agent-presets", "writing");
  await fs.mkdir(preset, { recursive: true });
  await fs.writeFile(path.join(preset, "agent.cordis.yml"), "{}");
  const data = await nativeInventory(home, {});
  assert.equal(data.hosts.find(h => h.id === "codex-app").configured, false);
  assert.equal(data.hosts.find(h => h.id === "claude-code").configured, false);
  assert.equal(data.hosts.find(h => h.id === "deepseek-harness").configured, true);
  const buddy = data.hosts.find(h => h.id === "workbuddy");
  assert.equal(buddy.directory, path.join(home, ".workbuddy-ai"));
  assert.equal(buddy.configured, true);
  assert.deepEqual(buddy.connections, ["search"]);
  assert.equal(data.presets[0].path, preset);
  assert.equal(data.presetRoot, path.dirname(preset));
  assert.ok(!JSON.stringify(data).includes("private"));
});

test("folder dialogs use an existing directory, not a deleted test Desktop", async (t) => {
  const { existingDirectory } = require("../native.cjs");
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "asl-dialog-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const file = path.join(home, "file.txt");
  await fs.writeFile(file, "not a directory");
  assert.equal(await existingDirectory([path.join(home, "old-test", "Desktop"), file, home]), home);
  assert.equal(await existingDirectory([path.join(home, "missing")]), undefined);
});
