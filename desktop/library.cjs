const fs = require("node:fs/promises");
const path = require("node:path");
let pending = Promise.resolve();

function viewValue(value) {
  const allowed=['mode','page','view','skill','query','provider','githubUrl'];
  if (!value || typeof value!=='object' || Array.isArray(value) || Object.keys(value).some(k=>!allowed.includes(k)) ||
      Object.values(value).some(v=>typeof v!=='string'||v.length>2048) ||
      value.page && !['modes','skills','discover','updates','agents'].includes(value.page) ||
      value.view && !['map','categories','list'].includes(value.view)) throw new Error('界面位置格式无效');
  return Object.fromEntries(Object.entries(value).filter(([,v])=>v));
}

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
  const views = {};
  for(const root of libraries) {
    try { if(value.views?.[root]) views[root]=viewValue(value.views[root]); } catch {}
  }
  return {
    views,
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
              ["codex-app", "claude-code", "workbuddy"].includes(t.host),
          )
          .slice(0, 30)
      : [],
    repositories: Array.isArray(value.repositories) ? value.repositories.filter(url => typeof url === "string" && /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(?:\/|$)/.test(url)).slice(0, 12) : [],
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
  return updatePreferences(file,value=>({...value,lastLibrary:root,
    libraries:[root,...value.libraries.filter(p=>p!==root)].slice(0,12)}));
}
function updatePreferences(file,update) {
  const next=pending.catch(()=>{}).then(async()=>{
    const value=await update(await readPreferences(file));
    await writePreferences(file,value);
    return value;
  });
  pending=next;
  return next;
}
async function rememberView(file,root,state) {
  root=path.resolve(root);
  const view=viewValue(state);
  return updatePreferences(file,value=>{
    if(!value.libraries.includes(root))throw new Error('请先打开这个工作环境');
    return {...value,views:{...value.views,[root]:view}};
  });
}
module.exports = {
  readPreferences,
  writePreferences,
  rememberLibrary,
  isLibrary,
  rememberView,
  updatePreferences,
};
