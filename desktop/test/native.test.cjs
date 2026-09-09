const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
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
