const test = require("node:test");
const assert = require("node:assert/strict");
const { commandArgs, runCore } = require("../bridge.cjs");
const path = require("node:path");
const fs = require("node:fs/promises");
const os = require("node:os");

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
