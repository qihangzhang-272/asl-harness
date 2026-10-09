const fs = require('node:fs/promises');
const path = require('node:path');

async function record(file) {
  try {
    if ((await fs.stat(file)).size > 1024 * 1024) return null;
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch { return null; }
}

// Receipts locate a configuration; core verification decides its current state.
async function connections(inventory, core) {
  const rows = [];
  for (const host of inventory.hosts) {
    if (host.userMode?.mode) rows.push({host: host.id, scope: 'user', mode: host.userMode.mode,
      workspace: host.userMode.workspace, skillsDir: host.userMode.skillsDir, location: host.directory});
  }
  for (const project of [...new Set(inventory.projects || [])].slice(0, 64)) {
    for (const host of inventory.hosts.filter(h => h.scopes.includes('project'))) {
      const value = await record(path.join(project, '.asl/host-projections', host.id, 'current.json'));
      if (value?.hostId === host.id) rows.push({host: host.id, scope: 'project', project,
        mode: value.mode, workspace: value.environment, location: project});
    }
  }
  for (const preset of inventory.presets) {
    const value = await record(path.join(preset.path, '.asl-preset-projection.json'));
    if (value?.hostId === 'deepseek-harness') rows.push({host: 'deepseek-harness', scope: 'preset',
      project: preset.path, mode: value.mode, workspace: value.environment,
      basePreset: value.basePreset, location: preset.path});
  }
  const catalogs = new Map();
  const results = [];
  for (const row of rows) {
    if (typeof row.workspace !== 'string' || !path.isAbsolute(row.workspace) || !/^[\w.-]+$/.test(row.mode || '')) continue;
    const id = `${row.host}:${row.scope}:${row.location}`;
    let mode;
    try {
      if (!catalogs.has(row.workspace)) catalogs.set(row.workspace, core('catalog', {workspace: row.workspace}));
      const catalog = await catalogs.get(row.workspace);
      mode = catalog.modes.find(m => m.id === row.mode);
      if (!mode) throw new Error('原模式已移走或归档');
      const values = {workspace: row.workspace, mode: row.mode};
      const report = row.scope === 'user'
        ? await core('userSync', {...values, host: row.host, ...(row.skillsDir && {skillsDir: row.skillsDir})})
        : row.scope === 'preset'
          ? await core('verifyPreset', {...values, output: row.project})
          : await core('verify', {...values, host: row.host, project: row.project});
      const changed = report.needsSync || report.warnings?.length;
      results.push({...row, id, title: mode.title, skills: mode.skills, status: report.conflicts?.length ? 'attention' : changed ? 'outdated' : 'configured',
        issues: [...(report.conflicts || []), ...(report.warnings || [])], discovery: report.discovery || 'native-directory'});
    } catch (error) {
      const upgrade = row.scope === 'preset' && error.code === 'DEEPSEEK_PRESET_UPGRADE_REQUIRED';
      results.push({...row, id, title: mode?.title || row.mode, skills: mode?.skills || [],
        status: upgrade ? 'outdated' : 'attention', ...(upgrade && {repair:'upgrade'}), issues: [error.message],
        diagnostic: {code:error.code, message:error.message, details:error.details}});
    }
  }
  return results;
}

module.exports = {connections};
