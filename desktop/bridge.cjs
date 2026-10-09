const { execFile } = require("node:child_process");
const path = require("node:path");

const definitions = {
  scan: ["skill.scan", ["source"]],
  unpack: ["skill.unpack", ["source", "output"]],
  catalog: ["environment.catalog", ["workspace"]],
  documents: ['environment.documents', ['workspace', 'file']],
  archives: ['environment.archive', ['workspace']],
  archiveCleanup: ['environment.archive.cleanup', ['workspace', 'entry']],
  history: ['environment.history', ['workspace']],
  restoreHistory: ['mode.history.restore', ['workspace','mode','revision','expected']],
  files: ['skill.files', ['workspace', 'skill', 'file']],
  guide: ['environment.guide', ['workspace']],
  edit: ["environment.edit", ["workspace"]],
  create: ['mode.create', ['target']],
  describe: ["workspace.validate", ["workspace"]],
  state: ["state", ["workspace"]],
  export: ["mode.export", ["workspace", "mode", "output"]],
  inspect: ["mode.inspect", ["source"]],
  import: ["mode.import", ["source", "target"]],
  project: ["host.project", ["workspace", "mode", "project", "host"]],
  verify: ['host.verify', ['workspace', 'mode', 'project', 'host']],
  verifyPreset: ['deepseek.preset.verify', ['workspace', 'mode', 'output']],
  disconnect: ['host.disconnect', ['workspace', 'mode', 'project', 'host', 'scope']],
  userSync: ["host.user.sync", ["workspace", "mode", "host"]],
  readiness: ["host.setup.inspect", ["workspace", "mode", "host", "scope"]],
  preset: [
    "deepseek.preset.export",
    ["workspace", "mode", "basePreset", "output"],
  ],
};

function commandArgs(action, values = {}) {
  if (['localModes', 'nativeMcp', 'mcp', 'mcpSave'].includes(action)) {
    const allowed = action === 'localModes' ? ['source', 'parent'] : action === 'nativeMcp' ? ['source'] : ['host', 'project', ...(action === 'mcpSave' ? ['scope', 'request'] : [])];
    if (!values || typeof values !== 'object' || Array.isArray(values) || Object.keys(values).some(k => !allowed.includes(k))) throw new Error('无效的管理请求');
    if (['localModes', 'nativeMcp'].includes(action)) {
      if (!Array.isArray(values.source) || values.source.length > 64 || values.source.some(p => typeof p !== 'string' || !path.isAbsolute(p) || p.includes('\0'))) throw new Error('无效的本地目录');
      if (values.parent && (typeof values.parent !== 'string' || !path.isAbsolute(values.parent) || values.parent.includes('\0'))) throw new Error('无效的扫描目录');
      return [action === 'localModes' ? 'environment.discover' : 'mcp.discover', ...values.source.flatMap(p => ['--source', p]), ...(values.parent ? ['--parent', values.parent] : [])];
    }
    if (!['codex-app', 'claude-code'].includes(values.host)) throw new Error('不支持的 MCP 宿主');
    if (values.project && (typeof values.project !== 'string' || !path.isAbsolute(values.project) || values.project.includes('\0'))) throw new Error('请先选择项目');
    if (action === 'mcpSave' && (!['user', 'project', 'local'].includes(values.scope) || values.scope !== 'user' && !values.project || !values.request || typeof values.request !== 'object' || Array.isArray(values.request))) throw new Error('请选择范围并填写 MCP 配置');
    return [action === 'mcp' ? 'mcp.inspect' : 'mcp.edit', '--host-id', values.host, ...(values.project ? ['--project', values.project] : []), ...(action === 'mcpSave' ? ['--scope', values.scope] : [])];
  }
  const definition = definitions[action];
  if (
    !definition ||
    !values ||
    typeof values !== "object" ||
    Array.isArray(values)
  )
    throw new Error("不支持的操作");
  const [command, required] = definition;
  const optional =
    action === 'history' ? ['mode','revision','file','limit','offset'] : action === 'restoreHistory' ? ['apply'] : action === 'archives' ? ['entry','file'] : action === 'archiveCleanup' ? ['expected'] : action === 'guide' ? ['mode'] : action === "readiness"
      ? ["project", "probe", "skillsDir"]
      : action === 'disconnect' ? ['apply', 'expected'] : action === "userSync"
      ? ["apply", "expected", "remove", "skillsDir"]
      : action === "edit" || action === 'create'
      ? ["request", "apply", ...(action === 'create' ? ['expected'] : [])]
      : action === "export"
        ? ["includeProfile", "apply"]
        : action === "import"
          ? ["replace", "apply", "expected"]
          : [];
  if (
    Object.keys(values).some((key) => ![...required, ...optional].includes(key))
  )
    throw new Error("不支持的参数");
  for (const key of required) {
    if (action === "scan" && key === "source") {
      if (!Array.isArray(values.source) || !values.source.length || values.source.some(p => typeof p !== "string" || !p.trim() || p.includes("\0"))) throw new Error("请选择有效的技能目录");
      continue;
    }
    if (
      typeof values[key] !== "string" ||
      !values[key].trim() ||
      values[key].includes("\0")
    )
      throw new Error(`缺少有效的 ${key}`);
  }
  if (
    ['edit', 'create'].includes(action) &&
    (!values.request ||
      typeof values.request !== "object" ||
      Array.isArray(values.request))
  )
    throw new Error("修改请求必须是对象");
  for (const key of ['entry','file'])
    if (key in values && (typeof values[key] !== 'string' || !values[key].trim() || values[key].includes('\0'))) throw new Error('请选择有效的归档内容');
  for (const key of optional.filter((key) => !["request", "expected", "project", "skillsDir", "mode", "entry", "file", "revision", "limit", "offset"].includes(key)))
    if (key in values && typeof values[key] !== "boolean")
      throw new Error("开关必须是布尔值");
  if(values.revision!==undefined&&!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(values.revision))throw new Error('请选择有效的记录');
  for(const [key,min,max] of [['limit',1,50],['offset',0,10000]])if(values[key]!==undefined&&(!Number.isInteger(values[key])||values[key]<min||values[key]>max))throw new Error('记录范围无效');
  if (values.mode && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.mode))
    throw new Error("无效的 Mode");
  if (
    values.host &&
    !["codex-app", "claude-code", "deepseek-harness", "workbuddy"].includes(values.host)
  )
    throw new Error("不支持的宿主");
  if (action === "userSync" && !["codex-app", "claude-code"].includes(values.host))
    throw new Error("此 Agent 不支持用户级同步");
  if (values.expected !== undefined && !/^[a-f0-9]{64}$/.test(values.expected))
    throw new Error("无效的同步预览");
  if (values.skillsDir !== undefined && (typeof values.skillsDir !== "string" || !values.skillsDir.trim() || values.skillsDir.includes("\0"))) throw new Error("无效的用户技能目录");
  if (action === "readiness") {
    if (!["project", "user", "preset"].includes(values.scope)) throw new Error("无效的应用范围");
    if (values.scope !== "user" && !values.project) throw new Error("请先选择工作位置");
    if (values.project !== undefined && (typeof values.project !== "string" || !values.project.trim() || values.project.includes("\0"))) throw new Error("无效的工作位置");
  }
  const args = [command];
  const names = { host: "host-id", basePreset: "base-preset" };
  for (const key of required)
    for (const value of Array.isArray(values[key]) ? values[key] : [values[key]]) if(key!=='expected')args.push(`--${names[key] || key}`, value);
  if (action === "readiness" && values.project) args.push("--project", values.project);
  if (action === 'guide' && values.mode) args.push('--mode',values.mode);
  if (action === 'archives') for (const key of ['entry','file']) if (values[key]) args.push('--'+key,values[key]);
  if(action==='history')for(const key of ['mode','revision','file','limit','offset'])if(values[key]!==undefined)args.push('--'+key,String(values[key]));
  if (values.probe) args.push("--probe");
  if (values.skillsDir) args.push("--skills-dir", values.skillsDir);
  if (values.includeProfile) args.push("--include-profile");
  if (values.replace) args.push("--replace");
  if (values.remove) args.push("--remove");
  if (values.expected) args.push("--expected", values.expected);
  if (["export", "import", "edit", "create", "userSync", "disconnect", "restoreHistory"].includes(action) && !values.apply)
    args.push("--check");
  return args;
}

function runCore(action, values, options = {}) {
  const root = options.root || path.resolve(__dirname, "..");
  const args = commandArgs(action, values);
  const executable = options.executable || process.env.ASL_CORE_EXECUTABLE;
  const program =
    executable ||
    process.env.ASL_PYTHON ||
    (process.platform === "win32" ? "python" : "python3");
  const parameters = executable
    ? args
    : ["-X", "utf8", "-m", "asl_harness.commands", ...args];
  return new Promise((resolve, reject) => {
    const child = execFile(
      program,
      parameters,
      {
        cwd: root,
        windowsHide: true,
        shell: false,
        timeout: 120000,
        signal: options.signal,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
          ...options.env,
          PYTHONPATH: path.join(root, "src"),
          PYTHONDONTWRITEBYTECODE: "1",
          PYTHONIOENCODING: "utf-8",
        },
      },
      (error, stdout) => {
        let report;
        try {
          report = JSON.parse(stdout);
        } catch {
          reject(
            new Error(
              error?.code === "ENOENT"
                ? "未找到运行核心。开发版需要 Python 3.11+ 与 PyYAML；打包版应自带核心。"
                : `核心未返回有效结果：${error?.message || "empty response"}`,
            ),
          );
          return;
        }
        if (!report.ok || error)
          reject(
            Object.assign(new Error(report.error?.message || error?.message || "操作失败"), {code: report.error?.code, details: report.error?.details}),
          );
        else resolve(report);
      },
    );
    child.stdin.on("error", () => {});
    child.stdin.end(['edit', 'create', 'mcpSave'].includes(action) ? JSON.stringify(values.request) : "");
  });
}

module.exports = { commandArgs, runCore };
