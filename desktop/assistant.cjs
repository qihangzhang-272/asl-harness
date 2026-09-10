const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { spawn } = require("node:child_process");

async function assistantInventory(options = {}) {
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const folders = [...(env.PATH || env.Path || "").split(platform === "win32" ? ";" : ":"), path.join(home, ".local", "bin"), path.join(home, "AppData", "Roaming", "npm")].filter(Boolean);
  const result = [];
  for (const [id, name, command] of [["claude-code", "Claude Code", "claude"], ["codex-app", "Codex CLI", "codex"]]) {
    let executable = null;
    for (const directory of folders) {
      for (const suffix of platform === "win32" ? [".exe", ".cmd", ".ps1"] : [""]) {
        const file = path.resolve(directory, command + suffix);
        try { if ((await fs.stat(file)).isFile()) { executable = file; break; } } catch {}
      }
      if (executable) break;
    }
    result.push({ id, name, available: platform === "win32" && !!executable, executable });
  }
  return result;
}

// Fixed PowerShell source. User paths and the task are parsed as JSON data, never interpolated code.
const runner = `
$ErrorActionPreference = 'Stop'
$p = Get-Content -LiteralPath $env:ASL_SETUP_JOB -Raw -Encoding UTF8 | ConvertFrom-Json
$code = 1
try {
  Set-Location -LiteralPath $p.cwd
  $cliArgs = @($p.args) + @([string]$p.prompt)
  & $p.command @cliArgs
  $code = $LASTEXITCODE
} catch { Write-Host $_ -ForegroundColor Red }
@{ exitCode = $code; finishedAt = (Get-Date).ToUniversalTime().ToString('o') } | ConvertTo-Json | Set-Content -LiteralPath $p.receipt -Encoding UTF8
Write-Host 'ASL: native session ended. Return to ASL Workspace and recheck configuration.'
`;

function openTerminal(program, args, options) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { ...options, detached: true, windowsHide: false, stdio: "ignore", shell: false });
    child.once("error", reject);
    child.once("spawn", () => { child.unref(); resolve(); });
  });
}

async function launchAssistant(request, options = {}) {
  if ((options.platform || process.platform) !== "win32") throw new Error("原生配置助手目前支持 Windows；其他平台尚未验收。");
  if (!["codex-app", "claude-code"].includes(request.id) || !path.isAbsolute(request.executable || "")) throw new Error("请选择已安装的配置助手");
  if (typeof request.brief !== "string" || !request.brief.trim()) throw new Error("缺少原始配置材料");
  const id = randomUUID();
  const directory = path.join(options.root, id);
  await fs.mkdir(directory, { recursive: true });
  const cwd = request.project || directory;
  const args = request.id === "codex-app"
    ? ["--cd", cwd, "--add-dir", directory, "--sandbox", "workspace-write", "--ask-for-approval", "on-request", "--search"]
    : ["--permission-mode", "default", "--add-dir", request.workspace, "--add-dir", directory];
  // A short initial prompt avoids Windows command-line limits; complete materials stay local.
  const briefFile = path.join(directory, "task.md");
  await fs.writeFile(briefFile, request.brief, "utf8");
  const job = path.join(directory, "job.json");
  const prompt = request.brief.length < 500 ? request.brief : `请完整读取本地任务文件 ${JSON.stringify(briefFile)}，按里面的目标完成本机配置。先阅读再行动。沿用当前模型、账号和原生权限，完成后请给出真实验证结果。`;
  await fs.writeFile(job, JSON.stringify({ command: request.executable, cwd, args, prompt, receipt: path.join(directory, "receipt.json") }), "utf8");
  await (options.launch || openTerminal)(path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    ["-NoProfile", "-NoExit", "-EncodedCommand", Buffer.from(runner, "utf16le").toString("base64")],
    { cwd, env: { ...process.env, ASL_SETUP_JOB: job } });
  return { id, job, assistant: request.id, status: "opened" };
}

async function sessionStatus(root, id) {
  if (typeof id !== "string" || !/^[a-f0-9-]{36}$/.test(id)) throw new Error("无效的配置会话");
  const directory = path.join(root, id);
  await fs.access(path.join(directory, "job.json"));
  try {
    const receipt = JSON.parse((await fs.readFile(path.join(directory, "receipt.json"), "utf8")).replace(/^\uFEFF/, ""));
    return { id, status: receipt.exitCode === 0 ? "ended" : "failed", exitCode: receipt.exitCode, finishedAt: receipt.finishedAt };
  } catch (error) {
    if (error.code !== "ENOENT") throw new Error("配置会话结果无法读取，请在原生窗口检查");
    return { id, status: "opened" };
  }
}
module.exports = { assistantInventory, launchAssistant, sessionStatus };
