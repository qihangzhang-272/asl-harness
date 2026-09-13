const { app, BrowserWindow, dialog, ipcMain, shell, net, clipboard } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { pathToFileURL } = require("node:url");
const { runCore, commandArgs } = require("./bridge.cjs");
const {
  readPreferences,
  rememberLibrary,
  updatePreferences,
  rememberView,
  isLibrary,
} = require("./library.cjs");
const { nativeInventory, existingDirectory, localSkillRoots } = require("./native.cjs");
const { discover, publicUrl } = require("./market.cjs");
const { readRepository } = require('./repository-import.cjs');
const { ReadRequests } = require('./read-requests.cjs');
const { assistantInventory, launchAssistant, sessionStatus } = require("./assistant.cjs");
const { upstreamDocument, presetDestination, checkUpstreams, watchEnvironment } = require("./repository.cjs");

const root = path.resolve(__dirname, "..");
app.setName('ASL Workspace');
if(!app.commandLine.hasSwitch('user-data-dir'))
  app.setPath('userData',path.join(app.getPath('appData'),'ASL Workspace'));
const primary = app.requestSingleInstanceLock();
if(!primary) app.quit();
const page = pathToFileURL(path.join(__dirname, "dist/index.html")).href;
let window;
const selected = new Set();
const repositories = new Map();
const readers = new Map();
const reads = new ReadRequests();
let busy = false;
let stopWatching;
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
const example = app.isPackaged
  ? path.join(process.resourcesPath, "example-environment")
  : path.join(root, "examples/personal-environment");

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

function readHandle(method, channel, fn) {
  readers.set(method, fn);
  handle(channel, (...args) => fn(args));
}

app.on('second-instance',()=>{
  if(window){if(window.isMinimized())window.restore();window.show();window.focus();}
});
if(primary) app.whenReady().then(() => {
  const preferenceFile = path.join(app.getPath("userData"), "libraries.json");
  const sessionRoot = path.join(app.getPath("userData"), "setup-sessions");
  const managedLibrary = path.join(app.getPath("userData"), "workspace");
  async function machineInventory(signal) {
    const preferences = await readPreferences(preferenceFile);
    const source = [...new Set([...preferences.libraries, ...preferences.targets.map(t => t.project), managedLibrary])]
      .filter(p => typeof p === 'string' && path.isAbsolute(p)).slice(0, 64);
    const report = await runCore('nativeMcp', { source }, { ...options, signal });
    for (const project of report.projects) selected.add(path.resolve(project));
    return report;
  }
  selected.add(managedLibrary);
  window = new BrowserWindow({
    width: 1320,
    height: 880,
    minWidth: 900,
    minHeight: 680,
    title: "ASL Workspace",
    backgroundColor: "#f5f5f7",
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

  handle('asl:read', (id, method, args) => {
    if (!readers.has(method) || !Array.isArray(args)) throw new Error('不支持的读取');
    if (method === 'run' && (args[1]?.apply || ['project', 'preset', 'mcpSave'].includes(args[0]))) throw new Error('写入不可通过读取入口执行');
    return reads.run(id, signal => readers.get(method)(args, signal));
  });
  handle('asl:cancel-read', id => { reads.cancel(id); return { canceled: true }; });

  handle("asl:initial", async () => {
    const preferences = await readPreferences(preferenceFile);
    const index = process.argv.indexOf("--workspace");
    const initial =
      index >= 0
        ? path.resolve(process.argv[index + 1] || ".")
        : preferences.lastLibrary || (await isLibrary(managedLibrary) ? managedLibrary : null);
    if (initial) selected.add(initial);
    selected.add(example);
    const libraries = [...preferences.libraries];
    for (const location of libraries) selected.add(location);
    return { workspace: initial, example, managedLibrary, libraries, views:preferences.views,
      repositories: preferences.repositories, packaged: app.isPackaged, version:app.getVersion() };
  });

  handle('asl:watch', async (workspace) => {
    if (!selected.has(path.resolve(workspace))) throw new Error('请先选择工作环境');
    stopWatching?.();
    stopWatching = watchEnvironment(workspace, data => { if (!window.isDestroyed()) window.webContents.send('asl:environment-changed', data); });
    return { watching: workspace };
  });
  handle('asl:copy-text', async text => {
    if (typeof text !== 'string' || text.length > 256000) throw new Error('复制内容过大');
    await clipboard.writeText(text);
    return { copied: true };
  });
  handle("asl:remember", async (workspace) => {
    if (!selected.has(path.resolve(workspace)))
      throw new Error("请先选择技能库");
    return rememberLibrary(preferenceFile, workspace);
  });
  handle('asl:remember-view',async(workspace,view)=>{
    if(!selected.has(path.resolve(workspace)))throw new Error('请先选择工作环境');
    return rememberView(preferenceFile,workspace,view);
  });
  handle('asl:guide-roots',async()=>{
    const roots=[];
    for(const item of await localSkillRoots(undefined, undefined, (await machineInventory()).projects))
      if(await existingDirectory([item.path]))roots.push(item);
    return roots;
  });
  readHandle('native', "asl:native", async (_args, signal) => {
    const report = await nativeInventory(undefined, undefined, await machineInventory(signal));
    for (const preset of report.presets) selected.add(preset.path);
    for (const host of report.hosts)
      if (typeof host.userMode?.skillsDir === "string" && path.isAbsolute(host.userMode.skillsDir)) selected.add(path.resolve(host.userMode.skillsDir));
    return {
      ...report,
      assistants: await assistantInventory(),
      targets: (await readPreferences(preferenceFile)).targets,
    };
  });

  handle("asl:setup", async (assistant, values) => {
    commandArgs("readiness", values);
    for (const key of ["workspace", "project", "skillsDir"])
      if (values[key] && !selected.has(path.resolve(values[key]))) throw new Error("请先选择工作位置");
    const installed = (await assistantInventory()).find(item => item.id === assistant && item.available);
    if (!installed) throw new Error("请先安装 Claude Code 或 Codex CLI，并完成它的原生登录");
    if (busy) throw new Error("当前操作尚未完成");
    busy = true;
    try {
      const report = await runCore("readiness", values, options);
      const answer = await dialog.showMessageBox(window, {
        type: "question", buttons: ["取消", "打开配置助手"], defaultId: 1, cancelId: 0,
        message: `用 ${installed.name} 配置这台电脑？`,
        detail: `目标：${values.host}\n模式：${values.mode}\n范围：${values.scope === "user" ? "当前用户的所有项目" : values.project}\n将使用该 Agent 当前的模型与账号。安装和登录继续由原生窗口确认，ASL 不接管密钥。`,
      });
      if (answer.response !== 1) return { canceled: true };
      return launchAssistant({ id: installed.id, executable: installed.executable, brief: report.brief,
        workspace: values.workspace, project: values.project, scope: values.scope }, { root: sessionRoot });
    } finally { busy = false; }
  });
  handle("asl:setup-status", (id) => sessionStatus(sessionRoot, id));
  readHandle('localSkills', "asl:local-skills", async ([extra], signal) => {
    if (extra && !selected.has(path.resolve(extra))) throw new Error("请先选择要扫描的目录");
    const roots = extra ? [{ name: "自选目录", path: extra }] : await localSkillRoots(undefined, undefined, (await machineInventory(signal)).projects);
    if (!roots.length) return { skills: [], issues: [], roots };
    const report = await runCore("scan", { source: roots.map(r => r.path) }, { ...options, signal });
    for (const skill of report.skills) selected.add(path.resolve(skill.source));
    return { ...report, roots };
  });
  readHandle('localModes', 'asl:local-modes', async ([parent], signal) => {
    if (parent && !selected.has(path.resolve(parent))) throw new Error('请先选择扫描目录');
    const source = (await machineInventory(signal)).projects;
    const report = await runCore('localModes', { source, ...(parent ? { parent } : {}) }, { ...options, signal });
    for (const mode of report.modes) selected.add(path.resolve(mode.workspace));
    return report;
  });
  readHandle('mcp', 'asl:mcp', async ([values], signal) => {
    commandArgs('mcp', values);
    if (values.project && !selected.has(path.resolve(values.project))) throw new Error('请先选择项目');
    return runCore('mcp', values, { ...options, signal });
  });
  handle('asl:mcp-save', async values => {
    commandArgs('mcpSave', values);
    if (values.project && !selected.has(path.resolve(values.project))) throw new Error('请先选择项目');
    if (busy) throw new Error('当前保存尚未结束');
    busy = true;
    try {
      const perProject = values.scope !== 'user' || values.host === 'claude-code' && values.request.operation === 'toggle';
      const answer = await dialog.showMessageBox(window, { type: 'question', buttons: ['取消', '确认保存'], defaultId: 0, cancelId: 0,
        message: `${values.request.operation === 'remove' ? '移除' : '修改'} MCP：${values.request.name}？`,
        detail: `Agent：${values.host}\n范围：${perProject ? values.project : '当前用户的所有项目'}\n仅修改此条目，保留其他配置及一份修改前备份。不启动服务，不代替原生登录。` });
      if (answer.response !== 1) return { canceled: true };
      return await runCore('mcpSave', values, options);
    } finally { busy = false; }
  });
  handle("asl:source-document", async (source) => {
    if (typeof source !== "string" || !selected.has(path.resolve(source))) throw new Error("请先发现或选择这个技能目录");
    const root = await fs.realpath(source);
    const file = await fs.realpath(path.join(root, "SKILL.md"));
    const relative = path.relative(root, file);
    if (relative.startsWith("..") || path.isAbsolute(relative) || (await fs.stat(file)).size > 1024 * 1024) throw new Error("原文越界或过大，请在原位置查看");
    return fs.readFile(file, "utf8");
  });
  readHandle("githubSkills", "asl:github-skills", async ([url], signal) => {
    return readRepository(url, { fetch: (...args) => net.fetch(...args),
      core: (action, values, signal) => runCore(action, values, { ...options, signal }),
      temp: app.getPath("temp"), selected, repositories,
      remember: url => updatePreferences(preferenceFile, p => ({ ...p, repositories: [url, ...p.repositories.filter(v => v !== url)].slice(0, 12) })),
    }, signal);
  });
  handle("asl:repository-mode", async (snapshot, mode) => {
    const entry = repositories.get(snapshot);
    if (!entry || !entry.modes.has(mode)) throw new Error("请重新解析仓库并选择其中的 Mode");
    const file = path.join(entry.environment, "modes", mode, "SOURCE.md");
    let original = "# Source\n";
    try { original = await fs.readFile(file, "utf8"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await fs.writeFile(file, upstreamDocument(original, entry.repo, entry.url));
    const output = path.join(path.dirname(snapshot), `${randomUUID()}.zip`);
    const report = await runCore("export", { workspace: entry.environment, mode, output, apply: true }, options);
    selected.add(output);
    return { source: output, report: { ...report, skills: (await runCore("inspect", { source: output }, options)).skills } };
  });
  handle("asl:preset-target", async (mode) => {
    const target = presetDestination((await nativeInventory()).presetRoot, mode);
    selected.add(target);
    return target;
  });
  readHandle('repositoryUpdates', "asl:repository-updates", async ([workspace], signal) => {
    if (!selected.has(path.resolve(workspace))) throw new Error("请先选择工作环境");
    const catalog = await runCore("catalog", { workspace }, { ...options, signal });
    const request = (url, settings = {}) => net.fetch(url, { ...settings, signal: AbortSignal.any([signal, settings.signal].filter(Boolean)) });
    return checkUpstreams(catalog.modes, request);
  });
  readHandle('discover', "asl:discover", ([provider, query], signal) =>
    discover(provider, query, (url, settings = {}) => net.fetch(url, { ...settings, signal: AbortSignal.any([signal, settings.signal].filter(Boolean)) })),
  );
  handle("asl:external", async (url) => {
    const safe = publicUrl(url);
    if (!safe) throw new Error("不支持的外部链接");
    await shell.openExternal(safe);
  });

  handle("asl:choose", async (kind) => {
    let result;
    const home = app.getPath("home");
    const presetRoot = path.join(home, ".dsh", ".agent-presets");
    const directory = await existingDirectory([
      ["basePreset", "newPreset"].includes(kind) ? presetRoot : null,
      app.getPath("documents"), home,
    ]);
    if (
      [
        "environment",
        "project",
        "basePreset",
        "packageFolder",
        "skillFolder",
        "userSkills",
        "skillSearchRoot",
        "reference",
      ].includes(kind)
    ) {
      result = await dialog.showOpenDialog(window, {
        title: {
          environment: "选择工作环境",
          project: "选择要交给 Agent 的项目",
          basePreset: "选择一个已有的 DeepSeek Preset",
          packageFolder: "选择环境包目录",
          skillFolder: "选择包含 SKILL.md 的完整技能文件夹",
          userSkills: "选择所选 Agent 的用户技能目录（直接存放各技能文件夹的位置）",
          skillSearchRoot: "选择要发现技能的目录",
          reference: "选择允许 AI 参考的项目或记录目录",
        }[kind],
        defaultPath: directory,
        properties: ["openDirectory"],
      });
      result = result.canceled ? null : result.filePaths[0];
    } else if (kind === "package") {
      const answer = await dialog.showOpenDialog(window, {
        title: "选择 Mode 环境包",
        defaultPath: directory,
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
        defaultPath: path.join(directory || home, kind === "export" ? "my-mode.zip" : kind === "newPreset" ? "asl-mode" : "my-environment"),
        ...(kind === "export"
          ? { filters: [{ name: "Mode 包", extensions: ["zip"] }] }
          : {}),
      });
      result = answer.canceled ? null : answer.filePath;
    } else throw new Error("未知文件选择操作");
    if (result) selected.add(path.resolve(result));
    return result;
  });

  readHandle('run', "asl:run", async ([action, values], signal) => {
    if (["scan", "unpack", "mcp", "mcpSave", "localModes", "nativeMcp"].includes(action)) throw new Error("请使用对应管理入口");
    commandArgs(action, values);
    if ((action === "edit" && path.resolve(values.workspace) === example) ||
        (action === "import" && path.resolve(values.target) === example))
      throw new Error("内置示例只供查看。请先分享模式，再导入为独立技能库后编辑。");
    if (action === "userSync" && values.apply && !values.expected) throw new Error("请先查看同步预览");
    if (action === "import" && values.apply && !values.expected) throw new Error("请先查看导入预览");
    for (const key of [
      "workspace",
      "source",
      "target",
      "output",
      "project",
      "basePreset",
      "skillsDir",
    ]) {
      if (values[key] && !selected.has(path.resolve(values[key])))
        throw new Error("请先用文件选择器选择这个位置");
    }
    if (
      action === "edit" &&
      values.request.source &&
      !selected.has(path.resolve(values.request.source))
    )
      throw new Error("请先选择要导入的技能文件夹");
    const write =
      ["project", "preset"].includes(action) || values.apply === true;
    if (write && busy) throw new Error("当前保存尚未完成");
    if (write) busy = true;
    try {
      if (
        write &&
        (action !== "edit" ||
          values.request.operation.endsWith(".archive") ||
          values.request.operation === "skill.import")
      ) {
          const answer = await dialog.showMessageBox(window, {
          type: "question",
          buttons: ["取消", "确认应用"],
          defaultId: 0,
          cancelId: 0,
          message:
            action === "edit" ? "确认这次内容变更？" : "应用到所选位置？",
          detail: action === "userSync"
            ? `范围：当前用户的所有项目\nAgent：${values.host}\n模式：${values.mode}\n${values.skillsDir ? "自选技能目录：" + values.skillsDir + "\n" : ""}${values.remove ? "停用 ASL 默认模式并移除其受管副本，保留原技能源。" : "按预览同步所选模式，其他原生技能和模型账号保持不变。"}`
            : `${action === "import" && values.replace ? "将替换预览中冲突的同名内容。\n" : ""}${action === "project" ? "范围：仅所选项目\n" : ""}目标：${values.output || values.target || values.project || values.workspace}\n${action === "edit" ? values.request.id : "不更改其他项目或模型账号。"}`,
        });
        if (answer.response !== 1) return { canceled: true };
      }
      const result = await runCore(action, values, { ...options, ...(write ? {} : { signal }) });
      if (action === "preset") {
        const inventory = await nativeInventory();
        result.presetRegistered = inventory.presets.some(p => path.resolve(p.path) === path.resolve(values.output));
      }
      if (action === "project") {
        await updatePreferences(preferenceFile,preferences=>({...preferences,targets:[
          {
            project: values.project,
            host: values.host,
            workspace: values.workspace,
          },
          ...preferences.targets.filter(
            (t) => !(t.project === values.project && t.host === values.host),
          ),
        ].slice(0, 30)}));
      }
      return result;
    } finally {
      if (write) busy = false;
    }
  });

  readHandle('readSkill', "asl:read-skill", async ([workspace, skill], signal) => {
    if (
      !selected.has(path.resolve(workspace)) ||
      typeof skill !== "string" ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(skill)
    )
      throw new Error("未知能力位置");
    const report = await runCore("describe", { workspace }, { ...options, signal });
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
  window.loadFile(path.join(__dirname, "dist/index.html"));
});

app.on("window-all-closed", () => app.quit());
