const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { githubSnapshot } = require('./market.cjs');
const { isLibrary } = require('./library.cjs');
// Reuse inspected snapshots in this App session; never treat the cache as a content source.
const cache = new Map();

async function readRepository(url, { fetch, core, temp, selected, repositories, remember }, signal) {
    const request = (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.any([signal, options.signal].filter(Boolean)) });
    const repo = await githubSnapshot(url, request);
    const key = `${repo.url}:${repo.commit}:${repo.subpath}`;
    const cached = cache.get(key);
    if (cached && await fs.stat(cached.snapshot).then(s => s.isDirectory()).catch(() => false)) {
      signal?.throwIfAborted();
      await remember(url);
      return cached;
    }
    cache.delete(key);
    const response = await request(repo.archive, { signal: AbortSignal.timeout(90000) });
    if (!response.ok) throw new Error(`下载失败（${response.status}），请稍后重试`);
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 64 * 1024 * 1024) throw new Error("仓库超过 64 MB，请在本机下载后选择具体技能目录");
      chunks.push(chunk);
    }
    // Keep downloaded repositories out of deeply nested project/profile paths on Windows.
    const folder = path.join(temp, "asl-github", randomUUID());
    await fs.mkdir(folder, { recursive: true });
    const archive = path.join(folder, "source.zip");
    await fs.writeFile(archive, Buffer.concat(chunks));
    const output = path.join(folder, "content");
    const report = await core("unpack", { source: archive, output }, signal);
    const repositoryRoot = output;
    // ASL repositories explicitly separate active skills from archived packages.
    const requestedPath = path.resolve(repositoryRoot, repo.subpath || "");
    const environment = await isLibrary(requestedPath) ? requestedPath : await isLibrary(repositoryRoot) ? repositoryRoot : null;
    const requested = environment === requestedPath ? path.join(environment, "skills") : requestedPath;
    report.skills = report.skills.filter(s => {
      const relative = path.relative(requested, s.source);
      return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
    });
    for (const skill of report.skills) {
      skill.origin = `${repo.url}/tree/${repo.commit}/${path.relative(repositoryRoot, skill.source).split(path.sep).map(encodeURIComponent).join("/")}`;
      const ancestors = report.repositoryDependencies.filter(d => {
        const file = path.join(output, d.file);
        return file.startsWith(repositoryRoot + path.sep) && path.dirname(file) !== skill.source && skill.source.startsWith(path.dirname(file) + path.sep);
      });
      if (ancestors.length) {
        skill.inspection.status = "needs-review";
        skill.inspection.reasons.push("仓库上层有共享配置，尚未确认能否单独取出：" + ancestors.map(d => path.relative(repositoryRoot, path.join(output, d.file))).join("、"));
      }
      // Preserve repository license notices when a self-contained subfolder is copied.
      for (const file of report.repositoryFiles.filter(file => path.dirname(path.join(output, file)) === repositoryRoot && /^(license|copying|notice)(\.|$)/i.test(path.basename(file)))) {
        const dest = path.join(skill.source, path.basename(file));
        try {
          await fs.copyFile(path.join(output, file), dest, 1);
          skill.inspection.files.push(path.basename(file));
        } catch (error) { if (error.code !== "EEXIST") throw error; }
      }
      selected.add(path.resolve(skill.source));
    }
    let modes = [], modeError = null;
    if (environment) {
      try {
        const catalog = await core("catalog", { workspace: environment }, signal);
        modes = catalog.modes;
        if (environment !== requestedPath && repo.subpath.startsWith("modes/"))
          modes = modes.filter(m => path.resolve(m.path) === requestedPath);
        repositories.set(output, { environment, repo, url: new URL(url).href, modes: new Set(modes.map(m => m.id)) });
      } catch (error) { modeError = error.message; }
    }
    signal?.throwIfAborted();
    await remember(url);
    const result = { ...report, repository: repo.url, commit: repo.commit, snapshot: output, modes, modeError };
    if (cache.size >= 4) cache.delete(cache.keys().next().value);
    cache.set(key, result);
    return result;
}

module.exports = { readRepository };
