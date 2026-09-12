const test = require("node:test");
const assert = require("node:assert/strict");
const { commandArgs, runCore } = require("../bridge.cjs");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

test('complete file preview and Agent guide use the same read-only core', async () => {
  const root = path.resolve(__dirname, '../..'), workspace = path.join(root, 'examples/personal-environment');
  const data = await runCore('catalog', {workspace}, {root});
  const files = await runCore('files', {workspace, skill: data.skills[0].id, file: 'SKILL.md'}, {root});
  assert.ok(files.files.some(f => f.path === 'SKILL.md' && f.editable));
  assert.ok(files.document.includes('description:'));
  const guide = await runCore('guide', {workspace, mode: data.modes[0].id}, {root});
  assert.ok(guide.document.includes('mode.yaml'));
  assert.ok(guide.document.includes('不要求操作步骤'));
  assert.ok(guide.document.includes('spec.architecture'));
  await assert.rejects(() => runCore('files', {workspace, skill: data.skills[0].id, file: '../PROFILE.md'}, {root}));
});
test("WorkBuddy project apply and local scans are explicit actions", () => {
  assert.ok(commandArgs("project", { workspace: "库", mode: "creator", project: "项目", host: "workbuddy" }).includes("workbuddy"));
  assert.throws(() => commandArgs("userSync", { workspace: "库", mode: "creator", host: "workbuddy" }));
  assert.deepEqual(commandArgs("scan", { source: ["C:/skills", "C:/其他"] }), ["skill.scan", "--source", "C:/skills", "--source", "C:/其他"]);
  assert.throws(() => commandArgs("scan", { source: [] }));
});

test("user sync has an explicit scope and defaults to a read-only preview", () => {
  assert.deepEqual(commandArgs("userSync", { workspace: "/library", mode: "writing", host: "claude-code" }),
    ["host.user.sync", "--workspace", "/library", "--mode", "writing", "--host-id", "claude-code", "--check"]);
  assert.throws(() => commandArgs("userSync", { workspace: "/library", mode: "writing", host: "claude-code", home: "/elsewhere" }));
  assert.throws(() => commandArgs("userSync", { workspace: "/library", mode: "writing", host: "deepseek-harness" }));
});

test("readiness rejects ambiguous scope and reports original setup material", async () => {
  const root = path.resolve(__dirname, "../..");
  const workspace = path.join(root, "examples/personal-environment");
  assert.throws(() => commandArgs("readiness", { workspace, mode: "creator-studio", host: "codex-app", scope: "project" }));
  assert.throws(() => commandArgs("readiness", { workspace, mode: "creator-studio", host: "codex-app", scope: "machine" }));
  const report = await runCore("readiness", { workspace, mode: "creator-studio", host: "codex-app", scope: "user" }, { root });
  assert.ok(report.brief.includes("MODE.md"));
  assert.ok(Array.isArray(report.checks));
});

test("a selected user skill folder stays a literal path and requires native association", async () => {
  const root = path.resolve(__dirname, "../..");
  const workspace = path.join(root, "examples/personal-environment");
  const skillsDir = path.join(root, "custom skills");
  const values = { workspace, mode: "creator-studio", host: "claude-code", skillsDir };
  assert.deepEqual(commandArgs("userSync", values).slice(-3), ["--skills-dir", skillsDir, "--check"]);
  assert.throws(() => commandArgs("userSync", { ...values, skillsDir: false }));
  const report = await runCore("readiness", { ...values, scope: "user" }, { root });
  assert.equal(report.chosenSkillsDirectory, skillsDir);
  assert.equal(report.nativeDiscoveryUnverified, true);
  assert.ok(report.brief.includes(JSON.stringify(skillsDir)));
});

test("user-level desktop synchronization and Mode switching work in an isolated home", async (t) => {
  const root = path.resolve(__dirname, "../..");
  const home = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "asl-home-test-")));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const options = { root, env: { USERPROFILE: home, HOME: home, CODEX_HOME: path.join(home, ".codex"), CLAUDE_CONFIG_DIR: path.join(home, ".claude") } };
  const workspace = path.join(root, "examples/personal-environment");
  const args = { workspace, mode: "creator-studio", host: "claude-code" };
  const preview = await runCore("userSync", args, options);
  assert.equal(preview.paths.skills, path.join(home, ".claude", "skills"));
  await runCore("userSync", { ...args, apply: true, expected: preview.fingerprint }, options);
  assert.ok((await fs.readFile(path.join(home, ".claude", "CLAUDE.md"), "utf8")).includes("creator-studio"));
  const removal = await runCore("userSync", { ...args, remove: true }, options);
  await runCore("userSync", { ...args, remove: true, apply: true, expected: removal.fingerprint }, options);
  assert.equal((await fs.readdir(path.join(home, ".claude", "skills"))).length, 0);
});

test("content edits use stdin, default to preview, and reject arbitrary payloads", () => {
  assert.deepEqual(
    commandArgs("edit", {
      workspace: "/library",
      request: { operation: "mode.save", id: "test" },
    }),
    ["environment.edit", "--workspace", "/library", "--check"],
  );
  assert.throws(() =>
    commandArgs("edit", { workspace: "/library", request: "not an object" }),
  );
});

test("catalog exposes titles and complete source membership", async () => {
  const root = path.resolve(__dirname, "../..");
  const report = await runCore(
    "catalog",
    { workspace: path.join(root, "examples/personal-environment") },
    { root },
  );
  assert.ok(report.modes[0].title);
  assert.ok(report.modes[0].roots);
  assert.ok(report.skills[0].fingerprint);
});

test("exports preserve literal paths and default to preview", () => {
  assert.deepEqual(
    commandArgs("export", {
      workspace: "C:/My Files",
      mode: "writing",
      output: "C:/shared.zip",
    }),
    [
      "mode.export",
      "--workspace",
      "C:/My Files",
      "--mode",
      "writing",
      "--output",
      "C:/shared.zip",
      "--check",
    ],
  );
});

test("does not expose arbitrary shell commands or unknown options", () => {
  assert.throws(() => commandArgs("shell", { command: "whoami" }));
  assert.throws(() =>
    commandArgs("export", {
      workspace: "x",
      mode: "y",
      output: "z",
      command: "whoami",
    }),
  );
  assert.throws(() =>
    commandArgs("project", {
      workspace: "x",
      mode: "y",
      project: "z",
      host: "unknown",
    }),
  );
  assert.throws(() =>
    commandArgs("import", { source: "x", target: "y", apply: "false" }),
  );
});

test("replacement is explicit and only exposed for import", () => {
  assert.deepEqual(
    commandArgs("import", {
      source: "/source.zip",
      target: "/target",
      replace: true,
      apply: true,
    }),
    [
      "mode.import",
      "--source",
      "/source.zip",
      "--target",
      "/target",
      "--replace",
    ],
  );
});

test("desktop reads the actual Python core, not a mock catalog", async () => {
  const root = path.resolve(__dirname, "../..");
  const report = await runCore(
    "describe",
    { workspace: path.join(root, "examples/personal-environment") },
    { root },
  );
  assert.equal(report.ok, true);
  assert.ok(report.modes.some((mode) => mode.id === "creator-studio"));
  assert.match(
    report.modes.find((mode) => mode.id === "creator-studio").document,
    /动态组合/,
  );
  assert.ok(report.skills.some((skill) => skill.id === "product-analysis"));
});

test("desktop operations preview, share, import, and apply a real Mode", async () => {
  const root = path.resolve(__dirname, "../..");
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "asl-desktop-test-"));
  try {
    const workspace = path.join(root, "examples/personal-environment");
    const source = path.join(scratch, "shared mode.zip");
    const target = path.join(scratch, "received environment");
    const project = path.join(scratch, "agent project");
    const exporting = { workspace, mode: "creator-studio", output: source };
    const preview = await runCore("export", exporting, { root });
    assert.equal(preview.ok, true);
    await assert.rejects(fs.access(source));
    await runCore("export", { ...exporting, apply: true }, { root });
    assert.equal(
      (await runCore("inspect", { source }, { root })).mode,
      "creator-studio",
    );
    await runCore("import", { source, target }, { root });
    await assert.rejects(fs.access(target));
    await runCore("import", { source, target, apply: true }, { root });
    const report = await runCore("describe", { workspace: target }, { root });
    assert.equal(report.skills.length, 2);
    await fs.mkdir(project);
    await runCore(
      "project",
      { workspace: target, mode: "creator-studio", project, host: "codex-app" },
      { root },
    );
    assert.match(
      await fs.readFile(path.join(project, "AGENTS.md"), "utf8"),
      /creator-studio/,
    );
  } finally {
    // Only this test's freshly created, resolved child of the OS temp directory.
    if (
      path.dirname(scratch) !== path.resolve(os.tmpdir()) ||
      !path.basename(scratch).startsWith("asl-desktop-test-")
    )
      throw new Error("Unexpected test path");
    await fs.rm(scratch, { recursive: true, force: true });
  }
});
