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
async function nativeInventory(home = os.homedir()) {
  const definitions = [
    {
      id: "codex-app",
      name: "Codex",
      directory: ".codex",
      file: ".codex/config.toml",
      scopes: ["project"],
    },
    {
      id: "claude-code",
      name: "Claude Code",
      directory: ".claude",
      file: ".claude.json",
      scopes: ["project"],
    },
    {
      id: "deepseek-harness",
      name: "DeepSeek Harness",
      directory: ".dsh",
      scopes: ["preset"],
    },
    { id: "workbuddy", name: "WorkBuddy", directory: ".workbuddy", scopes: [] },
  ];
  const hosts = [];
  for (const definition of definitions) {
    const record = {
      ...definition,
      configured: await exists(path.join(home, definition.directory)),
      connections: null,
    };
    if (definition.file)
      try {
        const file = path.join(home, definition.file);
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
    hosts.push(record);
  }
  const presets = [];
  const presetRoot = path.join(home, ".dsh", ".agent-presets");
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
  return { hosts, presets, home };
}
module.exports = { nativeInventory };
