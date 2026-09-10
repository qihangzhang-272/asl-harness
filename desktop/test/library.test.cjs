const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
test("recent locations are references only and invalid saved locations are filtered", async () => {
  const { readPreferences, rememberLibrary, writePreferences } = require("../library.cjs");
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), "asl-library-test-"));
  try {
    const file = path.join(temp, "preferences.json");
    const root = path.resolve(__dirname, "../../examples/personal-environment");
    await rememberLibrary(file, root);
    await rememberLibrary(file, root);
    const data = await readPreferences(file);
    assert.deepEqual(data.libraries, [root]);
    assert.equal(data.lastLibrary, root);
    assert.ok(!JSON.stringify(data).includes("SKILL.md"));
    const target = { project: temp, host: "workbuddy", mode: "creator-studio" };
    await writePreferences(file, { ...data, targets: [target], repositories: ["https://github.com/example/skills"] });
    const restored = await readPreferences(file);
    assert.deepEqual(restored.targets, [target]);
    assert.deepEqual(restored.repositories, ["https://github.com/example/skills"]);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
});
