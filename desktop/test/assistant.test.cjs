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
  await assert.rejects(launchAssistant({ id: "claude-code" }, { platform: "linux" }), /Windows.*macOS/);
});

test("macOS discovers executable CLIs and explains unavailable entries", { skip: process.platform === "win32" }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "asl-mac-find-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, ".local/bin"), { recursive: true });
  await fs.writeFile(path.join(root, ".local/bin/codex"), "#!/bin/sh\n", { mode: 0o700 });
  await fs.writeFile(path.join(root, "claude"), "not executable");
  const inventory = await assistantInventory({ platform: "darwin", home: root, env: { PATH: root } });
  assert.equal(inventory.find(item => item.id === "codex-app").available, true);
  assert.match(inventory.find(item => item.id === "claude-code").unavailableReason, /执行权限/);
  const unsupported = await assistantInventory({ platform: "linux", home: root, env: { PATH: root } });
  assert.equal(unsupported.find(item => item.id === "codex-app").available, false);
  assert.match(unsupported.find(item => item.id === "codex-app").unavailableReason, /平台/);
});

test("macOS handoff preserves literal arguments and records success and failure", { skip: process.platform !== "darwin" }, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "asl-mac-terminal-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const project = path.join(root, "中文 ' 项目 $(touch INJECTED)");
  await fs.mkdir(project);
  const executable = path.join(root, "native ' agent");
  await fs.writeFile(executable, '#!/bin/zsh\n/usr/bin/printf "%s\\n" "$@" > arguments.txt\nexit "${ASL_FIXTURE_EXIT:-0}"\n', { mode: 0o700 });
  const brief = '原文 `touch INJECTED` $(touch INJECTED) "quoted" \'single\'\n下一行';
  for (const [assistant, exitCode] of [["codex-app", 0], ["claude-code", 7]]) {
    const result = await launchAssistant({ id: assistant, executable, brief, workspace: project, project }, {
      root: path.join(root, "sessions"), platform: "darwin",
      launch: async (program, args) => {
        assert.equal(program, "/usr/bin/open");
        assert.deepEqual(args.slice(0, 2), ["-a", "Terminal"]);
        assert.equal((await fs.stat(args[2])).mode & 0o777, 0o700);
        await promisify(execFile)("/bin/zsh", [args[2]], { env: { ...process.env, ASL_FIXTURE_EXIT: String(exitCode) } }).catch(error => {
          assert.equal(error.code, exitCode);
        });
      },
    });
    const job = JSON.parse(await fs.readFile(result.job, "utf8"));
    assert.equal(await fs.readFile(path.join(project, "arguments.txt"), "utf8"), [...job.args, brief].join("\n") + "\n");
    const status = await sessionStatus(path.join(root, "sessions"), result.id);
    assert.equal(status.exitCode, exitCode);
    assert.equal(status.status, exitCode === 0 ? "ended" : "failed");
    await assert.rejects(fs.access(path.join(project, "INJECTED")), { code: "ENOENT" });
  }
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
