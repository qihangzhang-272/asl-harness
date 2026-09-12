const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

// Exercise the actual IPC handlers. Native Windows dialogs are separately checked in the packaged App.
async function desktop(t) {
  const home = await fs.mkdtemp(path.join(os.tmpdir(), "asl-ipc-"));
  t.after(() => fs.rm(home, { recursive: true, force: true }));
  const directory = path.resolve(__dirname, "..");
  const localRequire = createRequire(path.join(directory, "main.cjs"));
  const handlers = new Map(), calls = [];
  const webContents = { on() {}, setWindowOpenHandler() {}, session: { setPermissionRequestHandler() {} } };
  let page;
  const dialog = {
    next: { canceled: true }, confirm: 0,
    async showOpenDialog(_window, options) { calls.push(options); return this.next; },
    async showSaveDialog(_window, options) { calls.push(options); return this.next; },
    async showMessageBox() { return { response: this.confirm }; },
  };
  const electron = {
    app: { isPackaged: false, whenReady: () => Promise.resolve(), on() {}, quit() {},
      getPath: name => name === "documents" ? path.join(home, "missing", "Desktop") : home },
    BrowserWindow: class { constructor() { this.webContents = webContents; } removeMenu() {} loadFile(file) { page = require("node:url").pathToFileURL(file).href; } },
    dialog, ipcMain: { handle: (key, fn) => handlers.set(key, fn) }, shell: {}, net: {},
  };
  const executed = [];
  vm.runInNewContext(await fs.readFile(path.join(directory, "main.cjs"), "utf8"), {
    __dirname: directory, process: { ...process, argv: [] },
    require: name => name === "electron" ? electron : name === "./bridge.cjs"
      ? { ...localRequire(name), runCore: async (...args) => { executed.push(args); return {}; } }
      : localRequire(name),
  });
  await new Promise(resolve => setImmediate(resolve));
  return { home, dialog, calls, executed, invoke: (method, ...args) => handlers.get(`asl:${method}`)(
    { sender: webContents, senderFrame: { url: page } }, ...args) };
}

test("folder selection falls back to a real home and cancellation grants nothing", async t => {
  const app = await desktop(t);
  assert.equal((await app.invoke("choose", "project")).value, null);
  assert.equal(app.calls[0].defaultPath, app.home);
  const result = await app.invoke("run", "project", { workspace: app.home, project: app.home, mode: "writing", host: "codex-app" });
  assert.equal(result.ok, false);
  assert.equal(app.executed.length, 0);
});

test("built-in example cannot be edited or used as an import destination", async t => {
  const app = await desktop(t);
  const initial = (await app.invoke("initial")).value;
  for (const [action, values] of [
    ["edit", { workspace: initial.example, request: { operation: "mode.archive", id: "creator-studio" }, apply: true }],
    ["import", { source: app.home, target: initial.example, apply: true }],
  ]) {
    const reply = await app.invoke("run", action, values);
    assert.equal(reply.ok, false);
    assert.match(reply.error, /内置示例只供查看/);
  }
  assert.equal(app.executed.length, 0);
});

test("canceled native application never executes the write", async t => {
  const app = await desktop(t);
  app.dialog.next = { canceled: false, filePaths: [app.home] };
  await app.invoke("choose", "environment");
  await app.invoke("choose", "project");
  const result = await app.invoke("run", "project", { workspace: app.home, project: app.home, mode: "writing", host: "codex-app" });
  assert.equal(result.value.canceled, true);
  assert.equal(app.executed.length, 0);
});

test("first launch does not inject developer libraries and owns a default import location", async t => {
  const app = await desktop(t);
  const { value } = await app.invoke("initial");
  assert.equal(value.workspace, null);
  assert.equal(value.libraries.length, 0);
  assert.equal(value.managedLibrary, path.join(app.home, "workspace"));
  assert.equal((await app.invoke("run", "import", { source: value.example, target: value.managedLibrary })).ok, true);
  assert.equal((await app.invoke("run", "import", { source: value.example, target: value.managedLibrary, apply: true })).ok, false);
});

test("unparsed remote modes cannot be imported by guessing a cache path", async t => {
  const app = await desktop(t);
  const reply = await app.invoke("repository-mode", app.home, "creator-studio");
  assert.equal(reply.ok, false);
  assert.match(reply.error, /重新解析仓库/);
  assert.equal(app.executed.length, 0);
});
