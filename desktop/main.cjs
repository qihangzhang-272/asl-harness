const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { runCore, commandArgs } = require("./bridge.cjs");

const root = path.resolve(__dirname, "..");
const page = pathToFileURL(path.join(__dirname, "index.html")).href;
let window;
const selected = new Set();
let busy = false;
const options = app.isPackaged
  ? {
      root: process.resourcesPath,
      executable: path.join(
        process.resourcesPath,
        "core",
        process.platform === "win32" ? "asl-harness.exe" : "asl-harness",
      ),
    }
  : { root };

function trusted(event) {
  if (event.sender !== window.webContents || event.senderFrame?.url !== page)
    throw new Error("不允许的界面来源");
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    trusted(event);
    try {
      return { ok: true, value: await fn(...args) };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });
}

app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 960,
    minHeight: 680,
    title: "ASL Workspace",
    backgroundColor: "#f5f4ee",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.removeMenu();
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== page) event.preventDefault();
  });
  window.webContents.session.setPermissionRequestHandler(
    (_contents, _permission, callback) => callback(false),
  );

  handle("asl:initial", () => {
    const index = process.argv.indexOf("--workspace");
    const initial =
      index >= 0 ? path.resolve(process.argv[index + 1] || ".") : null;
    if (initial) selected.add(initial);
    const example = app.isPackaged
      ? path.join(process.resourcesPath, "example-environment")
      : path.join(root, "examples/personal-environment");
    selected.add(example);
    return { workspace: initial, example, packaged: app.isPackaged };
  });

  handle("asl:choose", async (kind) => {
    let result;
    if (
      ["environment", "project", "basePreset", "packageFolder"].includes(kind)
    ) {
      result = await dialog.showOpenDialog(window, {
        title: {
          environment: "选择工作环境",
          project: "选择要交给 Agent 的项目",
          basePreset: "选择一个已有的 DeepSeek Preset",
          packageFolder: "选择环境包目录",
        }[kind],
        properties: ["openDirectory"],
      });
      result = result.canceled ? null : result.filePaths[0];
    } else if (kind === "package") {
      const answer = await dialog.showOpenDialog(window, {
        title: "选择 Mode 环境包",
        filters: [{ name: "Mode 包", extensions: ["zip"] }],
        properties: ["openFile"],
      });
      result = answer.canceled ? null : answer.filePaths[0];
    } else if (["export", "newEnvironment", "newPreset"].includes(kind)) {
      const answer = await dialog.showSaveDialog(window, {
        title: {
          export: "保存 Mode 环境包",
          newEnvironment: "选择新环境的位置和名称",
          newPreset: "选择新 Preset 的位置和名称",
        }[kind],
        defaultPath: kind === "export" ? "my-mode.zip" : "my-environment",
        ...(kind === "export"
          ? { filters: [{ name: "Mode 包", extensions: ["zip"] }] }
          : {}),
      });
      result = answer.canceled ? null : answer.filePath;
    } else throw new Error("未知文件选择操作");
    if (result) selected.add(path.resolve(result));
    return result;
  });

  handle("asl:run", async (action, values) => {
    commandArgs(action, values);
    for (const key of [
      "workspace",
      "source",
      "target",
      "output",
      "project",
      "basePreset",
    ]) {
      if (values[key] && !selected.has(path.resolve(values[key])))
        throw new Error("请先用文件选择器选择这个位置");
    }
    if (busy) throw new Error("当前操作尚未完成");
    const write =
      ["project", "preset"].includes(action) || values.apply === true;
    busy = true;
    try {
      if (write) {
        const answer = await dialog.showMessageBox(window, {
          type: "question",
          buttons: ["取消", "确认应用"],
          defaultId: 0,
          cancelId: 0,
          message: "应用这次工作环境变更？",
          detail: `${action === "import" && values.replace ? "将替换预览中冲突的同名内容。\n" : ""}目标：${values.output || values.target || values.project}\n不安装外部依赖，不更改账号，不迁移聊天历史。`,
        });
        if (answer.response !== 1) return { canceled: true };
      }
      return await runCore(action, values, options);
    } finally {
      busy = false;
    }
  });

  handle("asl:read-skill", async (workspace, skill) => {
    if (
      !selected.has(path.resolve(workspace)) ||
      typeof skill !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(skill)
    )
      throw new Error("未知能力位置");
    const report = await runCore("describe", { workspace }, options);
    if (!report.skills.some((item) => item.id === skill))
      throw new Error("能力不在当前环境");
    const realRoot = await fs.realpath(workspace);
    const texts = {};
    for (const name of ["SKILL.md", "SOURCE.md"]) {
      const file = await fs.realpath(
        path.join(workspace, "skills", skill, name),
      );
      const relative = path.relative(realRoot, file);
      if (relative.startsWith("..") || path.isAbsolute(relative))
        throw new Error("能力路径越界");
      if ((await fs.stat(file)).size > 1024 * 1024)
        throw new Error("文件过大，请用本地编辑器查看");
      texts[name] = await fs.readFile(file, "utf8");
    }
    return texts;
  });
  window.loadFile(path.join(__dirname, "index.html"));
});

app.on("window-all-closed", () => app.quit());
