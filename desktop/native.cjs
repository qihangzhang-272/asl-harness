const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");
async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}
async function existingDirectory(paths) {
  for (const location of paths) {
    if (!location) continue;
    try { if ((await fs.stat(location)).isDirectory()) return path.resolve(location); } catch {}
  }
}
async function nativeInventory(home = os.homedir(), env = process.env) {
  const codex = path.resolve(env.CODEX_HOME || path.join(home, ".codex"));
  const claude = path.resolve(env.CLAUDE_CONFIG_DIR || path.join(home, ".claude"));
  const dsh = path.join(home, ".dsh");
  const buddy = await existingDirectory([path.join(home, ".workbuddy-ai"), path.join(home, ".workbuddy")]) || path.join(home, ".workbuddy-ai");
  const definitions = [
    {
      id: "codex-app",
      name: "Codex",
      directory: codex,
      file: path.join(codex, "config.toml"),
      skillRoot: path.join(home, ".agents", "skills"),
      scopes: ["project", "user"],
    },
    {
      id: "claude-code",
      name: "Claude Code",
      directory: claude,
      file: env.CLAUDE_CONFIG_DIR ? path.join(claude, ".claude.json") : path.join(home, ".claude.json"),
      skillRoot: path.join(claude, "skills"),
      scopes: ["project", "user"],
    },
    {
      id: "deepseek-harness",
      name: "DeepSeek Harness",
      directory: dsh,
      evidence: [path.join(dsh, "settings.yaml")],
      scopes: ["preset"],
    },
    { id: "workbuddy", name: "WorkBuddy", directory: buddy, file: path.join(buddy, ".mcp.json"),
      evidence: [path.join(buddy, "settings.json"), path.join(buddy, "workspace-state.json")], scopes: [] },
  ];
  const hosts = [];
  for (const definition of definitions) {
    const record = {
      ...definition,
      directoryFound: !!(await existingDirectory([definition.directory])),
      configured: false,
      connections: null,
    };
    const evidence = [definition.file, ...(definition.evidence || [])];
    if (definition.id === "claude-code") evidence.push(path.join(claude, "settings.json"));
    for (const file of evidence.filter(Boolean)) {
      try { if ((await fs.stat(file)).isFile()) { record.configured = true; break; } } catch {}
    }
    delete record.evidence;
    if (definition.file)
      try {
        const file = path.resolve(home, definition.file);
        if ((await fs.stat(file)).size < 2 * 1024 * 1024) {
          const text = await fs.readFile(file, "utf8");
          record.connections =
            definition.id === "codex-app"
              ? [...text.matchAll(/^\s*\[mcp_servers\.([\w-]+)\]/gm)].map(
                  (m) => m[1],
                )
              : Object.keys(JSON.parse(text).mcpServers || {});
        }
      } catch {}
    if (record.scopes.includes("user")) {
      try {
        const saved = JSON.parse(await fs.readFile(path.join(record.directory, ".asl", "user-mode.json"), "utf8"));
        if (saved.version === 1 && saved.host === record.id)
          record.userMode = saved.mode ? { mode: saved.mode, workspace: saved.environment, skills: Object.keys(saved.skills || {}).length, skillsDir: saved.skillRoot } : null;
      } catch {}
    }
    hosts.push(record);
  }
  const presets = [];
  const presetRoot = path.join(dsh, ".agent-presets");
  try {
    for (const entry of await fs.readdir(presetRoot, { withFileTypes: true }))
      if (
        entry.isDirectory() &&
        (await exists(path.join(presetRoot, entry.name, "agent.cordis.yml")))
      )
        presets.push({
          name: entry.name,
          path: path.join(presetRoot, entry.name),
        });
  } catch {}
  if (presets.length) hosts.find(h => h.id === "deepseek-harness").configured = true;
  return { hosts, presets, presetRoot, home };
}
module.exports = { nativeInventory, existingDirectory };
