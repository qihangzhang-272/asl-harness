const { execFile } = require("node:child_process");
const path = require("node:path");

const definitions = {
  describe: ["workspace.validate", ["workspace"]],
  state: ["state", ["workspace"]],
  export: ["mode.export", ["workspace", "mode", "output"]],
  inspect: ["mode.inspect", ["source"]],
  import: ["mode.import", ["source", "target"]],
  project: ["host.project", ["workspace", "mode", "project", "host"]],
  preset: [
    "deepseek.preset.export",
    ["workspace", "mode", "basePreset", "output"],
  ],
};

function commandArgs(action, values = {}) {
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
    action === "export"
      ? ["includeProfile", "apply"]
      : action === "import"
        ? ["replace", "apply"]
        : [];
  if (
    Object.keys(values).some((key) => ![...required, ...optional].includes(key))
  )
    throw new Error("不支持的参数");
  for (const key of required) {
    if (
      typeof values[key] !== "string" ||
      !values[key].trim() ||
      values[key].includes("\0")
    )
      throw new Error(`缺少有效的 ${key}`);
  }
  for (const key of optional)
    if (key in values && typeof values[key] !== "boolean")
      throw new Error("开关必须是布尔值");
  if (values.mode && !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(values.mode))
    throw new Error("无效的 Mode");
  if (
    values.host &&
    !["codex-app", "claude-code", "deepseek-harness"].includes(values.host)
  )
    throw new Error("不支持的宿主");
  const args = [command];
  const names = { host: "host-id", basePreset: "base-preset" };
  for (const key of required) args.push(`--${names[key] || key}`, values[key]);
  if (values.includeProfile) args.push("--include-profile");
  if (values.replace) args.push("--replace");
  if (["export", "import"].includes(action) && !values.apply)
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
    execFile(
      program,
      parameters,
      {
        cwd: root,
        windowsHide: true,
        shell: false,
        timeout: 120000,
        maxBuffer: 8 * 1024 * 1024,
        env: {
          ...process.env,
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
            new Error(report.error?.message || error?.message || "操作失败"),
          );
        else resolve(report);
      },
    );
  });
}

module.exports = { commandArgs, runCore };
