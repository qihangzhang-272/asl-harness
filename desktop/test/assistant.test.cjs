const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");
const { assistantInventory, launchAssistant, sessionStatus } = require("../assistant.cjs");

test("native launch passes prompt and paths as data, never as shell source", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "asl-assistant-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const cli = path.join(root, "codex.cmd");
  await fs.writeFile(cli, "");
  const requests = [];
  const result = await launchAssistant({ id: "codex-app", executable: cli, brief: 'read `foo` $(bad) "quoted"', workspace: root, project: root, scope: "project" }, {
    root: path.join(root, "sessions"), platform: "win32", launch: async (...args) => requests.push(args),
  });
  assert.equal(requests.length, 1);
  assert.ok(!requests[0][1].join(" ").includes("$(bad)"));
  const job = JSON.parse(await fs.readFile(result.job, "utf8"));
  assert.equal(job.command, cli);
  assert.ok(job.args.includes("on-request"));
  assert.ok(!job.args.includes("--dangerously-bypass-approvals-and-sandbox"));
  assert.equal(job.prompt, 'read `foo` $(bad) "quoted"');
  assert.equal((await sessionStatus(path.join(root, "sessions"), result.id)).status, "opened");
  await fs.writeFile(path.join(path.dirname(result.job), "receipt.json"), JSON.stringify({ exitCode: 0, finishedAt: "2026-09-09" }));
  assert.equal((await sessionStatus(path.join(root, "sessions"), result.id)).status, "ended");
  await assert.rejects(sessionStatus(root, "../secret"), /无效/);
});

test("discovery returns installed executables, not model credentials", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "asl-assistant-find-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "claude.exe"), "");
  const result = await assistantInventory({ platform: "win32", home: root, env: { PATH: root, SECRET: "do-not-return" } });
  assert.equal(result.find(item => item.id === "claude-code").available, true);
  assert.equal(result.find(item => item.id === "codex-app").available, false);
  assert.ok(!JSON.stringify(result).includes("do-not-return"));
});

test("unsupported platforms do not claim native handoff", async () => {
  await assert.rejects(launchAssistant({ id: "claude-code" }, { platform: "darwin" }), /Windows/);
});

test("Windows actually executes the fixed handoff and writes a native receipt", { skip: process.platform !== "win32" }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "asl-terminal-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  // Existing Windows executable is the transport fixture, not a claimed AI result.
  const executable = path.join(process.env.SystemRoot, "System32", "where.exe");
  const result = await launchAssistant({ id: "claude-code", executable, brief: "ASL_TEST_NONEXISTENT_COMMAND", workspace: root, project: root }, {
    root: path.join(root, "sessions"),
    launch: async (program, args, options) => promisify(execFile)(program, args.filter(arg => arg !== "-NoExit"), { ...options, windowsHide: true, timeout: 15000 }),
  });
  const report = await sessionStatus(path.join(root, "sessions"), result.id);
  assert.equal(report.status, "failed");
  assert.notEqual(report.exitCode, 0);
});
