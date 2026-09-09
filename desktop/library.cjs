const fs = require("node:fs/promises");
const path = require("node:path");

async function isLibrary(root) {
  if (typeof root !== "string" || !path.isAbsolute(root)) return false;
  try {
    return (
      (await fs.stat(path.join(root, "WORKSPACE.md"))).isFile() &&
      (await fs.stat(path.join(root, "modes"))).isDirectory() &&
      (await fs.stat(path.join(root, "skills"))).isDirectory()
    );
  } catch {
    return false;
  }
}
async function readPreferences(file) {
  let value = {};
  try {
    value = JSON.parse(await fs.readFile(file, "utf8"));
  } catch {}
  const libraries = [];
  for (const root of Array.isArray(value.libraries) ? value.libraries : [])
    if (await isLibrary(root)) libraries.push(path.resolve(root));
  return {
    libraries: [...new Set(libraries)].slice(0, 12),
    lastLibrary: libraries.includes(value.lastLibrary)
      ? value.lastLibrary
      : null,
    targets: Array.isArray(value.targets)
      ? value.targets
          .filter(
            (t) =>
              t &&
              typeof t.project === "string" &&
              ["codex-app", "claude-code"].includes(t.host),
          )
          .slice(0, 30)
      : [],
  };
}
async function writePreferences(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(`${file}.tmp`, JSON.stringify(value, null, 2));
  await fs.rename(`${file}.tmp`, file);
}
async function rememberLibrary(file, root) {
  root = path.resolve(root);
  if (!(await isLibrary(root))) throw new Error("这个文件夹不是 ASL 技能库");
  const value = await readPreferences(file);
  value.lastLibrary = root;
  value.libraries = [root, ...value.libraries.filter((p) => p !== root)].slice(
    0,
    12,
  );
  await writePreferences(file, value);
  return value;
}
module.exports = {
  readPreferences,
  writePreferences,
  rememberLibrary,
  isLibrary,
};
