function publicUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ["github.com", "awesome-dsh-plugin.com", "www.npmjs.com"].includes(
        u.hostname,
      )
      ? u.href
      : null;
  } catch {
    return null;
  }
}
function parseDshCatalog(data) {
  if (!Array.isArray(data.plugins)) throw new Error("市场返回了无法识别的目录");
  return data.plugins
    .filter((p) => p && typeof p.name === "string" && publicUrl(p.url))
    .map((p) => ({
      id: p.name,
      name: p.name,
      description:
        typeof p.description === "string"
          ? p.description
          : [p.description?.zh, p.description?.en].find(
              (value) => typeof value === "string",
            ) || "",
      url: publicUrl(p.url),
      stars: typeof p.stars === "number" ? p.stars : null,
      kind: "plugin",
      compatibility: "deepseek-harness",
      package: typeof p.npm === "string" ? p.npm : null,
      deprecated: p.deprecated === true,
    }));
}
async function readJson(fetch, url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    headers: { Accept: "application/json", "User-Agent": "ASL-Workspace" },
  });
  if (!response.ok)
    throw new Error(
      response.status === 403
        ? "来源限制了请求频率，请稍后重试"
        : `来源暂时不可用（${response.status}）`,
    );
  const body = await response.text();
  if (body.length > 8 * 1024 * 1024)
    throw new Error("目录过大，请缩小搜索范围");
  return JSON.parse(body);
}
async function discover(provider, query, fetch) {
  if (typeof query !== "string" || query.length > 160)
    throw new Error("请输入简短搜索词");
  if (provider === "dsh") {
    const entries = parseDshCatalog(
      await readJson(fetch, "https://awesome-dsh-plugin.com/plugins.json"),
    );
    const q = query.trim().toLowerCase();
    return entries
      .filter(
        (p) =>
          !p.deprecated &&
          `${p.name} ${p.description}`.toLowerCase().includes(q),
      )
      .slice(0, 100);
  }
  if (provider !== "github") throw new Error("不支持的来源");
  const q = query.trim() || "agent skills";
  const data = await readJson(
    fetch,
    `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&per_page=30`,
  );
  if (!Array.isArray(data.items)) throw new Error("GitHub 未返回项目列表");
  return data.items
    .filter((p) => publicUrl(p.html_url))
    .map((p) => ({
      id: p.full_name,
      name: p.full_name,
      description: p.description || "",
      url: p.html_url,
      stars: p.stargazers_count,
      kind: "repository",
      compatibility: "inspect-required",
    }));
}
function githubRepository(value) {
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error("请输入 GitHub 仓库地址"); }
  if (url.protocol !== "https:" || url.hostname !== "github.com" || url.username || url.password || url.port || url.search)
    throw new Error("目前支持 https://github.com/作者/仓库 地址");
  const parts = url.pathname.replace(/\/$/, "").split("/").slice(1).map(decodeURIComponent);
  const [owner, rawRepo, kind, ...tail] = parts;
  const repo = rawRepo?.replace(/\.git$/, "");
  if (![owner, repo].every(p => /^[A-Za-z0-9_.-]+$/.test(p || "") && ![".", ".."].includes(p)) || (kind && !["tree", "blob"].includes(kind)))
    throw new Error("请输入仓库地址或仓库内的技能目录链接");
  if (tail.some(p => !p || p === "." || p === ".." || /[\\/\0]/.test(p))) throw new Error("技能目录地址无效");
  return { owner, repo, tail, kind, url: `https://github.com/${owner}/${repo}` };
}
async function githubSnapshot(value, fetch) {
  const repo = githubRepository(value);
  const base = `https://api.github.com/repos/${repo.owner}/${repo.repo}`;
  let ref, subpath = [];
  if (repo.tail.length) {
    // Try longest ref first so branch names containing slashes are not silently changed.
    for (let i = repo.tail.length; i > 0; i--) {
      try { ref = await readJson(fetch, `${base}/commits/${encodeURIComponent(repo.tail.slice(0, i).join("/"))}`); subpath = repo.tail.slice(i); break; }
      catch (error) { if (!/404|422/.test(error.message)) throw error; }
    }
    if (!ref) throw new Error("GitHub 分支或版本不存在");
  } else {
    const metadata = await readJson(fetch, base);
    ref = await readJson(fetch, `${base}/commits/${encodeURIComponent(metadata.default_branch)}`);
  }
  if (!/^[a-f0-9]{40}$/.test(ref.sha || "")) throw new Error("GitHub 未返回可核对的版本");
  if (repo.kind === "blob") {
    if (subpath.at(-1) !== "SKILL.md") throw new Error("请选择技能目录或 SKILL.md 链接");
    subpath.pop();
  }
  return { ...repo, commit: ref.sha, subpath: subpath.join("/"),
    archive: `https://codeload.github.com/${repo.owner}/${repo.repo}/zip/${ref.sha}` };
}
module.exports = { publicUrl, parseDshCatalog, discover, githubRepository, githubSnapshot };
